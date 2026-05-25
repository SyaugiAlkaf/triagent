from __future__ import annotations

import json

from fastapi.testclient import TestClient


def test_ws_initial_state_and_chaos_broadcast() -> None:
    from app.main import app

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            first = json.loads(ws.receive_text())
            assert first["type"] == "initial_state"
            assert "chaos" in first["payload"]
            assert "tools" in first["payload"]

            r = client.post("/chaos/kill_provider/groq")
            assert r.status_code == 200

            event = json.loads(ws.receive_text())
            assert event["type"] == "chaos_state"
            assert "groq" in event["payload"]["killed_providers"]

            r = client.post("/chaos/clear")
            assert r.status_code == 200
            cleared = json.loads(ws.receive_text())
            assert cleared["payload"]["killed_providers"] == []


def test_ws_history_replay() -> None:
    from app.main import app

    with TestClient(app) as client:
        client.post("/chaos/kill_provider/groq")
        client.post("/chaos/clear")
        with client.websocket_connect("/ws") as ws:
            first = json.loads(ws.receive_text())
            history = first["payload"].get("history", [])
            kinds = [e["type"] for e in history]
            assert "chaos_state" in kinds
