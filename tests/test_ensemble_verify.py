from __future__ import annotations

from app import tools as tool_registry
from app.agent import run_investigation
from app.chaos import get_controller
from app.gateway import (
    CompletionResult,
    Gateway,
    Message,
    MockProvider,
    provider_family,
)
from app.tools.kubectl import KubectlTool
from app.tools.prometheus import MockPrometheusTool


class _ScriptedProvider:
    def __init__(self, name: str, model: str, scripts: list[str]):
        self.name = name
        self.model = model
        self._scripts = list(scripts)
        self._calls = 0

    def complete(self, messages: list[Message], **kwargs):
        text = self._scripts[min(self._calls, len(self._scripts) - 1)]
        self._calls += 1
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text=text,
            latency_ms=10.0,
            input_tokens=10,
            output_tokens=10,
        )


def test_provider_family_strips_cached_prefix():
    assert provider_family("cached-groq") == "groq"
    assert provider_family("groq") == "groq"
    assert provider_family("truefoundry") == "truefoundry"


def test_gateway_avoid_family_filters_candidates():
    g = Gateway(
        [
            MockProvider(name="alpha"),
            MockProvider(name="beta"),
        ],
        routing_policy=["alpha", "beta"],
    )
    assert g._candidate_order(avoid_family="alpha") == ["beta"]
    assert g._candidate_order(avoid_family="beta") == ["alpha"]


def test_gateway_avoid_family_falls_back_when_no_eligible():
    g = Gateway([MockProvider(name="alpha")], routing_policy=["alpha"])
    # avoid_family that would empty the list — fall back to normal order
    assert g._candidate_order(avoid_family="alpha") == ["alpha"]


def test_ensemble_verify_records_consensus_when_root_causes_agree(monkeypatch):
    tool_registry.clear()
    get_controller().clear()
    monkeypatch.setenv("USE_MOCK_LLM", "true")

    hyp_text = (
        "Hypothesis 1: OOMKilled - container exceeded memory limit. "
        "confidence: 0.85\nTop hypothesis: oom"
    )
    ver_text = (
        "Confirmed. Root cause: OOMKilled — pod exceeded its memory limit. "
        "confidence: 0.80"
    )
    g = Gateway(
        [
            _ScriptedProvider("groq", "g", scripts=[hyp_text]),
            _ScriptedProvider("ollama", "o", scripts=[ver_text]),
        ],
        routing_policy=["groq", "ollama"],
        cost_aware=False,
    )
    result = run_investigation(
        scenario_id="02-oom",
        namespace="triagent-demo",
        expected_root_cause="OOMKilled",
        gateway=g,
        kubectl=KubectlTool(),
    )
    ensemble = result["ensemble"]
    assert ensemble is not None
    assert ensemble["consensus"] is True
    assert provider_family(ensemble["hypothesize_provider"]) == "groq"
    assert provider_family(ensemble["verify_provider"]) == "ollama"
    # consensus + both >= 0.7 -> max
    assert result["confidence"] >= 0.80
    assert any(e["kind"] == "ensemble_verify" for e in result["trace"])


def test_ensemble_verify_records_split_when_root_causes_disagree(monkeypatch):
    tool_registry.clear()
    get_controller().clear()
    monkeypatch.setenv("USE_MOCK_LLM", "true")

    hyp_text = (
        "Hypothesis 1: OOMKilled - memory leak. confidence: 0.85\n"
        "Top hypothesis: oom"
    )
    ver_text = (
        "After review, this looks like CoreDNS nameserver misconfig, not memory. "
        "confidence: 0.75"
    )
    g = Gateway(
        [
            _ScriptedProvider("groq", "g", scripts=[hyp_text]),
            _ScriptedProvider("ollama", "o", scripts=[ver_text]),
        ],
        routing_policy=["groq", "ollama"],
        cost_aware=False,
    )
    result = run_investigation(
        scenario_id="02-oom",
        namespace="triagent-demo",
        expected_root_cause="OOMKilled",
        gateway=g,
        kubectl=KubectlTool(),
    )
    ensemble = result["ensemble"]
    assert ensemble is not None
    assert ensemble["consensus"] is False
    # split -> confidence drops by 0.20 from max
    assert result["confidence"] <= 0.66


def test_ensemble_verify_degrades_when_only_one_provider_family(monkeypatch):
    tool_registry.clear()
    get_controller().clear()
    monkeypatch.setenv("USE_MOCK_LLM", "true")

    hyp_text = "Hypothesis 1: OOMKilled. confidence: 0.80"
    ver_text = "Confirmed. OOMKilled. confidence: 0.78"
    only = _ScriptedProvider("groq", "g", scripts=[hyp_text, ver_text])
    g = Gateway([only], routing_policy=["groq"], cost_aware=False)
    result = run_investigation(
        scenario_id="02-oom",
        namespace="triagent-demo",
        expected_root_cause="OOMKilled",
        gateway=g,
        kubectl=KubectlTool(),
    )
    ensemble = result["ensemble"]
    assert ensemble is not None
    assert ensemble.get("degraded") is True
    assert any(e["kind"] == "ensemble_degraded" for e in result["trace"])
