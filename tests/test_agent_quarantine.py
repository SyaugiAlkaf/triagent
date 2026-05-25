from __future__ import annotations

import pytest

from app import tools as tool_registry
from app.agent import run_investigation
from app.chaos import get_controller
from app.gateway import Gateway, MockProvider
from app.tools.kubectl import KubectlTool
from app.tools.prometheus import MockPrometheusTool


class _ExplodingKubectl(KubectlTool):
    """Stand-in kubectl that screams if anyone calls it. The quarantine
    path must avoid every kubectl method when the registry says so."""

    def __init__(self) -> None:
        pass

    def _run(self, *a, **kw):
        raise AssertionError("kubectl was called despite being quarantined")

    def ensure_namespace(self, *_a, **_kw):
        raise AssertionError("kubectl was called despite being quarantined")

    def get_pods(self, *_a, **_kw):
        raise AssertionError("kubectl was called despite being quarantined")

    def describe_pod(self, *_a, **_kw):
        raise AssertionError("kubectl was called despite being quarantined")

    def logs(self, *_a, **_kw):
        raise AssertionError("kubectl was called despite being quarantined")


@pytest.fixture(autouse=True)
def _isolate_registry():
    tool_registry.clear()
    get_controller().clear()
    yield
    tool_registry.clear()
    get_controller().clear()


def _kinds(trace: list[dict]) -> list[str]:
    return [e.get("kind") for e in trace]


def test_quarantined_kubectl_routes_to_prometheus():
    kubectl = _ExplodingKubectl()
    tool_registry.register("kubectl", kubectl)
    tool_registry.register("prometheus", MockPrometheusTool())
    get_controller().kill_tool("kubectl")

    gateway = Gateway([MockProvider()], routing_policy=["mock"], chaos=get_controller())
    result = run_investigation(
        scenario_id="crashloop-001",
        namespace="triagent-demo",
        expected_root_cause="env_var_missing",
        gateway=gateway,
        kubectl=kubectl,
    )

    kinds = _kinds(result["trace"])
    assert "tool_quarantine" in kinds
    assert "tool_substitute" in kinds
    assert result["hypotheses"], "agent should still produce hypotheses"
    assert result["root_cause"], "agent should still produce a verdict"
    assert any("prom:" in f for f in result["findings"])


def test_both_quarantined_yields_tool_unavailable():
    kubectl = _ExplodingKubectl()
    tool_registry.register("kubectl", kubectl)
    tool_registry.register("prometheus", MockPrometheusTool())
    get_controller().kill_tool("kubectl")
    get_controller().kill_tool("prometheus")

    gateway = Gateway([MockProvider()], routing_policy=["mock"], chaos=get_controller())
    result = run_investigation(
        scenario_id="crashloop-001",
        namespace="triagent-demo",
        expected_root_cause="env_var_missing",
        gateway=gateway,
        kubectl=kubectl,
    )

    kinds = _kinds(result["trace"])
    assert "tool_unavailable" in kinds
    assert any("tool_unavailable" in f for f in result["findings"])
    assert result["hypotheses"], "hypothesize node still runs in degraded mode"
