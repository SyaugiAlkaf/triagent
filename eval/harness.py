from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import yaml

from app.agent import build_agent
from app.chaos import get_controller
from app.gateway import Gateway, MockProvider
from app.tools import (
    clear as clear_registry,
    quarantine,
    register,
    restore,
)
from app.tools.kubectl import RemoteKubectlTool
from app.tools.prometheus import RemotePrometheusTool


SCENARIO_KEYWORDS = {
    "crashloop-001": ["crashloop", "env_var_missing", "database", "application", "exit"],
    "oom-002": ["oom", "memory_leak", "memory", "insufficient resources"],
    "dns-003": ["dns", "coredns", "resolution", "resolve", "nameserver"],
}


SCENARIO_SLUG_BY_ID = {
    "crashloop-001": "01-crashloop",
    "oom-002": "02-oom",
    "dns-003": "03-dns",
}


class BrokenKubectl:
    """All operations raise - models baseline behaviour when kubectl is killed and no fallback exists."""

    def get_pods(self, namespace: str):
        raise RuntimeError("kubectl unavailable (baseline + tool_kill, no fallback registered)")

    def describe_pod(self, name: str, namespace: str):
        raise RuntimeError("kubectl unavailable")

    def logs(self, *args, **kwargs):
        raise RuntimeError("kubectl unavailable")


def build_baseline_gateway() -> Gateway:
    return Gateway(
        [MockProvider(name="solo-mock")],
        routing_policy=["solo-mock"],
        chaos=get_controller(),
    )


def build_resilient_gateway() -> Gateway:
    primary = MockProvider(name="primary-mock")
    backup = MockProvider(name="backup-mock")
    return Gateway(
        [primary, backup],
        routing_policy=["primary-mock", "backup-mock"],
        chaos=get_controller(),
    )


def reset_tool_registry(system: str) -> None:
    clear_registry()
    if system == "resilient":
        register("kubectl", RemoteKubectlTool())
        register("prometheus", RemotePrometheusTool())


def score(
    scenario_id: str,
    hypotheses: str,
    root_cause: str,
    confidence: float,
    error: str | None,
) -> bool:
    if error:
        return False
    if confidence < 0.5:
        return False
    blob = (hypotheses + " " + root_cause).lower()
    if not blob.strip():
        return False
    keywords = SCENARIO_KEYWORDS.get(scenario_id, [])
    return any(k in blob for k in keywords)


def apply_chaos(mode: str, system: str) -> None:
    c = get_controller()
    c.clear()
    if mode == "off":
        return
    if mode == "provider_kill":
        target = "solo-mock" if system == "baseline" else "primary-mock"
        c.kill_provider(target)
    elif mode == "tool_kill":
        c.kill_tool("kubectl")
        quarantine("kubectl")
    elif mode == "combined":
        target = "solo-mock" if system == "baseline" else "primary-mock"
        c.kill_provider(target)
        c.kill_tool("kubectl")
        quarantine("kubectl")
        c.set_latency(50)


def _trigger_scenario_on_engine(slug: str, engine_url: str) -> None:
    import httpx
    try:
        with httpx.Client(timeout=2.0) as client:
            client.post(f"{engine_url}/scenarios/reset")
            client.post(f"{engine_url}/scenarios/trigger/{slug}")
    except httpx.HTTPError:
        pass


def run_one(scenario: dict, system: str, chaos_mode: str, replica: int, engine_url: str) -> dict:
    scenario_id = scenario["id"]
    namespace = scenario.get("namespace", "triagent-demo")
    expected = scenario.get("expected_root_cause", "")
    slug = SCENARIO_SLUG_BY_ID.get(scenario_id, scenario.get("slug", scenario_id))

    _trigger_scenario_on_engine(slug, engine_url)

    reset_tool_registry(system)
    apply_chaos(chaos_mode, system)

    gateway = build_baseline_gateway() if system == "baseline" else build_resilient_gateway()
    if system == "baseline" and chaos_mode in {"tool_kill", "combined"}:
        kubectl = BrokenKubectl()
    else:
        kubectl = RemoteKubectlTool(base_url=engine_url)
    gateway.reset_budget()

    started = time.perf_counter()
    error: str | None = None
    final: dict = {}
    try:
        graph = build_agent(gateway, kubectl)
        final = graph.invoke({
            "scenario_id": scenario_id,
            "namespace": namespace,
            "expected_root_cause": expected,
            "findings": [],
        })
    except Exception as exc:
        error = type(exc).__name__ + ": " + str(exc)
    elapsed_ms = (time.perf_counter() - started) * 1000.0

    hypotheses = final.get("hypotheses", "")
    root_cause = final.get("root_cause", "")
    confidence = final.get("confidence", 0.0)
    success = score(scenario_id, hypotheses, root_cause, confidence, error)

    get_controller().clear()
    restore("kubectl")

    return {
        "system": system,
        "chaos_mode": chaos_mode,
        "scenario": scenario_id,
        "replica": replica,
        "success": int(success),
        "confidence": round(confidence, 3),
        "latency_ms": round(elapsed_ms, 1),
        "tokens_spent": gateway.tokens_spent,
        "cost_usd": round(gateway.cost_usd, 6),
        "error": error or "",
    }


def load_scenarios(slugs: list[str]) -> list[dict]:
    out = []
    base = _PROJECT_ROOT / "scenarios"
    for slug in slugs:
        data = yaml.safe_load((base / f"{slug}.yaml").read_text())
        out.append(data)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", default="01-crashloop,02-oom,03-dns")
    ap.add_argument("--systems", default="baseline,resilient")
    ap.add_argument("--chaos-modes", default="off,provider_kill,tool_kill,combined")
    ap.add_argument("--replicas", type=int, default=5)
    ap.add_argument("--out", default="eval/results/runs.csv")
    ap.add_argument(
        "--engine-url",
        default=os.environ.get("SCENARIO_ENGINE_URL", "http://localhost:8002"),
        help="scenario engine base URL",
    )
    args = ap.parse_args()

    os.environ.setdefault("USE_MOCK_LLM", "true")
    engine_url = args.engine_url

    scenarios = load_scenarios(args.scenarios.split(","))
    systems = args.systems.split(",")
    chaos_modes = args.chaos_modes.split(",")

    out_path = _PROJECT_ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "system", "chaos_mode", "scenario", "replica",
        "success", "confidence", "latency_ms", "tokens_spent", "cost_usd", "error",
    ]
    rows: list[dict] = []
    started = time.perf_counter()

    for system in systems:
        for chaos_mode in chaos_modes:
            for scenario in scenarios:
                for replica in range(args.replicas):
                    rec = run_one(scenario, system, chaos_mode, replica, engine_url)
                    rows.append(rec)
                    print(
                        f"{system:9s} {chaos_mode:14s} {scenario['id']:14s} r{replica} "
                        f"success={rec['success']} conf={rec['confidence']:.2f} "
                        f"lat={rec['latency_ms']:.0f}ms"
                    )

    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    total = len(rows)
    elapsed = time.perf_counter() - started
    print()
    print(f"wrote {total} rows to {out_path} in {elapsed:.1f}s")

    from collections import defaultdict
    agg: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in rows:
        agg[(r["system"], r["chaos_mode"])].append(r["success"])
    print()
    print(f"{'system':10s} {'chaos':14s} {'success rate':>14s}")
    print("-" * 42)
    for (system, chaos_mode), vals in sorted(agg.items()):
        rate = 100.0 * sum(vals) / len(vals)
        print(f"{system:10s} {chaos_mode:14s} {rate:>13.1f}%")


if __name__ == "__main__":
    main()
