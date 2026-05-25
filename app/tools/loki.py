from __future__ import annotations

import os
from typing import Any

import httpx
from pydantic import BaseModel, Field


class LokiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class LogEntry(BaseModel):
    timestamp_ns: int
    line: str
    labels: dict[str, str] = Field(default_factory=dict)


class LokiTool:
    name = "loki"

    def __init__(self, url: str | None = None, timeout: float = 10.0):
        self.url = (url or os.environ.get("LOKI_URL", "http://localhost:3100")).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.url}{path}", params=params)
        except httpx.HTTPError as exc:
            raise LokiError(f"loki unreachable: {exc}") from exc
        if r.status_code >= 400:
            raise LokiError(
                f"loki {path} returned {r.status_code}: {r.text[:200]}",
                status_code=r.status_code,
            )
        body = r.json()
        if body.get("status") not in {"success", None}:
            raise LokiError(f"loki {path} non-success: {body.get('status')}")
        return body.get("data", body)

    def query_range(
        self,
        logql: str,
        start_ns: int,
        end_ns: int,
        limit: int = 200,
        direction: str = "backward",
    ) -> list[LogEntry]:
        data = self._get(
            "/loki/api/v1/query_range",
            {
                "query": logql,
                "start": start_ns,
                "end": end_ns,
                "limit": limit,
                "direction": direction,
            },
        )
        out: list[LogEntry] = []
        result = data.get("result", []) or []
        for stream in result:
            labels = stream.get("stream", {}) or {}
            for ts, line in stream.get("values", []) or []:
                out.append(LogEntry(timestamp_ns=int(ts), line=line, labels=labels))
        return out


class RemoteLokiTool:
    """HTTP-backed Loki tool pointed at the scenario engine."""

    name = "loki"

    def __init__(self, base_url: str | None = None, timeout: float = 5.0):
        self.url = (base_url or os.environ.get("SCENARIO_ENGINE_URL", "http://localhost:8002")).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.url}{path}", params=params)
        except httpx.HTTPError as exc:
            raise LokiError(f"scenario-engine loki unreachable: {exc}") from exc
        if r.status_code >= 400:
            raise LokiError(
                f"scenario-engine {path} returned {r.status_code}: {r.text[:200]}",
                status_code=r.status_code,
            )
        body = r.json()
        if body.get("status") not in {"success", None}:
            raise LokiError(f"scenario-engine {path} non-success")
        return body.get("data", body)

    def query_range(
        self,
        logql: str,
        start_ns: int,
        end_ns: int,
        limit: int = 200,
        direction: str = "backward",
    ) -> list[LogEntry]:
        data = self._get(
            "/loki/query_range",
            {
                "query": logql,
                "start": start_ns,
                "end": end_ns,
                "limit": limit,
                "direction": direction,
            },
        )
        out: list[LogEntry] = []
        for stream in data.get("result", []) or []:
            labels = stream.get("stream", {}) or {}
            for ts, line in stream.get("values", []) or []:
                out.append(LogEntry(timestamp_ns=int(ts), line=line, labels=labels))
        return out


_default_tool: LokiTool | None = None


def default_tool() -> LokiTool:
    global _default_tool
    if _default_tool is None:
        _default_tool = LokiTool()
    return _default_tool
