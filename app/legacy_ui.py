from __future__ import annotations

import html
import json
import os
import sys
import time
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import httpx
import streamlit as st
from dotenv import load_dotenv

from app.agent import parse_hypotheses


load_dotenv()

API_URL = os.environ.get("TRIAGENT_API_URL", "http://localhost:8000")

st.set_page_config(page_title="Triagent", layout="wide", page_icon=":robot_face:")

_CSS = """
<style>
  /* Hero banner */
  .triagent-hero {
    background: linear-gradient(135deg, #1a1c2e 0%, #2a1f4a 50%, #3a1f3a 100%);
    padding: 18px 26px;
    border-radius: 12px;
    border: 1px solid #2c2f44;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .triagent-hero .title-block { line-height: 1.1; }
  .triagent-hero .wordmark {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1.9rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #e6e8ef;
    margin: 0;
  }
  .triagent-hero .tagline {
    font-size: 0.84rem;
    color: #98a0c0;
    margin-top: 4px;
  }
  .triagent-hero .chaos-pill {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .triagent-hero .chaos-pill.clean {
    background: rgba(58, 167, 90, 0.12);
    border-color: rgba(58, 167, 90, 0.45);
    color: #6ad88a;
  }
  .triagent-hero .chaos-pill.active {
    background: rgba(207, 80, 80, 0.16);
    border-color: rgba(207, 80, 80, 0.6);
    color: #ff6b6b;
    animation: triagent-pulse 1.1s ease-in-out infinite alternate;
  }
  @keyframes triagent-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(207, 80, 80, 0.55); transform: scale(1.0); }
    100% { box-shadow: 0 0 18px 4px rgba(207, 80, 80, 0.0); transform: scale(1.04); }
  }

  /* Trace events */
  .trace-line {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.84rem;
    padding: 3px 10px;
    border-left: 3px solid #2c2f44;
    margin: 2px 0;
    background: rgba(255, 255, 255, 0.015);
    border-radius: 0 4px 4px 0;
    color: #c4c8da;
    white-space: pre-wrap;
  }
  .trace-line.t-plan       { border-left-color: #7c5cff; color: #b6a8ff; }
  .trace-line.t-tool       { border-left-color: #4ea3d1; color: #9bd0ee; }
  .trace-line.t-provider   { border-left-color: #6ad88a; color: #afe8be; }
  .trace-line.t-fallback   { border-left-color: #a974ff; color: #d3bcff; background: rgba(124, 92, 255, 0.10); }
  .trace-line.t-error      { border-left-color: #f0a23a; color: #ffc785; }
  .trace-line.t-chaos      { border-left-color: #ff5a5a; color: #ff9d9d; background: rgba(207, 80, 80, 0.12); }
  .trace-line.t-budget     { border-left-color: #ff5a5a; color: #ffb0b0; background: rgba(207, 80, 80, 0.18); font-weight: 700; }
</style>
"""
st.markdown(_CSS, unsafe_allow_html=True)


def _render_hero(chaos_state: dict | None = None) -> None:
    chaos_state = chaos_state or {}
    killed_p = chaos_state.get("killed_providers", [])
    killed_t = chaos_state.get("killed_tools", [])
    inject_ms = float(chaos_state.get("injected_latency_ms", 0) or 0)
    active = bool(killed_p or killed_t or inject_ms > 0)
    if active:
        bits = []
        if killed_p: bits.append(f"{len(killed_p)} provider")
        if killed_t: bits.append(f"{len(killed_t)} tool")
        if inject_ms > 0: bits.append(f"{inject_ms:.0f}ms")
        pill_html = f'<div class="chaos-pill active">CHAOS ACTIVE - {", ".join(bits)}</div>'
    else:
        pill_html = '<div class="chaos-pill clean">stable</div>'
    st.markdown(
        f"""
<div class="triagent-hero">
  <div class="title-block">
    <p class="wordmark">TRIAGENT</p>
    <div class="tagline">Resilient K8s incident agent - survives infrastructure chaos in its own tooling</div>
  </div>
  {pill_html}
</div>
""",
        unsafe_allow_html=True,
    )


