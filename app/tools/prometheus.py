from __future__ import annotations

import os
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field


class PrometheusError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class Sample(BaseModel):
    metric: dict[str, str] = Field(default_factory=dict)
    timestamp: float
    value: float


class Series(BaseModel):
    metric: dict[str, str] = Field(default_factory=dict)
    values: list[tuple[float, float]] = Field(default_factory=list)


class PrometheusTool:
    name = "prometheus"

    def __init__(self, url: str | None = None, timeout: float = 10.0):
        self.url = (url or os.environ.get("PROMETHEUS_URL", "http://localhost:9090")).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.url}{path}", params=params)
        except httpx.HTTPError as exc:
            raise PrometheusError(f"prometheus unreachable: {exc}") from exc
        if r.status_code >= 400:
            raise PrometheusError(
                f"prometheus {path} returned {r.status_code}: {r.text[:200]}",
                status_code=r.status_code,
            )
        body = r.json()
        if body.get("status") != "success":
            raise PrometheusError(
                f"prometheus {path} non-success: {body.get('error') or body.get('errorType')}"
            )
        return body.get("data", {})

    def query(self, expr: str, time_s: float | None = None) -> list[Sample]:
        params: dict[str, Any] = {"query": expr}
        if time_s is not None:
            params["time"] = time_s
        data = self._get("/api/v1/query", params)
        result_type = data.get("resultType")
        items = data.get("result", []) or []
        samples: list[Sample] = []
        if result_type == "vector":
            for item in items:
                ts, val = item.get("value", [time.time(), "0"])
                samples.append(
                    Sample(
                        metric=item.get("metric", {}) or {},
                        timestamp=float(ts),
                        value=float(val),
                    )
                )
        elif result_type == "scalar":
            ts, val = items if isinstance(items, list) and len(items) == 2 else (time.time(), "0")
            samples.append(Sample(metric={}, timestamp=float(ts), value=float(val)))
        return samples

    def query_range(
        self,
        expr: str,
        start: float,
        end: float,
        step: float = 15.0,
    ) -> list[Series]:
        data = self._get(
            "/api/v1/query_range",
            {"query": expr, "start": start, "end": end, "step": step},
        )
        out: list[Series] = []
        for item in data.get("result", []) or []:
            values = [(float(ts), float(v)) for ts, v in item.get("values", [])]
            out.append(Series(metric=item.get("metric", {}) or {}, values=values))
        return out


class MockPrometheusTool:
    name = "prometheus"

    def __init__(self) -> None:
        self.url = "mock://prometheus"

    def query(self, expr: str, time_s: float | None = None) -> list[Sample]:
        now = time.time()
        e = expr.lower()
        if "restart" in e:
            return [
                Sample(
                    metric={"pod": "demo-failing", "namespace": "triagent-demo"},
                    timestamp=now,
                    value=7.0,
                )
            ]
        if "memory" in e or "rss" in e:
            return [
                Sample(
                    metric={"pod": "leaker", "namespace": "triagent-oom"},
                    timestamp=now,
                    value=0.98,
                )
            ]
        if "dns" in e or "resolv" in e:
            return [
                Sample(
                    metric={"job": "coredns"},
                    timestamp=now,
                    value=0.0,
                )
            ]
        return [Sample(metric={}, timestamp=now, value=0.0)]

    def query_range(
        self,
        expr: str,
        start: float,
        end: float,
        step: float = 15.0,
    ) -> list[Series]:
        samples = self.query(expr)
        if not samples:
            return []
        s = samples[0]
        return [Series(metric=s.metric, values=[(start, s.value), (end, s.value)])]


class RemotePrometheusTool:
    """HTTP-backed Prometheus tool pointed at the scenario engine."""

    name = "prometheus"

    def __init__(self, base_url: str | None = None, timeout: float = 5.0):
        self.url = (base_url or os.environ.get("SCENARIO_ENGINE_URL", "http://localhost:8002")).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.url}{path}", params=params)
        except httpx.HTTPError as exc:
            raise PrometheusError(f"scenario-engine prometheus unreachable: {exc}") from exc
        if r.status_code >= 400:
            raise PrometheusError(
                f"scenario-engine {path} returned {r.status_code}: {r.text[:200]}",
                status_code=r.status_code,
            )
        body = r.json()
        if body.get("status") != "success":
            raise PrometheusError(f"scenario-engine {path} non-success")
        return body.get("data", {})

    def query(self, expr: str, time_s: float | None = None) -> list[Sample]:
        params: dict[str, Any] = {"q": expr}
        if time_s is not None:
            params["time"] = time_s
        data = self._get("/prometheus/query", params)
        samples: list[Sample] = []
        for item in data.get("result", []) or []:
            ts, val = item.get("value", [time.time(), "0"])
            samples.append(
                Sample(
                    metric=item.get("metric", {}) or {},
                    timestamp=float(ts),
                    value=float(val),
                )
            )
        return samples

    def query_range(
        self,
        expr: str,
        start: float,
        end: float,
        step: float = 15.0,
    ) -> list[Series]:
        data = self._get(
            "/prometheus/query_range",
            {"q": expr, "start": start, "end": end, "step": step},
        )
        out: list[Series] = []
        for item in data.get("result", []) or []:
            values = [(float(ts), float(v)) for ts, v in item.get("values", [])]
            out.append(Series(metric=item.get("metric", {}) or {}, values=values))
        return out


_default_tool: PrometheusTool | None = None


def default_tool() -> PrometheusTool:
    global _default_tool
    if _default_tool is None:
        _default_tool = PrometheusTool()
    return _default_tool
