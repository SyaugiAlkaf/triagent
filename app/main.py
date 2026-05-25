from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import tools as tool_registry
from app import ws as ws_module
from app.agent import run_investigation
from app.chaos import get_controller
from app.gateway import build_default_gateway
from app.runner import _SingleInflightError, get_manager
from app.tools.kubectl import KubectlError, KubectlTool


load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "scenarios"
WARROOM_DIST = Path(__file__).resolve().parent.parent / "warroom-dist"
SCENARIO_ENGINE_URL = os.environ.get("SCENARIO_ENGINE_URL", "http://localhost:8002").rstrip("/")
SCENARIO_POLL_INTERVAL_S = float(os.environ.get("SCENARIO_POLL_INTERVAL_S", "2.0"))

log = logging.getLogger("triagent")


tool_registry.register_default_tools()


def _broadcast_threadsafe(loop: asyncio.AbstractEventLoop):
    mgr = ws_module.get_manager()

    def cb(type_: str, payload: dict[str, Any]) -> None:
        try:
            asyncio.run_coroutine_threadsafe(mgr.broadcast(type_, payload), loop)
        except RuntimeError:
            pass

    return cb


async def _poll_scenario_engine() -> None:
    """Long-running task: poll scenario engine, broadcast `alert` on new actives.

    Tolerates the engine being down - silently no-ops until it comes up.
    """
    seen: set[str] = set()
    async with httpx.AsyncClient(timeout=2.0) as client:
        while True:
            try:
                r = await client.get(f"{SCENARIO_ENGINE_URL}/scenarios/active")
                if r.status_code == 200:
                    body = r.json()
                    active = {item["slug"] for item in body.get("active", [])}
                    new = active - seen
                    cleared = seen - active
                    for slug in sorted(new):
                        scenario = next(
                            (s for s in body.get("active", []) if s["slug"] == slug),
                            {"slug": slug},
                        )
                        await ws_module.get_manager().broadcast("alert", scenario)
                    for slug in sorted(cleared):
                        await ws_module.get_manager().broadcast("alert_cleared", {"slug": slug})
                    seen = active
            except httpx.HTTPError:
                pass
            except Exception as exc:
                log.warning("scenario poll loop error: %s", exc)
            await asyncio.sleep(SCENARIO_POLL_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    get_manager().set_broadcast(_broadcast_threadsafe(loop))
    poll_task = asyncio.create_task(_poll_scenario_engine(), name="scenario-poll")
    try:
        yield
    finally:
        poll_task.cancel()
        try:
            await poll_task
        except (asyncio.CancelledError, Exception):
            pass
        get_manager().set_broadcast(None)


app = FastAPI(title="Triagent", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InvestigateResponse(BaseModel):
    scenario_id: str
    namespace: str
    failing_pod: str | None
    findings: list[str]
    hypotheses: str
    root_cause: str
    confidence: float
    trace: list[dict]
    latency_ms: float
    tokens_spent: int = 0
    token_budget: int = 0
    cost_usd: float = 0.0
    cost_by_provider: dict[str, float] = {}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "context": os.environ.get("K8S_CONTEXT", "k3d-dc"),
        "mock_llm": os.environ.get("USE_MOCK_LLM", "true"),
    }


@app.get("/chaos")
def chaos_state() -> dict[str, Any]:
    return get_controller().state.snapshot()


def _broadcast_chaos() -> None:
    """Synchronous helper for chaos endpoints; falls back gracefully if no loop."""
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(
            ws_module.get_manager().broadcast("chaos_state", get_controller().state.snapshot())
        )
    except RuntimeError:
        pass


@app.post("/chaos/kill_provider/{name}")
async def chaos_kill_provider(name: str) -> dict[str, Any]:
    get_controller().kill_provider(name)
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.post("/chaos/restore_provider/{name}")
async def chaos_restore_provider(name: str) -> dict[str, Any]:
    get_controller().restore_provider(name)
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.post("/chaos/kill_tool/{name}")
async def chaos_kill_tool(name: str) -> dict[str, Any]:
    get_controller().kill_tool(name)
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.post("/chaos/restore_tool/{name}")
async def chaos_restore_tool(name: str) -> dict[str, Any]:
    tool_registry.restore(name)
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.post("/chaos/set_latency")
async def chaos_set_latency(ms: float = Query(..., ge=0, le=30000)) -> dict[str, Any]:
    get_controller().set_latency(ms)
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.post("/chaos/clear")
async def chaos_clear() -> dict[str, Any]:
    get_controller().clear()
    snap = get_controller().state.snapshot()
    await ws_module.get_manager().broadcast("chaos_state", snap)
    return snap


@app.get("/scenarios")
def scenarios() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for p in sorted(SCENARIOS_DIR.glob("*.yaml")):
        data = yaml.safe_load(p.read_text())
        out.append(
            {
                "slug": p.stem,
                "id": data.get("id", p.stem),
                "name": data.get("name", p.stem),
                "namespace": data.get("namespace", "triagent-demo"),
                "expected_root_cause": data.get("expected_root_cause", ""),
            }
        )
    return out


@app.get("/incidents")
def incidents() -> list[dict[str, Any]]:
    manager = get_manager()
    out: list[dict[str, Any]] = []
    for p in sorted(SCENARIOS_DIR.glob("*.yaml")):
        data = yaml.safe_load(p.read_text())
        slug = p.stem
        latest = manager.latest_for(slug)
        out.append(
            {
                "slug": slug,
                "id": data.get("id", slug),
                "name": data.get("name", slug),
                "namespace": data.get("namespace", "triagent-demo"),
                "expected_root_cause": data.get("expected_root_cause", ""),
                "alert_summary": data.get("alert_summary") or data.get("description") or "",
                "latest_investigation_id": latest.id if latest else None,
                "latest_status": latest.status if latest else None,
            }
        )
    return out


class StartInvestigationBody(BaseModel):
    scenario: str
    cleanup: bool = False
    wait_seconds: int = 35


@app.post("/investigations")
def start_investigation(body: StartInvestigationBody) -> dict[str, Any]:
    manager = get_manager()
    try:
        state = manager.start(body.scenario, cleanup=body.cleanup, wait_seconds=body.wait_seconds)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc))
    except _SingleInflightError as exc:
        raise HTTPException(409, str(exc))
    return {"id": state.id, "status": state.status, "phase": state.phase}


