from __future__ import annotations

import time

import pytest

from app import tools as tool_registry
from app.chaos import get_controller
from app.runner import InvestigationManager, _SingleInflightError


def _wait_for_terminal(mgr: InvestigationManager, inv_id: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        state = mgr.get(inv_id)
        if state is not None and state.status in {"done", "failed"}:
            return
        time.sleep(0.05)
    raise TimeoutError(f"investigation {inv_id} did not reach terminal in {timeout}s")


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    tool_registry.clear()
    get_controller().clear()
    monkeypatch.setenv("USE_MOCK_LLM", "true")
    monkeypatch.delenv("SCENARIO_ENGINE_URL", raising=False)
    yield
    get_controller().clear()


def test_replay_creates_counterfactual_paired_to_original():
    mgr = InvestigationManager()
    original = mgr.start("01-crashloop", cleanup=False, wait_seconds=0)
    _wait_for_terminal(mgr, original.id)

    counterfactual = mgr.replay(
        original.id,
        chaos_override={"killed_providers": ["mock"]},
    )
    _wait_for_terminal(mgr, counterfactual.id)

    assert counterfactual.id != original.id
    assert counterfactual.counterfactual_of == original.id
    assert counterfactual.chaos_override == {"killed_providers": ["mock"]}
    assert counterfactual.scenario_slug == original.scenario_slug


def test_replay_rejects_when_original_unknown():
    mgr = InvestigationManager()
    with pytest.raises(FileNotFoundError):
        mgr.replay("nonexistent-id", chaos_override={})


def test_replay_rejects_when_original_still_running():
    mgr = InvestigationManager()
    # Start but DO NOT wait for terminal — original is still running
    state = mgr.start("01-crashloop", cleanup=False, wait_seconds=0)
    if state.status not in {"done", "failed"}:
        with pytest.raises(_SingleInflightError):
            mgr.replay(state.id, chaos_override={})


def test_replay_restores_prior_chaos_state_when_done():
    ctl = get_controller()
    ctl.kill_provider("preexisting-killed")

    mgr = InvestigationManager()
    original = mgr.start("01-crashloop", cleanup=False, wait_seconds=0)
    _wait_for_terminal(mgr, original.id)

    counterfactual = mgr.replay(
        original.id,
        chaos_override={"killed_providers": ["mock"]},
    )
    _wait_for_terminal(mgr, counterfactual.id)

    # After counterfactual finishes, prior chaos state must be restored
    assert ctl.is_provider_killed("preexisting-killed")
    assert not ctl.is_provider_killed("mock")


def test_snapshot_exposes_counterfactual_fields():
    mgr = InvestigationManager()
    original = mgr.start("01-crashloop", cleanup=False, wait_seconds=0)
    _wait_for_terminal(mgr, original.id)
    snap = original.snapshot()
    assert snap["counterfactual_of"] is None
    assert snap["chaos_override"] is None

    counterfactual = mgr.replay(original.id, chaos_override={"killed_tools": ["kubectl"]})
    _wait_for_terminal(mgr, counterfactual.id)
    cf_snap = counterfactual.snapshot()
    assert cf_snap["counterfactual_of"] == original.id
    assert cf_snap["chaos_override"] == {"killed_tools": ["kubectl"]}
