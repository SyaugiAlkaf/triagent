from __future__ import annotations

from fastapi.testclient import TestClient

from app.tools.kubectl import KubectlProtocol, KubectlTool, RemoteKubectlTool
from app.tools.prometheus import RemotePrometheusTool
from app.tools.loki import RemoteLokiTool


def test_kubectl_protocol_is_implemented_by_both_backends() -> None:
    assert isinstance(KubectlTool(), KubectlProtocol)
    assert isinstance(RemoteKubectlTool(), KubectlProtocol)


def test_remote_kubectl_returns_payload_from_engine_for_active_scenario() -> None:
    from scenario_engine.main import app as engine_app
    from scenario_engine.state import get_state

    get_state().reset()
    with TestClient(engine_app) as engine:
        engine.post("/scenarios/trigger/01-crashloop")

        import httpx
        from urllib.parse import urlparse

        class _PassClient:
            def __init__(self, *a, **kw): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def get(self, url, params=None):
                return engine.get(urlparse(url).path, params=params)

        real_client = httpx.Client
        httpx.Client = _PassClient  # type: ignore[assignment]
        try:
            tool = RemoteKubectlTool(base_url="http://testserver")
            pods = tool.get_pods("triagent-demo")
            assert len(pods.pods) == 1
            assert pods.pods[0].name == "payments-api-0"
            assert pods.pods[0].containers[0].restart_count == 7

            desc = tool.describe_pod("payments-api-0", "triagent-demo")
            assert "Exit Code" in desc.raw or "BackOff" in desc.raw

            logs = tool.logs("payments-api-0", "triagent-demo", previous=True)
            assert "DATABASE_URL" in logs.text

            prom = RemotePrometheusTool(base_url="http://testserver")
            samples = prom.query(
                'kube_pod_container_status_restarts_total{namespace="triagent-demo"}'
            )
            assert len(samples) == 1
            assert samples[0].value == 7.0

            loki = RemoteLokiTool(base_url="http://testserver")
            entries = loki.query_range('{namespace="triagent-demo"}', 0, 1_000_000_000_000, 50)
            assert entries
        finally:
            httpx.Client = real_client  # type: ignore[assignment]
        get_state().reset()


def test_register_default_tools_remote_flag_selects_remote_backend() -> None:
    from app import tools as registry

    registry.register_default_tools(remote=True)
    try:
        assert isinstance(registry.get("kubectl"), RemoteKubectlTool)
        assert isinstance(registry.get("prometheus"), RemotePrometheusTool)
        assert isinstance(registry.get("loki"), RemoteLokiTool)
    finally:
        registry.register_default_tools(remote=False)