def _fetch_chaos_safe() -> dict:
    try:
        return _api_get("/chaos")
    except Exception:
        return {}

def _api_get(path: str, **params):
    with httpx.Client(timeout=180.0) as client:
        r = client.get(f"{API_URL}{path}", params=params)
        r.raise_for_status()
        return r.json()


_render_hero(_fetch_chaos_safe())


def _reap_finished_investigation() -> None:
    """If there is an active investigation that has already finished server-side,
    commit its result to session_state and clear active_id so cards re-enable
    and the Replay tab sees last_trace - regardless of which tab is rendered.
    """
    inv_id = st.session_state.get("active_investigation_id")
    if not inv_id:
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(f"{API_URL}/investigations/{inv_id}")
            r.raise_for_status()
            s = r.json()
    except Exception:
        return
    if s.get("status") in {"done", "failed"}:
        if s.get("status") == "done":
            st.session_state["last_trace"] = s.get("trace") or []
            st.session_state["last_result"] = s.get("result") or {}
        st.session_state["active_investigation_id"] = None


_reap_finished_investigation()

tab_live, tab_console = st.tabs(
    ["Operations", "Demo Engineering"]
)


def _api_post(path: str, **params):
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{API_URL}{path}", params=params)
        r.raise_for_status()
        return r.json()


def _api_post_json(path: str, body: dict):
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{API_URL}{path}", json=body)
        r.raise_for_status()
        return r.json()


def _render_trace(trace: list[dict]) -> None:
    if not trace:
        st.info("No trace events yet for this run.")
        return
    st.caption(f"{len(trace)} events")
    lines = []
    for ev in trace:
        kind = ev.get("kind", "?")
        provider = ev.get("provider") or ""
        latency = ev.get("latency_ms")
        detail = ev.get("detail", "")
        bits = [kind]
        if provider:
            bits.append(f"[{provider}]")
        if latency is not None:
            bits.append(f"{latency:.0f}ms")
        if detail:
            bits.append(detail)
        line = html.escape(" ".join(bits))
        klass = _trace_class(kind)
        lines.append(f'<div class="trace-line {klass}">{line}</div>')
    st.markdown(
        '<div class="trace-stream">' + "\n".join(lines) + "</div>",
        unsafe_allow_html=True,
    )
    with st.expander("trace as plain text (fallback)", expanded=False):
        plain = "\n".join(
            " ".join(
                str(p) for p in [
                    ev.get("kind", "?"),
                    f"[{ev.get('provider')}]" if ev.get("provider") else "",
                    f"{ev['latency_ms']:.0f}ms" if ev.get("latency_ms") is not None else "",
                    ev.get("detail", ""),
                ] if p
            )
            for ev in trace
        )
        st.code(plain, language="text")


def _trace_class(kind: str) -> str:
    if kind == "chaos_inject":
        return "t-chaos"
    if kind in {"provider_error", "tool_error"}:
        return "t-error"
    if kind in {"provider_fallback", "tool_substitute"}:
        return "t-fallback"
    if kind in {"tool_quarantine", "provider_quarantine"}:
        return "t-chaos"
    if kind in {"tool_unavailable", "budget_exceeded"}:
        return "t-budget"
    if kind == "plan":
        return "t-plan"
    if kind.startswith("tool_"):
        return "t-tool"
    if kind.startswith("provider_"):
        return "t-provider"
    return ""


