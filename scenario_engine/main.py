from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from scenario_engine.state import Scenario, get_state

_STATIC_DIR = Path(__file__).resolve().parent / "static"


app = FastAPI(title="Triagent Scenario Engine", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(_STATIC_DIR / "control.html")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "scenario_engine"}


@app.get("/scenarios")
def list_scenarios() -> dict[str, Any]:
    return {
        "scenarios": [
            {
                "slug": s.slug,
                "id": s.scenario_id,
                "name": s.name,
                "namespace": s.namespace,
                "severity": s.severity,
                "summary": s.summary,
                "active": s.active,
                "triggered_at": s.triggered_at,
            }
            for s in get_state().list()
        ]
    }


@app.get("/scenarios/active")
def active_scenarios() -> dict[str, Any]:
    return {
        "active": [s.alert_payload() for s in get_state().active()],
    }


@app.post("/scenarios/trigger/{slug}")
def trigger_scenario(slug: str) -> dict[str, Any]:
    try:
        s = get_state().trigger(slug)
    except KeyError:
        raise HTTPException(404, f"unknown scenario: {slug}")
    return {"ok": True, "scenario": s.alert_payload()}


@app.post("/scenarios/clear/{slug}")
def clear_scenario(slug: str) -> dict[str, Any]:
    get_state().clear(slug)
    return {"ok": True, "slug": slug}


@app.post("/scenarios/reset")
def reset_scenarios() -> dict[str, Any]:
    get_state().reset()
    return {"ok": True}


def _resolve_pod_scenario(namespace: str, name: str | None = None) -> Scenario | None:
    state = get_state()
    in_ns = [s for s in state.active() if s.namespace == namespace]
    if name is not None:
        for s in in_ns:
            if s.pod.name == name:
                return s
    if len(in_ns) == 1:
        return in_ns[0]
    if in_ns:
        return in_ns[0]
    return None


@app.get("/kubectl/get_pods/{namespace}")
def get_pods(namespace: str) -> dict[str, Any]:
    state = get_state()
    pods = []
    for s in state.active():
        if s.namespace == namespace:
            pods.append(s.pod.to_get_pods(namespace))
    return {"namespace": namespace, "pods": pods}


@app.get("/kubectl/describe/{name}")
def describe_pod(name: str, namespace: str = Query("triagent-demo")) -> dict[str, Any]:
    s = _resolve_pod_scenario(namespace, name)
    if s is None:
        raise HTTPException(404, f"no active scenario for pod {name} in {namespace}")
    return {
        "name": name,
        "namespace": namespace,
        "raw": s.describe_text,
        "events_tail": s.events_tail,
    }


@app.get("/kubectl/logs/{name}")
def get_logs(
    name: str,
    namespace: str = Query("triagent-demo"),
    previous: bool = Query(False),
    tail: int = Query(40, ge=1, le=500),
    container: str | None = Query(None),
) -> dict[str, Any]:
    s = _resolve_pod_scenario(namespace, name)
    if s is None:
        raise HTTPException(404, f"no active scenario for pod {name} in {namespace}")
    text = s.log_previous if previous else s.log_current
    if previous and not text:
        text = s.log_current
    return {
        "pod": name,
        "namespace": namespace,
        "container": container or s.pod.container,
        "previous": previous,
        "text": text[-tail * 200:] if text else "",
    }


@app.get("/kubectl/events/{namespace}")
def get_events(namespace: str) -> dict[str, Any]:
    state = get_state()
    events = []
    for s in state.active():
        if s.namespace != namespace:
            continue
        for line in s.events_tail:
            parts = line.split(None, 2)
            type_ = parts[0] if parts else "Normal"
            reason = parts[1] if len(parts) > 1 else ""
            message = parts[2] if len(parts) > 2 else ""
            events.append(
                {
                    "type": type_,
                    "reason": reason,
                    "object": f"Pod/{s.pod.name}",
                    "message": message,
                    "count": 1,
                }
            )
    return {"namespace": namespace, "events": events}


def _prometheus_match(expr: str) -> tuple[str, dict[str, str]]:
    metric = expr.split("{")[0].strip()
    selectors: dict[str, str] = {}
    if "{" in expr:
        inner = expr[expr.index("{") + 1 : expr.rindex("}")]
        for tok in inner.split(","):
            if "=" in tok:
                k, _, v = tok.partition("=")
                selectors[k.strip()] = v.strip().strip('"')
    return metric, selectors


@app.get("/prometheus/query")
def prometheus_query(q: str = Query(...), time_s: float | None = Query(None, alias="time")) -> dict[str, Any]:
    metric, selectors = _prometheus_match(q)
    now = time_s if time_s is not None else time.time()
    result = []
    for s in get_state().active():
        samples = s.prometheus_samples.get(metric, [])
        for sample in samples:
            labels = {k: v for k, v in sample.items() if k != "value"}
            if "namespace" in selectors and labels.get("namespace") != selectors["namespace"]:
                continue
            result.append(
                {
                    "metric": labels,
                    "value": [now, str(sample["value"])],
                }
            )
    return {
        "status": "success",
        "data": {"resultType": "vector", "result": result},
    }


@app.get("/prometheus/query_range")
def prometheus_query_range(
    q: str = Query(...),
    start: float = Query(...),
    end: float = Query(...),
    step: float = Query(15.0),
) -> dict[str, Any]:
    metric, selectors = _prometheus_match(q)
    series = []
    for s in get_state().active():
        samples = s.prometheus_samples.get(metric, [])
        for sample in samples:
            labels = {k: v for k, v in sample.items() if k != "value"}
            if "namespace" in selectors and labels.get("namespace") != selectors["namespace"]:
                continue
            values = []
            t = start
            while t <= end:
                values.append([t, str(sample["value"])])
                t += step
            series.append({"metric": labels, "values": values})
    return {
        "status": "success",
        "data": {"resultType": "matrix", "result": series},
    }


@app.get("/loki/query_range")
def loki_query_range(
    query: str = Query(...),
    start: int = Query(...),
    end: int = Query(...),
    limit: int = Query(100),
    direction: str = Query("backward"),
) -> dict[str, Any]:
    streams: list[dict[str, Any]] = []
    ts_ns = end
    for s in get_state().active():
        if "namespace" in query and s.namespace not in query:
            continue
        values = []
        for line in s.loki_lines[-limit:]:
            values.append([str(ts_ns), line])
            ts_ns -= 1_000_000
        streams.append(
            {
                "stream": {"namespace": s.namespace, "pod": s.pod.name},
                "values": values,
            }
        )
    return JSONResponse(
        {
            "status": "success",
            "data": {"resultType": "streams", "result": streams},
        }
    )