@app.get("/investigations/{inv_id}")
def get_investigation(inv_id: str) -> dict[str, Any]:
    state = get_manager().get(inv_id)
    if state is None:
        raise HTTPException(404, f"unknown investigation: {inv_id}")
    return state.snapshot()


@app.get("/investigations")
def list_investigations(limit: int = Query(10, ge=1, le=50)) -> list[dict[str, Any]]:
    return [s.snapshot() for s in get_manager().list_recent(limit=limit)]


class ReplayBody(BaseModel):
    chaos_override: dict = {}
    from_step: int = 0


@app.post("/investigations/{inv_id}/replay")
def replay_investigation(inv_id: str, body: ReplayBody) -> dict[str, Any]:
    manager = get_manager()
    try:
        state = manager.replay(inv_id, body.chaos_override, from_step=body.from_step)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc))
    except _SingleInflightError as exc:
        raise HTTPException(409, str(exc))
    return {
        "id": state.id,
        "status": state.status,
        "phase": state.phase,
        "counterfactual_of": state.counterfactual_of,
    }


@app.get("/investigate", response_model=InvestigateResponse)
def investigate(
    scenario: str = Query(..., description="scenario slug, e.g. 01-crashloop"),
    cleanup: bool = Query(False, description="delete the scenario namespace after the run"),
    wait_seconds: int = Query(35, ge=0, le=120),
) -> InvestigateResponse:
    path = SCENARIOS_DIR / f"{scenario}.yaml"
    if not path.exists():
        raise HTTPException(404, f"unknown scenario: {scenario}")
    data = yaml.safe_load(path.read_text())
    namespace = data.get("namespace", "triagent-demo")
    scenario_id = data.get("id", scenario)
    expected = data.get("expected_root_cause", "")

    kubectl = KubectlTool()
    manifests_yaml = _render_manifests(data)

    try:
        kubectl.ensure_namespace(namespace)
        if manifests_yaml:
            kubectl.apply_manifest(manifests_yaml)
            _wait_until_unhealthy(kubectl, namespace, wait_seconds)
    except KubectlError as exc:
        raise HTTPException(500, f"kubectl setup failed: {exc}")

    gateway = build_default_gateway()
    try:
        result = run_investigation(
            scenario_id=scenario_id,
            namespace=namespace,
            expected_root_cause=expected,
            gateway=gateway,
            kubectl=kubectl,
        )
    finally:
        if cleanup and manifests_yaml:
            try:
                kubectl.delete_manifest(manifests_yaml)
            except KubectlError:
                pass

    return InvestigateResponse(**result)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    mgr = ws_module.get_manager()
    await mgr.connect(websocket)
    try:
        try:
            providers_snapshot = list(build_default_gateway().providers.keys())
        except Exception:
            providers_snapshot = []
        await websocket.send_text(
            ws_module.Event(
                type="initial_state",
                payload={
                    "chaos": get_controller().state.snapshot(),
                    "history": mgr.snapshot_history(),
                    "tools": sorted(tool_registry.list_registered()),
                    "providers": providers_snapshot,
                },
            ).to_json()
        )
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text(
                    ws_module.Event(type="pong", payload={}).to_json()
                )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("ws session error: %s", exc)
    finally:
        await mgr.disconnect(websocket)


