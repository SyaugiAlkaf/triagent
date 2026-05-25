from __future__ import annotations

import re
import time
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app import tools as tool_registry
from app.gateway import Gateway, Message, ProviderError, TraceEvent, provider_family
from app.tools.kubectl import KubectlTool, Pod


SYSTEM_PROMPT = (
    "You are Triagent, a resilient Kubernetes incident-response agent. "
    "You investigate cluster failures using kubectl, Prometheus, and Loki. "
    "Be terse and concrete. Cite tool evidence in every claim."
)


class AgentState(TypedDict, total=False):
    scenario_id: str
    namespace: str
    expected_root_cause: str
    plan: list[str]
    findings: list[str]
    failing_pod: str | None
    hypotheses: str
    hypothesize_provider: str
    hypothesize_confidence: float
    root_cause: str
    confidence: float
    ensemble: dict
    trace: list[dict]


CONF_RX = re.compile(r"confidence\s*[:=]?\s*([01]?\.\d+|1\.0|1)", re.IGNORECASE)

_QUALITATIVE_CONF = [
    (re.compile(r"\bhigh\s+confidence\b", re.IGNORECASE), 0.85),
    (re.compile(r"\bverified\b|\bconfirmed\b", re.IGNORECASE), 0.85),
    (re.compile(r"\bmoderate\s+confidence\b|\blikely\b", re.IGNORECASE), 0.65),
    (re.compile(r"\blow\s+confidence\b|\buncertain\b|\bmanual\s+review\b", re.IGNORECASE), 0.30),
]


