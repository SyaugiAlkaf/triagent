from __future__ import annotations

from fastapi.testclient import TestClient


def _client() -> TestClient:
    from scenario_engine.state import get_state
    get_state().reset()
    from scenario_engine.main import app
    return TestClient(app)


def test_list_active_trigger_clear() -> None:
    with _client() as client:
        r = client.get("/scenarios")
        assert r.status_code == 200
        slugs = {s["slug"] for s in r.json()["scenarios"]}
        assert {"01-crashloop", "02-oom", "03-dns"} <= slugs

        r = client.get("/scenarios/active")
        assert r.json() == {"active": []}

        r = client.post("/scenarios/trigger/01-crashloop")
        assert r.status_code == 200

        r = client.get("/scenarios/active")
        active = r.json()["active"]
        assert len(active) == 1
        assert active[0]["slug"] == "01-crashloop"

        r = client.post("/scenarios/clear/01-crashloop")
        assert r.status_code == 200
        assert client.get("/scenarios/active").json()["active"] == []


def test_kubectl_telemetry_for_active_scenario() -> None:
    with _client() as client:
        client.post("/scenarios/trigger/01-crashloop")
        pods = client.get("/kubectl/get_pods/triagent-demo").json()
        assert len(pods["pods"]) == 1
        pod = pods["pods"][0]
        assert pod["name"] == "payments-api-0"
        assert pod["containers"][0]["restart_count"] == 7
        assert pod["containers"][0]["current"]["reason"] == "CrashLoopBackOff"

        desc = client.get("/kubectl/describe/payments-api-0?namespace=triagent-demo").json()
        assert "CrashLoopBackOff" not in desc["raw"]
        assert "BackOff" in desc["raw"] or "Exit Code: 1" in desc["raw"]

        logs = client.get("/kubectl/logs/payments-api-0?namespace=triagent-demo&previous=true").json()
        assert "DATABASE_URL" in logs["text"]


def test_prometheus_query_returns_active_only() -> None:
    with _client() as client:
        r = client.get("/prometheus/query?q=kube_pod_container_status_restarts_total")
        assert r.json()["data"]["result"] == []

        client.post("/scenarios/trigger/02-oom")
        r = client.get(
            '/prometheus/query?q=kube_pod_container_status_restarts_total{namespace="triagent-demo"}'
        )
        result = r.json()["data"]["result"]
        assert len(result) == 1
        assert result[0]["metric"]["pod"] == "worker-leaker-0"


def test_loki_query_range_returns_lines_for_active_scenarios() -> None:
    with _client() as client:
        client.post("/scenarios/trigger/03-dns")
        r = client.get(
            "/loki/query_range?query=%7Bnamespace%3D%22triagent-demo%22%7D&start=0&end=1000&limit=10"
        )
        body = r.json()
        streams = body["data"]["result"]
        assert streams
        all_lines = [v[1] for s in streams for v in s["values"]]
        assert any("DNS" in line or "timeout" in line for line in all_lines)
