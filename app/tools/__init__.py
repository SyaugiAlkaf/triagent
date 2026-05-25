from __future__ import annotations

import os
from typing import Any

from app.chaos import get_controller


class ToolQuarantinedError(RuntimeError):
    def __init__(self, name: str):
        super().__init__(f"tool '{name}' is quarantined")
        self.tool_name = name


class ToolNotRegisteredError(KeyError):
    pass


_registry: dict[str, Any] = {}
_local_quarantine: set[str] = set()


def register(name: str, tool: Any) -> None:
    _registry[name] = tool


def unregister(name: str) -> None:
    _registry.pop(name, None)
    _local_quarantine.discard(name)


def list_registered() -> list[str]:
    return sorted(_registry.keys())


def is_quarantined(name: str) -> bool:
    if name in _local_quarantine:
        return True
    return get_controller().is_tool_killed(name)


def quarantine(name: str) -> None:
    _local_quarantine.add(name)


def restore(name: str) -> None:
    _local_quarantine.discard(name)
    get_controller().restore_tool(name)


def get(name: str) -> Any:
    if name not in _registry:
        raise ToolNotRegisteredError(name)
    if is_quarantined(name):
        raise ToolQuarantinedError(name)
    return _registry[name]


def clear() -> None:
    _registry.clear()
    _local_quarantine.clear()


def register_default_tools(remote: bool | None = None) -> None:
    """Register the three production tools.

    When `remote=True` (or env `SCENARIO_ENGINE_URL` is set), the tools talk
    to the scenario engine instead of the real cluster / Prometheus / Loki.
    This is the unified path used by both the runner and the eval harness.
    """
    from app.tools.kubectl import KubectlTool, RemoteKubectlTool
    from app.tools.loki import LokiTool, RemoteLokiTool
    from app.tools.prometheus import (
        MockPrometheusTool,
        PrometheusTool,
        RemotePrometheusTool,
    )

    if remote is None:
        remote = bool(os.environ.get("SCENARIO_ENGINE_URL"))

    clear()

    if remote:
        register("kubectl", RemoteKubectlTool())
        register("prometheus", RemotePrometheusTool())
        register("loki", RemoteLokiTool())
        return

    register("kubectl", KubectlTool())
    use_mock = os.environ.get("USE_MOCK_LLM", "true").lower() in {"1", "true", "yes"}
    register(
        "prometheus",
        MockPrometheusTool() if use_mock else PrometheusTool(),
    )
    register("loki", LokiTool())
