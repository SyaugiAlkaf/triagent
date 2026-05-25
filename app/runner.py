from __future__ import annotations

import os
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

import yaml

from app.agent import run_investigation
from app.gateway import Gateway, build_default_gateway
from app.tools.kubectl import KubectlError, KubectlProtocol, KubectlTool, RemoteKubectlTool


_SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "scenarios"

Status = Literal["queued", "running", "done", "failed"]
Phase = Literal[
    "queued",
    "applying_manifest",
    "waiting_for_failure",
    "investigating",
    "cleanup",
    "done",
    "failed",
]


BroadcastCallback = Callable[[str, dict[str, Any]], None]


@dataclass
class InvestigationState:
    id: str
    scenario_slug: str
    scenario_id: str
    namespace: str
    status: Status = "queued"
    phase: Phase = "queued"
    phase_detail: str = ""
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    result: dict | None = None
    error: str | None = None
    gateway: Gateway | None = None
    counterfactual_of: str | None = None
    chaos_override: dict | None = None

    def snapshot(self) -> dict[str, Any]:
        trace_snapshot: list[dict] = []
        if self.gateway is not None:
            for ev in list(self.gateway.trace):
                trace_snapshot.append(ev.model_dump(mode="json"))
        out: dict[str, Any] = {
            "id": self.id,
            "scenario_slug": self.scenario_slug,
            "scenario_id": self.scenario_id,
            "namespace": self.namespace,
            "status": self.status,
            "phase": self.phase,
            "phase_detail": self.phase_detail,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "trace": trace_snapshot,
            "error": self.error,
        }
        if self.result is not None:
            out["result"] = self.result
        else:
            out["result"] = None
        live_tokens = 0
        live_cost = 0.0
        live_cost_by_provider: dict[str, float] = {}
        if self.gateway is not None:
            live_tokens = self.gateway.tokens_spent
            live_cost = self.gateway.cost_usd
            live_cost_by_provider = dict(self.gateway.cost_by_provider)
        out["tokens_spent"] = live_tokens
        out["token_budget"] = (
            self.gateway.token_budget if self.gateway is not None else 0
        )
        out["cost_usd"] = live_cost
        out["cost_by_provider"] = live_cost_by_provider
        out["counterfactual_of"] = self.counterfactual_of
        out["chaos_override"] = self.chaos_override
        return out


class _SingleInflightError(RuntimeError):
    pass


