"""End-to-end smoke for the war-room flow.

Wires the FastAPI app and scenario engine TestClients together (no real
ports needed) and walks the full happy path: trigger scenario -> alert lands
on /ws -> POST /investigations -> trace events stream over /ws -> verdict.
"""

from __future__ import annotations

import json
import os
import time
from urllib.parse import urlparse

import httpx
from fastapi.testclient import TestClient


def _stub_httpx_with(engine_client: TestClient):
    real_client = httpx.Client

    class _Pass:
        def __init__(self, *a, **kw):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            path = urlparse(url).path
            return engine_client.get(path, params=params)

        def post(self, url, params=None, json=None):
            path = urlparse(url).path
            return engine_client.post(path, params=params, json=json)

    class _AsyncPass:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None):
            path = urlparse(url).path
            return engine_client.get(path, params=params)

    real_async = httpx.AsyncClient
    httpx.Client = _Pass  # type: ignore[assignment]
    httpx.AsyncClient = _AsyncPass  # type: ignore[assignment]
    return real_client, real_async


def _restore_httpx(real_client, real_async) -> None:
    httpx.Client = real_client  # type: ignore[assignment]
    httpx.AsyncClient = real_async  # type: ignore[assignment]


def test_full_war_room_flow_scenario_to_verdict() -> None:
    os.environ["SCENARIO_ENGINE_URL"] = "http://testserver"
    os.environ["USE_MOCK_LLM"] = "true"
    os.environ["SCENARIO_POLL_INTERVAL_S"] = "0.25"

    from scenario_engine.main import app as engine_app
    from scenario_engine.state import get_state

    get_state().reset()
    engine = TestClient(engine_app)
    engine.__enter__()
    real_client, real_async = _stub_httpx_with(engine)

    try:
        from app import tools as registry
        registry.register_default_tools(remote=True)

        from app.main import app
        api = TestClient(app)
        api.__enter__()

        try:
            with api.websocket_connect("/ws") as ws:
                first = json.loads(ws.receive_text())
                assert first["type"] == "initial_state"

                # trigger via the scenario engine, war room poll loop should pick
                # it up within the configured interval and broadcast `alert`.
                engine.post("/scenarios/trigger/01-crashloop")

                deadline = time.time() + 5.0
                alert_event = None
                while time.time() < deadline:
                    try:
                        ev = json.loads(ws.receive_text(timeout=1.0))
                    except TypeError:
                        ev = json.loads(ws.receive_text())
                    if ev["type"] == "alert" and ev["payload"]["slug"] == "01-crashloop":
                        alert_event = ev
                        break
                assert alert_event is not None, "alert was not broadcast"

                r = api.post(
                    "/investigations",
                    json={"scenario": "01-crashloop", "wait_seconds": 5},
                )
                assert r.status_code == 200, r.text
                inv_id = r.json()["id"]

                # drain ws events until investigation status becomes done.
                done_event = None
                deadline = time.time() + 15.0
                while time.time() < deadline:
                    ev = json.loads(ws.receive_text())
                    if (
                        ev["type"] == "investigation_state"
                        and ev["payload"].get("id") == inv_id
                        and ev["payload"].get("status") == "done"
                    ):
                        done_event = ev
                        break
                assert done_event is not None, "investigation never reported done"
                payload = done_event["payload"]
                assert payload["result"]["confidence"] >= 0.5
                trace_kinds = {e["kind"] for e in payload["trace"]}
                assert "plan" in trace_kinds
                assert any(k.startswith("tool_") or k.startswith("provider_") for k in trace_kinds)
        finally:
            api.__exit__(None, None, None)
    finally:
        engine.__exit__(None, None, None)
        _restore_httpx(real_client, real_async)
        get_state().reset()
        os.environ.pop("SCENARIO_ENGINE_URL", None)
        os.environ.pop("SCENARIO_POLL_INTERVAL_S", None)


def test_chaos_kill_provider_broadcasts_and_topology_flow_redirects() -> None:
    """Light smoke for the topology-driving event: provider kill -> chaos_state
    on /ws -> topology component reads killed_providers and tints edge red."""
    from app.main import app

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            json.loads(ws.receive_text())
            r = client.post("/chaos/kill_provider/groq")
            assert r.status_code == 200
            ev = json.loads(ws.receive_text())
            assert ev["type"] == "chaos_state"
            assert "groq" in ev["payload"]["killed_providers"]
            client.post("/chaos/clear")
