from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class ChaosState:
    killed_providers: set[str] = field(default_factory=set)
    killed_tools: set[str] = field(default_factory=set)
    injected_latency_ms: float = 0.0
    poison_json: bool = False

    def snapshot(self) -> dict:
        return {
            "killed_providers": sorted(self.killed_providers),
            "killed_tools": sorted(self.killed_tools),
            "injected_latency_ms": self.injected_latency_ms,
            "poison_json": self.poison_json,
        }


class ChaosError(RuntimeError):
    pass


class ChaosController:
    def __init__(self) -> None:
        self.state = ChaosState()

    def kill_provider(self, name: str) -> None:
        self.state.killed_providers.add(name)

    def restore_provider(self, name: str) -> None:
        self.state.killed_providers.discard(name)

    def kill_tool(self, name: str) -> None:
        self.state.killed_tools.add(name)

    def restore_tool(self, name: str) -> None:
        self.state.killed_tools.discard(name)

    def set_latency(self, ms: float) -> None:
        self.state.injected_latency_ms = max(0.0, float(ms))

    def set_poison_json(self, on: bool) -> None:
        self.state.poison_json = bool(on)

    def clear(self) -> None:
        self.state = ChaosState()

    def is_provider_killed(self, name: str) -> bool:
        return name in self.state.killed_providers

    def is_tool_killed(self, name: str) -> bool:
        return name in self.state.killed_tools

    def maybe_inject_latency(self) -> float:
        ms = self.state.injected_latency_ms
        if ms > 0:
            time.sleep(ms / 1000.0)
        return ms


_controller = ChaosController()


def get_controller() -> ChaosController:
    return _controller
