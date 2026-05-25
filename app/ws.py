from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Iterable

from fastapi import WebSocket

# Event vocabulary - kept stable; war room store routes on `type`.
EventType = str
VALID_EVENT_TYPES: tuple[EventType, ...] = (
    "initial_state",
    "alert",
    "alert_cleared",
    "trace_event",
    "investigation_state",
    "chaos_state",
    "provider_health",
)


@dataclass
class Event:
    type: EventType
    payload: dict[str, Any]
    timestamp: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps({"type": self.type, "ts": self.timestamp, "payload": self.payload})


class ConnectionManager:
    def __init__(self, history_size: int = 64) -> None:
        self._clients: set[WebSocket] = set()
        self._history: deque[Event] = deque(maxlen=history_size)
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    def snapshot_history(self) -> list[dict[str, Any]]:
        return [
            {"type": e.type, "ts": e.timestamp, "payload": e.payload}
            for e in self._history
        ]

    async def send_personal(self, ws: WebSocket, event: Event) -> None:
        try:
            await ws.send_text(event.to_json())
        except Exception:
            await self.disconnect(ws)

    async def broadcast(self, type_: EventType, payload: dict[str, Any]) -> Event:
        event = Event(type=type_, payload=payload)
        if type_ != "initial_state":
            self._history.append(event)
        dead: list[WebSocket] = []
        async with self._lock:
            clients = list(self._clients)
        text = event.to_json()
        for ws in clients:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)
        return event

    def broadcast_threadsafe(
        self,
        loop: asyncio.AbstractEventLoop,
        type_: EventType,
        payload: dict[str, Any],
    ) -> None:
        asyncio.run_coroutine_threadsafe(self.broadcast(type_, payload), loop)

    @property
    def client_count(self) -> int:
        return len(self._clients)


_manager: ConnectionManager | None = None


def get_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager


def filter_history(history: Iterable[dict[str, Any]], types: set[str]) -> list[dict[str, Any]]:
    return [e for e in history if e.get("type") in types]
