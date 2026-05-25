from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class PodFixture:
    name: str
    phase: str
    container: str
    restart_count: int
    current_state: str
    current_reason: str | None
    last_state: str | None
    last_reason: str | None
    last_exit: int | None
    ready: bool

    def to_get_pods(self, namespace: str) -> dict[str, Any]:
        current = {
            "state": self.current_state,
            "reason": self.current_reason,
            "message": None,
            "exit_code": None,
        }
        last = None
        if self.last_state:
            last = {
                "state": self.last_state,
                "reason": self.last_reason,
                "message": None,
                "exit_code": self.last_exit,
            }
        return {
            "name": self.name,
            "namespace": namespace,
            "phase": self.phase,
            "reason": self.current_reason,
            "message": None,
            "containers": [
                {
                    "name": self.container,
                    "ready": self.ready,
                    "restart_count": self.restart_count,
                    "current": current,
                    "last": last,
                }
            ],
        }


@dataclass
class Scenario:
    slug: str
    scenario_id: str
    name: str
    namespace: str
    severity: str
    summary: str
    pod: PodFixture
    describe_text: str
    log_previous: str
    log_current: str
    events_tail: list[str]
    prometheus_samples: dict[str, list[dict[str, Any]]]
    loki_lines: list[str]
    active: bool = False
    triggered_at: float | None = None

    def alert_payload(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "id": self.scenario_id,
            "name": self.name,
            "namespace": self.namespace,
            "severity": self.severity,
            "summary": self.summary,
            "triggered_at": self.triggered_at,
        }


