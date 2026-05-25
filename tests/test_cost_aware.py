from __future__ import annotations

from app.gateway import CompletionResult, Gateway, Message, MockProvider


class _ScriptedProvider:
    def __init__(self, name: str, model: str = "m"):
        self.name = name
        self.model = model

    def complete(self, messages: list[Message], **kwargs):
        return CompletionResult(
            provider=self.name,
            model=self.model,
            text="ok",
            latency_ms=5.0,
            input_tokens=200,
            output_tokens=200,
        )


def test_cost_aware_default_on_via_env(monkeypatch):
    monkeypatch.setenv("COST_AWARE", "true")
    g = Gateway([MockProvider()])
    assert g.cost_aware is True


def test_cost_aware_can_be_disabled(monkeypatch):
    monkeypatch.setenv("COST_AWARE", "false")
    g = Gateway([MockProvider()])
    assert g.cost_aware is False


def test_cost_aware_skips_expensive_provider_when_budget_low():
    g = Gateway(
        [
            _ScriptedProvider("groq"),
            _ScriptedProvider("ollama"),
            _ScriptedProvider("truefoundry"),
        ],
        routing_policy=["groq", "ollama", "truefoundry"],
        cost_aware=True,
        budget_usd=0.00001,
    )
    result = g.complete([Message(role="user", content="hi")])
    assert result.provider == "ollama"
    skips = [e for e in g.trace if e.kind == "provider_skip"]
    assert {e.provider for e in skips} >= {"groq", "truefoundry"}


def test_cost_aware_preserves_policy_order_under_healthy_budget():
    g = Gateway(
        [
            _ScriptedProvider("groq"),
            _ScriptedProvider("ollama"),
            _ScriptedProvider("truefoundry"),
        ],
        routing_policy=["groq", "ollama", "truefoundry"],
        cost_aware=True,
        budget_usd=1.0,
    )
    result = g.complete([Message(role="user", content="hi")])
    assert result.provider == "groq"


def test_cost_aware_reorders_free_first_under_pressure():
    g = Gateway(
        [
            _ScriptedProvider("groq"),
            _ScriptedProvider("ollama"),
        ],
        routing_policy=["groq", "ollama"],
        cost_aware=True,
        budget_usd=0.01,
    )
    g.cost_usd = 0.008
    result = g.complete([Message(role="user", content="hi")])
    assert result.provider == "ollama"


def test_cost_aware_off_preserves_routing_policy_order():
    g = Gateway(
        [
            _ScriptedProvider("groq"),
            _ScriptedProvider("ollama"),
        ],
        routing_policy=["groq", "ollama"],
        cost_aware=False,
    )
    result = g.complete([Message(role="user", content="hi")])
    assert result.provider == "groq"


def test_cost_aware_uses_only_candidate_when_all_breach():
    g = Gateway(
        [_ScriptedProvider("groq")],
        routing_policy=["groq"],
        cost_aware=True,
        budget_usd=0.00001,
    )
    result = g.complete([Message(role="user", content="hi")])
    assert result.provider == "groq"
    skips = [e for e in g.trace if e.kind == "provider_skip"]
    assert any(e.provider == "groq" for e in skips)