def _render_verdict_card(state: dict) -> None:
    result = state.get("result") or {}
    if not result:
        return
    st.success(
        f"Verdict ready - failing pod: `{result.get('failing_pod') or 'none'}`"
    )
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Confidence", f"{result.get('confidence', 0.0):.2f}")
    m2.metric("Latency", f"{result.get('latency_ms', 0):.0f} ms")
    tok = state.get("tokens_spent", 0) or result.get("tokens_spent", 0)
    cap = state.get("token_budget", 0) or result.get("token_budget", 0) or 1
    m3.metric("Tokens", f"{tok}/{cap}", delta=f"{100*tok/cap:.0f}% of budget")
    m4.metric("Cost (USD)", f"${state.get('cost_usd', 0.0) or result.get('cost_usd', 0.0):.5f}")
    cbp = state.get("cost_by_provider") or result.get("cost_by_provider") or {}
    if cbp:
        st.caption(
            "cost by provider: " + ", ".join(f"`{k}` ${v:.5f}" for k, v in cbp.items())
        )

    st.subheader("Root cause")
    st.write(result.get("root_cause") or "(empty)")

    st.subheader("Hypotheses")
    ranked = parse_hypotheses(result.get("hypotheses", "") or "")
    if ranked:
        for h in ranked:
            st.markdown(f"**{h['label']}**")
            st.progress(
                min(max(h["confidence"], 0.0), 1.0),
                text=f"confidence {h['confidence']:.2f}",
            )
    else:
        st.code(result.get("hypotheses", "") or "(empty)", language="markdown")

    with st.expander("Findings (raw evidence)", expanded=False):
        for f in result.get("findings", []):
            st.markdown(f"- {f}")


@st.fragment(run_every=0.5)
def _active_investigation_block(inv_id: str) -> None:
    try:
        state = _api_get(f"/investigations/{inv_id}")
    except Exception as exc:
        st.error(f"Cannot read investigation: {exc}")
        return

    status = state.get("status", "queued")
    phase = state.get("phase", "queued")
    detail = state.get("phase_detail") or ""
    trace = state.get("trace") or []
    elapsed_ms = (
        ((state.get("finished_at") or time.time()) - state["started_at"]) * 1000.0
    )

    header_left, header_right = st.columns([3, 2])
    with header_left:
        scenario = state.get("scenario_slug", "?")
        st.markdown(f"### Investigating: `{scenario}` ({inv_id[:8]})")
        st.caption(
            f"status: **{status}** | phase: **{phase}** | {detail}"
        )
    with header_right:
        st.metric("Elapsed", f"{elapsed_ms:.0f} ms")
        st.caption(f"{len(trace)} trace events")

    st.markdown("#### Live trace")
    _render_trace(trace)

    if status in {"done", "failed"}:
        if status == "done":
            st.session_state["last_trace"] = trace
            st.session_state["last_result"] = state.get("result") or {}
        else:
            st.error(f"Investigation failed: {state.get('error') or 'unknown error'}")
        if st.session_state.get("active_investigation_id") == inv_id:
            st.session_state["active_investigation_id"] = None
            st.rerun(scope="app")