class InvestigationManager:
    def __init__(self, max_states: int = 20):
        self._states: OrderedDict[str, InvestigationState] = OrderedDict()
        self._max_states = max_states
        self._active_id: str | None = None
        self._lock = threading.Lock()
        self._broadcast: BroadcastCallback | None = None

    def set_broadcast(self, cb: BroadcastCallback | None) -> None:
        self._broadcast = cb

    def _emit(self, type_: str, payload: dict[str, Any]) -> None:
        if self._broadcast is None:
            return
        try:
            self._broadcast(type_, payload)
        except Exception:
            pass

    def has_active(self) -> bool:
        return self._active_id is not None

    def get(self, inv_id: str) -> InvestigationState | None:
        return self._states.get(inv_id)

    def list_recent(self, limit: int = 10) -> list[InvestigationState]:
        return list(self._states.values())[-limit:][::-1]

    def latest_for(self, scenario_slug: str) -> InvestigationState | None:
        for s in reversed(self._states.values()):
            if s.scenario_slug == scenario_slug:
                return s
        return None

    def start(
        self,
        scenario_slug: str,
        cleanup: bool = False,
        wait_seconds: int = 35,
        counterfactual_of: str | None = None,
        chaos_override: dict | None = None,
    ) -> InvestigationState:
        path = _SCENARIOS_DIR / f"{scenario_slug}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"unknown scenario: {scenario_slug}")
        data = yaml.safe_load(path.read_text())
        scenario_id = data.get("id", scenario_slug)
        namespace = data.get("namespace", "triagent-demo")

        with self._lock:
            if self._active_id is not None:
                raise _SingleInflightError(
                    f"investigation {self._active_id} is already running"
                )
            inv_id = uuid.uuid4().hex[:12]
            state = InvestigationState(
                id=inv_id,
                scenario_slug=scenario_slug,
                scenario_id=scenario_id,
                namespace=namespace,
                counterfactual_of=counterfactual_of,
                chaos_override=chaos_override,
            )
            self._states[inv_id] = state
            self._active_id = inv_id
            while len(self._states) > self._max_states:
                self._states.popitem(last=False)

        self._emit("investigation_state", state.snapshot())
        t = threading.Thread(
            target=self._run,
            args=(state, data, cleanup, wait_seconds),
            daemon=True,
            name=f"investigation-{inv_id}",
        )
        t.start()
        return state

    def _start_trace_watcher(self, state: InvestigationState, stop: threading.Event) -> threading.Thread:
        def loop() -> None:
            seen = 0
            while not stop.wait(0.10):
                gw = state.gateway
                if gw is None:
                    continue
                trace = list(gw.trace)
                if len(trace) > seen:
                    for ev in trace[seen:]:
                        try:
                            payload = ev.model_dump(mode="json")
                        except Exception:
                            payload = {"kind": "unknown"}
                        payload["investigation_id"] = state.id
                        self._emit("trace_event", payload)
                    seen = len(trace)

        t = threading.Thread(target=loop, daemon=True, name=f"trace-watch-{state.id}")
        t.start()
        return t

    def _run(self, state: InvestigationState, data: dict, cleanup: bool, wait_seconds: int) -> None:
        from app.chaos import get_controller
        from app.main import _render_manifests, _wait_until_unhealthy

        chaos_ctl = get_controller()
        prior_chaos_snapshot: dict | None = None
        if state.chaos_override is not None:
            prior_chaos_snapshot = chaos_ctl.state.snapshot()
            chaos_ctl.clear()
            for p in state.chaos_override.get("killed_providers", []) or []:
                chaos_ctl.kill_provider(p)
            for t in state.chaos_override.get("killed_tools", []) or []:
                chaos_ctl.kill_tool(t)
            if state.chaos_override.get("injected_latency_ms"):
                chaos_ctl.set_latency(float(state.chaos_override["injected_latency_ms"]))
            if state.chaos_override.get("poison_json"):
                chaos_ctl.set_poison_json(True)

        remote_mode = bool(os.environ.get("SCENARIO_ENGINE_URL"))
        kubectl: KubectlProtocol = (
            RemoteKubectlTool() if remote_mode else KubectlTool()
        )
        manifests_yaml = "" if remote_mode else _render_manifests(data)
        try:
            state.status = "running"
            if remote_mode:
                state.phase = "applying_manifest"
                state.phase_detail = "scenario-engine: skipping real apply"
                self._emit("investigation_state", state.snapshot())
            else:
                state.phase = "applying_manifest"
                state.phase_detail = f"kubectl apply -f - (ns={state.namespace})"
                self._emit("investigation_state", state.snapshot())
                kubectl.ensure_namespace(state.namespace)
                if manifests_yaml:
                    kubectl.apply_manifest(manifests_yaml)

                    state.phase = "waiting_for_failure"
                    state.phase_detail = f"waiting up to {wait_seconds}s for a pod to fail"
                    self._emit("investigation_state", state.snapshot())
                    _wait_until_unhealthy(kubectl, state.namespace, wait_seconds)
        except KubectlError as exc:
            state.status = "failed"
            state.phase = "failed"
            state.error = f"kubectl setup failed: {exc}"
            state.finished_at = time.time()
            self._emit("investigation_state", state.snapshot())
            with self._lock:
                if self._active_id == state.id:
                    self._active_id = None
            return

        gateway = build_default_gateway()
        state.gateway = gateway
        state.phase = "investigating"
        state.phase_detail = "agent plan -> investigate -> hypothesize -> verify"
        self._emit("investigation_state", state.snapshot())

        stop = threading.Event()
        watcher = self._start_trace_watcher(state, stop)
        try:
            result = run_investigation(
                scenario_id=state.scenario_id,
                namespace=state.namespace,
                expected_root_cause=data.get("expected_root_cause", ""),
                gateway=gateway,
                kubectl=kubectl,
            )
            state.result = result
            state.status = "done"
            state.phase = "done"
            state.phase_detail = "verdict ready"
        except Exception as exc:
            state.status = "failed"
            state.phase = "failed"
            state.error = f"{type(exc).__name__}: {exc}"
        finally:
            stop.set()
            watcher.join(timeout=1.0)
            if cleanup and manifests_yaml:
                state.phase = "cleanup"
                state.phase_detail = "kubectl delete -f -"
                try:
                    kubectl.delete_manifest(manifests_yaml)
                except KubectlError:
                    pass
            state.finished_at = time.time()
            if state.status == "done":
                state.phase = "done"
                state.phase_detail = "verdict ready"
            elif state.status == "running":
                state.status = "done"
                state.phase = "done"
            if prior_chaos_snapshot is not None:
                chaos_ctl.clear()
                for p in prior_chaos_snapshot.get("killed_providers", []):
                    chaos_ctl.kill_provider(p)
                for t in prior_chaos_snapshot.get("killed_tools", []):
                    chaos_ctl.kill_tool(t)
                if prior_chaos_snapshot.get("injected_latency_ms"):
                    chaos_ctl.set_latency(float(prior_chaos_snapshot["injected_latency_ms"]))
                if prior_chaos_snapshot.get("poison_json"):
                    chaos_ctl.set_poison_json(True)
            with self._lock:
                if self._active_id == state.id:
                    self._active_id = None
            self._emit("investigation_state", state.snapshot())


    def replay(
        self,
        original_id: str,
        chaos_override: dict,
        from_step: int = 0,
    ) -> InvestigationState:
        original = self.get(original_id)
        if original is None:
            raise FileNotFoundError(f"unknown investigation: {original_id}")
        if original.status not in {"done", "failed"}:
            raise _SingleInflightError(
                f"cannot replay until original {original_id} reaches a terminal status"
            )
        return self.start(
            original.scenario_slug,
            cleanup=False,
            counterfactual_of=original_id,
            chaos_override=chaos_override,
        )


_manager: InvestigationManager | None = None


def get_manager() -> InvestigationManager:
    global _manager
    if _manager is None:
        _manager = InvestigationManager()
    return _manager