def _extract_confidence(text: str, default: float = 0.5) -> float:
    if not text:
        return default
    m = CONF_RX.search(text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    for pat, val in _QUALITATIVE_CONF:
        if pat.search(text):
            return val
    return default


_CONSENSUS_FAMILIES = (
    ("oom", "oomkilled", "memory leak", "memory limit"),
    ("crashloop", "crashloopbackoff", "missing env", "env var", "imagepullback"),
    ("coredns", "dns", "nslookup", "nameserver", "corefile"),
)


def _consensus(hyp_text: str, verify_text: str) -> bool:
    h = (hyp_text or "").lower()
    v = (verify_text or "").lower()
    for family in _CONSENSUS_FAMILIES:
        if any(t in h for t in family) and any(t in v for t in family):
            return True
    return False
HYPOTHESIS_SPLIT_RX = re.compile(r"(?:^|\n)\s*Hypothesis\s+(\d+)", re.IGNORECASE)


def parse_hypotheses(text: str) -> list[dict]:
    """Pull (label, confidence) pairs out of the hypothesize-node output.

    Returns a list of dicts sorted descending by confidence:
      [{"index": int, "label": str, "confidence": float, "body": str}, ...]
    """
    if not text:
        return []
    parts = HYPOTHESIS_SPLIT_RX.split(text)
    # parts is [preamble, idx1, body1, idx2, body2, ...]
    out: list[dict] = []
    for i in range(1, len(parts), 2):
        try:
            idx = int(parts[i])
        except ValueError:
            continue
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        m = CONF_RX.search(body)
        if not m:
            continue
        try:
            conf = float(m.group(1))
        except ValueError:
            continue
        first_line = body.splitlines()[0].strip() if body else ""
        label = f"Hypothesis {idx}: {first_line}" if first_line else f"Hypothesis {idx}"
        out.append({"index": idx, "label": label, "confidence": conf, "body": body})
    out.sort(key=lambda h: h["confidence"], reverse=True)
    return out


def _trace_dict(events: list[TraceEvent]) -> list[dict]:
    return [e.model_dump() for e in events]


def _pod_is_unhealthy(pod: Pod) -> bool:
    if pod.phase not in {"Running", "Succeeded"}:
        return True
    return any(c.restart_count > 0 or not c.ready for c in pod.containers)


def _investigate_via_prometheus(gateway: Gateway, namespace: str) -> list[str]:
    findings: list[str] = []
    try:
        prom = tool_registry.get("prometheus")
    except tool_registry.ToolQuarantinedError:
        gateway.record("tool_quarantine", "prometheus")
        gateway.record("tool_unavailable", "kubectl and prometheus both quarantined")
        findings.append(
            "tool_unavailable: kubectl quarantined and prometheus also quarantined; "
            "hypothesize from prior plan context only"
        )
        return findings
    except tool_registry.ToolNotRegisteredError:
        gateway.record("tool_unavailable", "prometheus not registered")
        findings.append("tool_unavailable: prometheus tool not registered")
        return findings

    gateway.record(
        "tool_call",
        f"prometheus query kube_pod_container_status_restarts_total{{namespace=\"{namespace}\"}}",
    )
    try:
        restarts = prom.query(
            f'kube_pod_container_status_restarts_total{{namespace="{namespace}"}}'
        )
    except Exception as exc:
        gateway.record("tool_error", f"prometheus restarts query failed: {exc}")
        restarts = []
    for s in restarts:
        pod_label = s.metric.get("pod", "?")
        findings.append(
            f"prom: pod={pod_label} ns={namespace} restarts={int(s.value)}"
        )

    gateway.record(
        "tool_call",
        f"prometheus query container_memory_working_set_bytes{{namespace=\"{namespace}\"}}",
    )
    try:
        mem = prom.query(
            f'container_memory_working_set_bytes{{namespace="{namespace}"}}'
        )
    except Exception as exc:
        gateway.record("tool_error", f"prometheus memory query failed: {exc}")
        mem = []
    for s in mem:
        pod_label = s.metric.get("pod", "?")
        findings.append(
            f"prom: pod={pod_label} ns={namespace} memory_pressure={s.value:.2f}"
        )

    if not findings:
        findings.append(
            f"prom: no time-series found for namespace={namespace}; "
            "degraded investigation"
        )
    return findings


def build_agent(gateway: Gateway, kubectl: KubectlTool):
    def plan_node(state: AgentState) -> AgentState:
        plan = [
            "kubectl get pods",
            "kubectl describe failing pod",
            "kubectl logs (with --previous if crashlooping)",
            "form hypotheses from findings",
            "verify top hypothesis",
        ]
        gateway.record("plan", " > ".join(plan))
        return {"plan": plan, "findings": [], "trace": _trace_dict(gateway.trace)}

    def investigate_node(state: AgentState) -> AgentState:
        ns = state["namespace"]
        findings: list[str] = list(state.get("findings", []))
        failing_name: str | None = None

        kubectl_quarantined = tool_registry.is_quarantined("kubectl")
        if kubectl_quarantined:
            gateway.record("tool_quarantine", "kubectl")
            gateway.record("tool_substitute", "kubectl -> prometheus")
            findings.extend(_investigate_via_prometheus(gateway, ns))
            return {
                "findings": findings,
                "failing_pod": failing_name,
                "trace": _trace_dict(gateway.trace),
            }

        gateway.record("tool_call", f"kubectl get pods -n {ns}")
        pods = kubectl.get_pods(ns)
        gateway.record("tool_result", f"pods={len(pods.pods)}")
        for p in pods.pods:
            findings.append(p.summary)

        failing = next((p for p in pods.pods if _pod_is_unhealthy(p)), None)
        if failing is None and pods.pods:
            failing = pods.pods[0]
        if failing is not None:
            failing_name = failing.name
            gateway.record("tool_call", f"kubectl describe pod {failing.name} -n {ns}")
            desc = kubectl.describe_pod(failing.name, ns)
            if desc.events_tail:
                findings.append("events: " + " | ".join(desc.events_tail[-3:]))

            gateway.record(
                "tool_call",
                f"kubectl logs {failing.name} -n {ns} --previous",
            )
            log = kubectl.logs(failing.name, ns, previous=True, tail=40)
            log_text = log.text.strip()
            if log_text:
                findings.append(f"logs[previous]: {log_text[-400:]}")
            else:
                cur = kubectl.logs(failing.name, ns, previous=False, tail=40)
                if cur.text.strip():
                    findings.append(f"logs: {cur.text.strip()[-400:]}")

            for c in failing.containers:
                if c.last and c.last.reason:
                    findings.append(
                        f"container[{c.name}] last={c.last.state} reason={c.last.reason} "
                        f"exit={c.last.exit_code}"
                    )
                if c.current.reason:
                    findings.append(
                        f"container[{c.name}] current={c.current.state} reason={c.current.reason}"
                    )

        return {
            "findings": findings,
            "failing_pod": failing_name,
            "trace": _trace_dict(gateway.trace),
        }

    def hypothesize_node(state: AgentState) -> AgentState:
        findings = state.get("findings", [])
        prompt = (
            f"Scenario: {state.get('scenario_id', '?')}\n"
            f"Namespace: {state.get('namespace', '?')}\n"
            f"Failing pod: {state.get('failing_pod', 'none')}\n\n"
            f"Investigation findings:\n- " + "\n- ".join(findings) + "\n\n"
            "Hypothesize the root cause. Rank hypotheses with confidence in [0,1]. "
            "End with: 'Top hypothesis: <slug>'."
        )
        result = gateway.complete(
            [
                Message(role="system", content=SYSTEM_PROMPT),
                Message(role="user", content=prompt),
            ]
        )
        hyp_conf = _extract_confidence(result.text, default=-1.0)
        return {
            "hypotheses": result.text,
            "hypothesize_provider": result.provider,
            "hypothesize_confidence": hyp_conf if hyp_conf >= 0 else 0.5,
            "trace": _trace_dict(gateway.trace),
        }

    def verify_node(state: AgentState) -> AgentState:
        prompt = (
            f"Given the hypotheses below, verify the top one and produce a final "
            f"root-cause statement plus a remediation in one paragraph.\n\n"
            f"Hypotheses:\n{state.get('hypotheses', '')}\n\n"
            f"Findings:\n- " + "\n- ".join(state.get("findings", [])) + "\n"
        )
        messages = [
            Message(role="system", content=SYSTEM_PROMPT),
            Message(role="user", content=prompt),
        ]
        hyp_provider = state.get("hypothesize_provider", "")
        hyp_family = provider_family(hyp_provider) if hyp_provider else None

        try:
            result = gateway.complete(messages, avoid_family=hyp_family)
        except ProviderError:
            result = gateway.complete(messages)
        verify_family = provider_family(result.provider)
        ensemble_active = bool(hyp_family) and verify_family != hyp_family

        verify_conf = _extract_confidence(result.text, default=-1.0)
        hyp_conf = state.get("hypothesize_confidence", _extract_confidence(state.get("hypotheses", ""), default=-1.0))

        if ensemble_active:
            verify_conf_val = verify_conf if verify_conf >= 0 else 0.5
            hyp_conf_val = hyp_conf if hyp_conf >= 0 else 0.5
            consensus = _consensus(state.get("hypotheses", ""), result.text)
            if consensus and verify_conf_val >= 0.7 and hyp_conf_val >= 0.7:
                confidence = max(verify_conf_val, hyp_conf_val)
            elif consensus:
                confidence = min(verify_conf_val, hyp_conf_val)
            else:
                confidence = max(0.0, max(verify_conf_val, hyp_conf_val) - 0.20)
            ensemble = {
                "hypothesize_provider": hyp_provider,
                "hypothesize_confidence": hyp_conf_val,
                "verify_provider": result.provider,
                "verify_confidence": verify_conf_val,
                "consensus": consensus,
            }
            gateway.trace.append(
                TraceEvent(
                    kind="ensemble_verify",
                    provider=result.provider,
                    detail=(
                        f"pair={hyp_family}+{verify_family} "
                        f"conf={hyp_conf_val:.2f}+{verify_conf_val:.2f} "
                        f"consensus={'yes' if consensus else 'no'}"
                    ),
                )
            )
        else:
            ensemble = {
                "hypothesize_provider": hyp_provider,
                "hypothesize_confidence": hyp_conf if hyp_conf >= 0 else 0.5,
                "verify_provider": result.provider,
                "verify_confidence": verify_conf if verify_conf >= 0 else 0.5,
                "consensus": None,
                "degraded": True,
            }
            gateway.trace.append(
                TraceEvent(
                    kind="ensemble_degraded",
                    provider=result.provider,
                    detail=f"only_family={verify_family} hyp_family={hyp_family}",
                )
            )
            candidates = [c for c in (verify_conf, hyp_conf) if c >= 0]
            confidence = max(candidates) if candidates else 0.5

        return {
            "root_cause": result.text,
            "confidence": confidence,
            "ensemble": ensemble,
            "trace": _trace_dict(gateway.trace),
        }

    builder = StateGraph(AgentState)
    builder.add_node("plan", plan_node)
    builder.add_node("investigate", investigate_node)
    builder.add_node("hypothesize", hypothesize_node)
    builder.add_node("verify", verify_node)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "investigate")
    builder.add_edge("investigate", "hypothesize")
    builder.add_edge("hypothesize", "verify")
    builder.add_edge("verify", END)
    return builder.compile()


def run_investigation(
    *,
    scenario_id: str,
    namespace: str,
    expected_root_cause: str,
    gateway: Gateway,
    kubectl: KubectlTool,
) -> dict:
    started = time.perf_counter()
    gateway.reset_budget()
    graph = build_agent(gateway, kubectl)
    initial: AgentState = {
        "scenario_id": scenario_id,
        "namespace": namespace,
        "expected_root_cause": expected_root_cause,
        "findings": [],
    }
    final: AgentState = graph.invoke(initial)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return {
        "scenario_id": scenario_id,
        "namespace": namespace,
        "failing_pod": final.get("failing_pod"),
        "findings": final.get("findings", []),
        "hypotheses": final.get("hypotheses", ""),
        "root_cause": final.get("root_cause", ""),
        "confidence": final.get("confidence", 0.0),
        "ensemble": final.get("ensemble"),
        "trace": final.get("trace", []),
        "latency_ms": elapsed_ms,
        "tokens_spent": gateway.tokens_spent,
        "token_budget": gateway.token_budget,
        "cost_usd": gateway.cost_usd,
        "cost_by_provider": dict(gateway.cost_by_provider),
    }