with tab_live:
    health: dict = {}
    try:
        health = _api_get("/healthz")
    except Exception as exc:
        st.error(f"Cannot reach API at {API_URL}. Start `make api` first.\n\n{exc}")

    status_col_left, status_col_right = st.columns([3, 2])
    with status_col_left:
        st.markdown("### Incident inbox")
        st.caption(
            "Pods currently in a degraded state. Click Investigate to trigger Triagent. "
            "Chaos set in the Demo Engineering tab applies live to the next investigation."
        )
    with status_col_right:
        if health:
            st.metric(
                "LLM mode",
                "mock" if health.get("mock_llm", "true").lower() == "true" else "real",
            )
            st.caption(f"Context: `{health.get('context')}`")
        chaos_now = _fetch_chaos_safe()
        kp = chaos_now.get("killed_providers", [])
        kt = chaos_now.get("killed_tools", [])
        lat = float(chaos_now.get("injected_latency_ms", 0) or 0)
        if kp or kt or lat > 0:
            bits = []
            if kp: bits.append("providers=" + ",".join(kp))
            if kt: bits.append("tools=" + ",".join(kt))
            if lat > 0: bits.append(f"+{lat:.0f}ms")
            st.warning("Chaos armed: " + " | ".join(bits))

    try:
        incidents_list = _api_get("/incidents")
    except Exception as exc:
        st.error(f"Cannot reach /incidents: {exc}")
        incidents_list = []

    active_id = st.session_state.get("active_investigation_id")

    cols = st.columns(max(1, len(incidents_list)))
    for col, inc in zip(cols, incidents_list):
        with col:
            slug = inc["slug"]
            with st.container(border=True):
                st.markdown(f"**{inc['name']}**")
                st.caption(f"`{slug}` - ns `{inc['namespace']}`")
                st.markdown(":red[**FAILING**]")
                if inc.get("latest_status") == "done":
                    st.caption(f"last verdict: `{inc.get('latest_investigation_id', '')[:8]}`")
                disabled = active_id is not None
                if st.button(
                    "Investigate",
                    key=f"go_{slug}",
                    type="primary",
                    use_container_width=True,
                    disabled=disabled,
                ):
                    try:
                        r = _api_post_json(
                            "/investigations",
                            {"scenario": slug, "cleanup": True, "wait_seconds": 40},
                        )
                        st.session_state["active_investigation_id"] = r["id"]
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to start: {exc}")

    st.divider()

    if active_id:
        _active_investigation_block(active_id)
    else:
        last_result = st.session_state.get("last_result")
        if last_result:
            st.markdown("### Last verdict")
            _render_verdict_card({"result": last_result, **last_result})
        else:
            st.info("Click Investigate on a card above to dispatch the agent.")


