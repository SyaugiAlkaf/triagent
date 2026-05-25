from __future__ import annotations

import pytest

from app import tools
from app.chaos import get_controller
from app.tools.kubectl import KubectlTool
from app.tools.loki import LokiTool
from app.tools.prometheus import PrometheusTool


@pytest.fixture(autouse=True)
def _reset_registry():
    tools.clear()
    get_controller().clear()
    yield
    tools.clear()
    get_controller().clear()


def test_register_and_get_round_trip():
    kt = KubectlTool()
    tools.register("kubectl", kt)
    assert tools.get("kubectl") is kt
    assert "kubectl" in tools.list_registered()


def test_quarantine_blocks_get():
    tools.register("kubectl", KubectlTool())
    tools.register("prometheus", PrometheusTool())
    tools.register("loki", LokiTool())

    assert not tools.is_quarantined("prometheus")
    tools.quarantine("prometheus")
    assert tools.is_quarantined("prometheus")

    with pytest.raises(tools.ToolQuarantinedError):
        tools.get("prometheus")

    assert tools.get("kubectl") is not None
    assert tools.get("loki") is not None


def test_chaos_controller_quarantine_is_honored():
    tools.register("kubectl", KubectlTool())
    get_controller().kill_tool("kubectl")

    assert tools.is_quarantined("kubectl")
    with pytest.raises(tools.ToolQuarantinedError):
        tools.get("kubectl")

    tools.restore("kubectl")
    assert not tools.is_quarantined("kubectl")


def test_get_unknown_raises():
    with pytest.raises(tools.ToolNotRegisteredError):
        tools.get("never-registered")