# Static mount for the built Vite war room. Optional - safe if dir does not exist
# yet so dev mode can still boot before the first npm run build.
if WARROOM_DIST.is_dir():
    app.mount(
        "/warroom",
        StaticFiles(directory=str(WARROOM_DIST), html=True),
        name="warroom",
    )

_EVAL_RESULTS = Path(__file__).resolve().parent.parent / "eval" / "results"
if _EVAL_RESULTS.is_dir():
    app.mount("/static/eval", StaticFiles(directory=str(_EVAL_RESULTS)), name="eval")


def _render_manifests(scenario: dict[str, Any]) -> str:
    docs: list[dict[str, Any]] = []
    scenario_namespace = scenario.get("namespace", "triagent-demo")
    default_name = scenario.get("id", "triagent-target").replace("_", "-")
    for idx, m in enumerate(scenario.get("manifests", []) or []):
        kind = m.get("kind")
        name = m.get("name", f"{default_name}-{idx}")
        target_ns = m.get("namespace") or scenario_namespace
        if target_ns.startswith("kube-"):
            target_ns = scenario_namespace
        if kind == "Deployment":
            containers = (m.get("spec", {}) or {}).get("containers") or m.get("containers") or []
            if not containers:
                containers = [
                    {
                        "name": "app",
                        "image": "nginx:1.27",
                    }
                ]
            resources = m.get("resources")
            if resources and containers:
                containers[0].setdefault("resources", resources)
            docs.append(
                {
                    "apiVersion": "apps/v1",
                    "kind": "Deployment",
                    "metadata": {
                        "name": name,
                        "namespace": target_ns,
                        "labels": {"app": name, "triagent-scenario": scenario.get("id", "")},
                    },
                    "spec": {
                        "replicas": 1,
                        "selector": {"matchLabels": {"app": name}},
                        "template": {
                            "metadata": {"labels": {"app": name}},
                            "spec": {"containers": containers},
                        },
                    },
                }
            )
        elif kind == "ConfigMap":
            data = m.get("data") or {}
            docs.append(
                {
                    "apiVersion": "v1",
                    "kind": "ConfigMap",
                    "metadata": {
                        "name": name,
                        "namespace": target_ns,
                        "labels": {"triagent-scenario": scenario.get("id", "")},
                    },
                    "data": data,
                }
            )
    return "\n---\n".join(yaml.safe_dump(d) for d in docs)


def _wait_until_unhealthy(kubectl: KubectlTool, namespace: str, max_seconds: int) -> None:
    deadline = time.time() + max_seconds
    while time.time() < deadline:
        try:
            pods = kubectl.get_pods(namespace)
        except KubectlError:
            time.sleep(2)
            continue
        for p in pods.pods:
            if p.phase not in {"Running", "Succeeded", "Pending"}:
                return
            for c in p.containers:
                if c.restart_count >= 1:
                    return
                if c.current.reason in {"CrashLoopBackOff", "ImagePullBackOff", "Error"}:
                    return
                if c.last and c.last.reason:
                    return
        time.sleep(2)