with tab_console:
    st.markdown("### Simulate infrastructure failure")
    st.caption(
        "This tab is the demo harness, not a product feature. In production these failures "
        "happen on their own (LLM provider outage, MCP server failure, slow APIs). "
        "Here you trigger them on purpose so judges can watch Triagent recover. "
        "Open Operations to see the agent react live."
    )

    try:
        chaos = _api_get("/chaos")
    except Exception as exc:
        st.error(f"Cannot reach chaos API: {exc}")
        chaos = {"killed_providers": [], "killed_tools": [], "injected_latency_ms": 0.0}

    killed = set(chaos.get("killed_providers", []))
    killed_tools = set(chaos.get("killed_tools", []))
    inject_ms = float(chaos.get("injected_latency_ms", 0))

    state_col, button_col = st.columns([2, 3])
    with state_col:
        st.markdown("**Active chaos**")
        if not killed and not killed_tools and inject_ms == 0:
            st.success("clean - no chaos active")
        if killed:
            st.markdown(":red[killed providers:] " + ", ".join(f"`{p}`" for p in sorted(killed)))
        if killed_tools:
            st.markdown(":red[killed tools:] " + ", ".join(f"`{t}`" for t in sorted(killed_tools)))
        if inject_ms > 0:
            st.markdown(f":red[latency injection:] `{inject_ms:.0f}ms`")

    with button_col:
        st.markdown("**Provider kills**")
        b1, b2, b3 = st.columns(3)
        with b1:
            if st.button("Kill Groq", use_container_width=True):
                _api_post("/chaos/kill_provider/groq"); st.rerun()
        with b2:
            if st.button("Kill Ollama", use_container_width=True):
                _api_post("/chaos/kill_provider/ollama"); st.rerun()
        with b3:
            if st.button("Kill Mock", use_container_width=True):
                _api_post("/chaos/kill_provider/mock"); st.rerun()

        st.markdown("**Tool quarantine**")
        t1, t2, t3 = st.columns(3)
        with t1:
            if st.button("Kill kubectl", use_container_width=True, help="agent reroutes via prometheus"):
                _api_post("/chaos/kill_tool/kubectl"); st.rerun()
        with t2:
            if st.button("Kill prometheus", use_container_width=True):
                _api_post("/chaos/kill_tool/prometheus"); st.rerun()
        with t3:
            if st.button("Restore tools", use_container_width=True):
                _api_post("/chaos/restore_tool/kubectl")
                _api_post("/chaos/restore_tool/prometheus")
                _api_post("/chaos/restore_tool/loki")
                st.rerun()

        st.markdown("**Latency / reset**")
        l1, l2, l3 = st.columns(3)
        with l1:
            if st.button("Inject 5s latency", use_container_width=True):
                _api_post("/chaos/set_latency", ms=5000); st.rerun()
        with l2:
            if st.button(
                "Inject 12s latency",
                use_container_width=True,
                help="exceeds 8s brownout threshold - EWMA deprioritises this provider",
            ):
                _api_post("/chaos/set_latency", ms=12000); st.rerun()
        with l3:
            if st.button("Clear all", type="primary", use_container_width=True):
                _api_post("/chaos/clear"); st.rerun()

    st.divider()
    st.markdown("### Replay - scrub through the last investigation")
    trace = st.session_state.get("last_trace", []) or []
    if not trace:
        st.info("Run an investigation in Live Investigation first - the trace appears here.")
    else:
        st.caption(f"{len(trace)} trace events. Drag the slider to inspect any step.")
        max_idx = len(trace) - 1
        idx = st.slider("Step", 0, max_idx, max_idx, key="replay_idx") if max_idx > 0 else 0
        ev = trace[idx]
        kind = ev.get("kind", "?")
        provider = ev.get("provider") or "-"
        latency = ev.get("latency_ms")
        st.markdown(
            f"**Step {idx + 1} / {len(trace)}** - kind: `{kind}` - provider: `{provider}`"
            + (f" - {latency:.0f}ms" if latency is not None else "")
        )
        detail = ev.get("detail") or ""
        if detail:
            st.markdown(f"**Detail:** {detail}")
        with st.expander("Full event payload (JSON)", expanded=False):
            st.code(json.dumps(ev, indent=2, default=str), language="json")

    st.divider()
    st.markdown("### Chaos eval - 120 runs")
    st.caption(
        "Baseline (single-provider, no fallback) vs full Triagent across 4 chaos modes. "
        "Mock mode, 5 replicas per cell. Built by `eval/harness.py`."
    )

    results_dir = _PROJECT_ROOT / "eval" / "results"
    chart_path = results_dir / "chaos_eval.png"
    csv_path = results_dir / "runs.csv"

    chart_col, summary_col = st.columns([3, 2])
    with chart_col:
        if chart_path.exists():
            st.image(str(chart_path), use_container_width=True)
        else:
            st.info("Run `python -m eval.harness` then `python -m eval.plot` first.")

    with summary_col:
        st.markdown("**Headline**")
        if csv_path.exists():
            import csv as _csv
            from collections import defaultdict
            with csv_path.open() as f:
                rows = list(_csv.DictReader(f))
            agg: dict[tuple[str, str], list[int]] = defaultdict(list)
            for r in rows:
                agg[(r["system"], r["chaos_mode"])].append(int(r["success"]))
            for system in ("baseline", "resilient"):
                st.markdown(f"_{system}_")
                for mode in ("off", "provider_kill", "tool_kill", "combined"):
                    vals = agg.get((system, mode), [])
                    if not vals:
                        continue
                    rate = 100.0 * sum(vals) / len(vals)
                    bar = (
                        "[==========]"
                        if rate >= 99
                        else "[ - empty -]"
                        if rate < 1
                        else f"[{int(rate/10)*'='}{(10-int(rate/10))*' '}]"
                    )
                    st.markdown(f"`{mode:14s}` {bar} {rate:5.1f}%")
        else:
            st.info("No runs.csv yet.")