def _build_scenarios() -> dict[str, Scenario]:
    out: dict[str, Scenario] = {}

    out["01-crashloop"] = Scenario(
        slug="01-crashloop",
        scenario_id="crashloop-001",
        name="CrashLoopBackOff: missing env var",
        namespace="triagent-demo",
        severity="P1",
        summary="payments-api container is crashlooping; DATABASE_URL not set",
        pod=PodFixture(
            name="payments-api-0",
            phase="Running",
            container="app",
            restart_count=7,
            current_state="waiting",
            current_reason="CrashLoopBackOff",
            last_state="terminated",
            last_reason="Error",
            last_exit=1,
            ready=False,
        ),
        describe_text=(
            "Name:         payments-api-0\n"
            "Namespace:    triagent-demo\n"
            "Status:       Running\n"
            "Containers:\n"
            "  app:\n"
            "    Last State: Terminated\n"
            "    Reason: Error\n"
            "    Exit Code: 1\n"
            "Events:\n"
            "  Warning  BackOff  back-off restarting failed container"
        ),
        log_previous=(
            "[INFO] starting payments-api\n"
            "[FATAL] DATABASE_URL is required but missing from env\n"
            "exited with code 1"
        ),
        log_current="",
        events_tail=[
            "Warning  BackOff  Back-off restarting failed container",
            "Normal   Pulled   Successfully pulled image",
        ],
        prometheus_samples={
            "kube_pod_container_status_restarts_total": [
                {"pod": "payments-api-0", "namespace": "triagent-demo", "value": 7.0}
            ],
            "container_memory_working_set_bytes": [
                {"pod": "payments-api-0", "namespace": "triagent-demo", "value": 0.18}
            ],
        },
        loki_lines=[
            "FATAL DATABASE_URL is required",
            "exited with code 1",
        ],
    )

    out["02-oom"] = Scenario(
        slug="02-oom",
        scenario_id="oom-002",
        name="OOMKilled cascade: memory leak in worker",
        namespace="triagent-demo",
        severity="P1",
        summary="worker-leaker OOMKilled 5x; node memory pressure rising",
        pod=PodFixture(
            name="worker-leaker-0",
            phase="Running",
            container="leaker",
            restart_count=5,
            current_state="waiting",
            current_reason="CrashLoopBackOff",
            last_state="terminated",
            last_reason="OOMKilled",
            last_exit=137,
            ready=False,
        ),
        describe_text=(
            "Name:         worker-leaker-0\n"
            "Namespace:    triagent-demo\n"
            "Status:       Running\n"
            "Containers:\n"
            "  leaker:\n"
            "    Last State: Terminated\n"
            "    Reason: OOMKilled\n"
            "    Exit Code: 137\n"
            "Limits:\n"
            "    memory: 64Mi"
        ),
        log_previous=(
            "[INFO] worker starting, allocating buffers\n"
            "MemoryError: allocating 200MB heap into 64Mi limit\n"
            "Killed"
        ),
        log_current="",
        events_tail=[
            "Warning  OOMKilled  Container leaker terminated by OOM killer",
            "Warning  BackOff    Back-off restarting failed container",
        ],
        prometheus_samples={
            "kube_pod_container_status_restarts_total": [
                {"pod": "worker-leaker-0", "namespace": "triagent-demo", "value": 5.0}
            ],
            "container_memory_working_set_bytes": [
                {"pod": "worker-leaker-0", "namespace": "triagent-demo", "value": 0.98}
            ],
        },
        loki_lines=[
            "MemoryError: allocating 200MB heap",
            "OOMKilled",
        ],
    )

    out["03-dns"] = Scenario(
        slug="03-dns",
        scenario_id="dns-003",
        name="CoreDNS misconfig: DNS resolution failing",
        namespace="triagent-demo",
        severity="P2",
        summary="services unable to resolve cluster.local DNS; CoreDNS ConfigMap broken",
        pod=PodFixture(
            name="dns-probe-0",
            phase="Running",
            container="probe",
            restart_count=2,
            current_state="terminated",
            current_reason="Error",
            last_state=None,
            last_reason=None,
            last_exit=None,
            ready=False,
        ),
        describe_text=(
            "Name:         dns-probe-0\n"
            "Namespace:    triagent-demo\n"
            "Status:       Running\n"
            "Containers:\n"
            "  probe:\n"
            "    State: Terminated\n"
            "    Reason: Error\n"
            "Events:\n"
            "  Warning  DNSConfigForming  resolver timeout 10.43.0.10:53"
        ),
        log_previous="",
        log_current=(
            "nslookup: connection timeout to 10.43.0.10:53\n"
            "nonexistent-host.invalid"
        ),
        events_tail=[
            "Warning  DNSConfigForming  resolver timeout 10.43.0.10:53",
        ],
        prometheus_samples={
            "kube_pod_container_status_restarts_total": [
                {"pod": "dns-probe-0", "namespace": "triagent-demo", "value": 2.0}
            ],
            "coredns_dns_responses_total": [
                {"job": "coredns", "rcode": "SERVFAIL", "value": 482.0}
            ],
            "container_memory_working_set_bytes": [
                {"pod": "dns-probe-0", "namespace": "triagent-demo", "value": 0.22}
            ],
        },
        loki_lines=[
            "nslookup: connection timeout to 10.43.0.10:53",
            "DNS lookup failed for service-foo.triagent-demo.svc.cluster.local",
        ],
    )

    return out


class ScenarioState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._scenarios: dict[str, Scenario] = _build_scenarios()

    def list(self) -> list[Scenario]:
        with self._lock:
            return list(self._scenarios.values())

    def get(self, slug: str) -> Scenario | None:
        with self._lock:
            return self._scenarios.get(slug)

    def active(self) -> list[Scenario]:
        with self._lock:
            return [s for s in self._scenarios.values() if s.active]

    def trigger(self, slug: str) -> Scenario:
        with self._lock:
            scenario = self._scenarios.get(slug)
            if scenario is None:
                raise KeyError(slug)
            scenario.active = True
            scenario.triggered_at = time.time()
            return scenario

    def clear(self, slug: str) -> None:
        with self._lock:
            scenario = self._scenarios.get(slug)
            if scenario is None:
                return
            scenario.active = False
            scenario.triggered_at = None

    def reset(self) -> None:
        with self._lock:
            for s in self._scenarios.values():
                s.active = False
                s.triggered_at = None

    def for_namespace(self, namespace: str) -> list[Scenario]:
        with self._lock:
            return [s for s in self._scenarios.values() if s.namespace == namespace]


_state: ScenarioState | None = None


def get_state() -> ScenarioState:
    global _state
    if _state is None:
        _state = ScenarioState()
    return _state
