from __future__ import annotations

import os

import pytest

from app.gateway import (
    ProviderError,
    TrueFoundryProvider,
    build_default_gateway,
    estimate_cost_usd,
)


def test_truefoundry_cost_branch_uses_published_rates():
    cost = estimate_cost_usd("truefoundry", 1_000_000, 1_000_000)
    assert cost == pytest.approx(0.15 + 0.60)


def test_truefoundry_provider_raises_when_key_missing(monkeypatch):
    monkeypatch.delenv("TRUEFOUNDRY_API_KEY", raising=False)
    with pytest.raises(ProviderError, match="TRUEFOUNDRY_API_KEY not set"):
        TrueFoundryProvider()


def test_truefoundry_provider_accepts_explicit_key(monkeypatch):
    monkeypatch.delenv("TRUEFOUNDRY_API_KEY", raising=False)
    p = TrueFoundryProvider(api_key="fake-key", model="openai/gpt-4o-mini")
    assert p.name == "truefoundry"
    assert p.model == "openai/gpt-4o-mini"


def test_build_default_gateway_excludes_truefoundry_without_key(monkeypatch):
    monkeypatch.delenv("TRUEFOUNDRY_API_KEY", raising=False)
    monkeypatch.setenv("USE_MOCK_LLM", "false")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("OLLAMA_HOST", "")
    g = build_default_gateway()
    assert "truefoundry" not in g.routing_policy
    assert "cached-truefoundry" not in g.routing_policy


def test_build_default_gateway_includes_truefoundry_slots_when_key_set(monkeypatch):
    monkeypatch.setenv("USE_MOCK_LLM", "false")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("OLLAMA_HOST", "")
    monkeypatch.setenv("USE_CACHE", "false")
    monkeypatch.setenv("CAPTURE_CACHE", "false")
    monkeypatch.setenv("TRUEFOUNDRY_API_KEY", "fake-key")
    monkeypatch.setenv("TRUEFOUNDRY_PRIMARY_MODEL", "groq/llama-3.3-70b-versatile")
    monkeypatch.setenv("TRUEFOUNDRY_VERIFY_MODEL", "google-gemini/gemma-4-31b-it")
    monkeypatch.setenv("TRUEFOUNDRY_TERTIARY_MODEL", "openrouter/free-model")
    g = build_default_gateway()
    assert g.routing_policy[:3] == ["tf-primary", "tf-verify", "tf-tertiary"]
    assert g.primary == "tf-primary"
