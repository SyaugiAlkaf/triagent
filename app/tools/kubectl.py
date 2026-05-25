from __future__ import annotations

import json
import os
import subprocess
from typing import Literal, Protocol, runtime_checkable

import httpx
from pydantic import BaseModel, Field


class ContainerState(BaseModel):
    state: Literal["running", "waiting", "terminated", "unknown"] = "unknown"
    reason: str | None = None
    message: str | None = None
    exit_code: int | None = None


class ContainerStatus(BaseModel):
    name: str
    ready: bool = False
    restart_count: int = 0
    current: ContainerState = Field(default_factory=ContainerState)
    last: ContainerState | None = None


class Pod(BaseModel):
    name: str
    namespace: str
    phase: str = "Unknown"
    reason: str | None = None
    message: str | None = None
    containers: list[ContainerStatus] = Field(default_factory=list)

    @property
    def summary(self) -> str:
        c = self.containers[0] if self.containers else None
        if c is None:
            return f"{self.name} phase={self.phase}"
        return (
            f"{self.name} phase={self.phase} container={c.name} "
            f"restarts={c.restart_count} state={c.current.state} "
            f"reason={c.current.reason or c.last.reason if c.last else None}"
        )


class PodList(BaseModel):
    namespace: str
    pods: list[Pod]


class DescribeOutput(BaseModel):
    name: str
    namespace: str
    raw: str
    events_tail: list[str] = Field(default_factory=list)


class LogOutput(BaseModel):
    pod: str
    namespace: str
    container: str | None = None
    previous: bool = False
    text: str


class Event(BaseModel):
    type: str
    reason: str
    object: str
    message: str
    count: int = 1


class EventList(BaseModel):
    namespace: str
    events: list[Event]


class KubectlError(RuntimeError):
    def __init__(self, cmd: list[str], returncode: int, stderr: str):
        super().__init__(f"kubectl {' '.join(cmd[1:])} exited {returncode}: {stderr.strip()}")
        self.cmd = cmd
        self.returncode = returncode
        self.stderr = stderr


@runtime_checkable
class KubectlProtocol(Protocol):
    def get_pods(self, namespace: str) -> PodList: ...

    def describe_pod(self, name: str, namespace: str) -> DescribeOutput: ...

    def logs(
        self,
        pod: str,
        namespace: str,
        container: str | None = ...,
        previous: bool = ...,
        tail: int = ...,
    ) -> LogOutput: ...


class KubectlTool:
    def __init__(self, context: str | None = None, timeout: float = 20.0):
        self.context = context or os.environ.get("K8S_CONTEXT", "k3d-dc")
        self.timeout = timeout

    def _run(self, args: list[str], *, stdin: str | None = None, check: bool = True) -> str:
        cmd = ["kubectl", "--context", self.context, *args]
        proc = subprocess.run(
            cmd,
            input=stdin,
            capture_output=True,
            text=True,
            timeout=self.timeout,
        )
        if check and proc.returncode != 0:
            raise KubectlError(cmd, proc.returncode, proc.stderr)
        return proc.stdout

    def ensure_namespace(self, namespace: str) -> None:
        out = self._run(["get", "ns", namespace, "--ignore-not-found", "-o", "name"])
        if not out.strip():
            self._run(["create", "namespace", namespace])

    def apply_manifest(self, manifest_yaml: str) -> str:
        return self._run(["apply", "-f", "-"], stdin=manifest_yaml)

    def delete_manifest(self, manifest_yaml: str) -> str:
        return self._run(
            ["delete", "-f", "-", "--ignore-not-found", "--wait=false"],
            stdin=manifest_yaml,
            check=False,
        )

    def get_pods(self, namespace: str) -> PodList:
        raw = self._run(["get", "pods", "-n", namespace, "-o", "json"])
        data = json.loads(raw)
        pods: list[Pod] = []
        for item in data.get("items", []):
            status = item.get("status", {})
            containers: list[ContainerStatus] = []
            for cs in status.get("containerStatuses", []) or []:
                state_obj = cs.get("state", {}) or {}
                state_key = next(iter(state_obj), "unknown")
                state = ContainerState(
                    state=state_key if state_key in {"running", "waiting", "terminated"} else "unknown",
                    reason=(state_obj.get(state_key) or {}).get("reason"),
                    message=(state_obj.get(state_key) or {}).get("message"),
                    exit_code=(state_obj.get(state_key) or {}).get("exitCode"),
                )
                last_obj = cs.get("lastState", {}) or {}
                last_key = next(iter(last_obj), None)
                last = None
                if last_key:
                    last = ContainerState(
                        state=last_key if last_key in {"running", "waiting", "terminated"} else "unknown",
                        reason=(last_obj.get(last_key) or {}).get("reason"),
                        message=(last_obj.get(last_key) or {}).get("message"),
                        exit_code=(last_obj.get(last_key) or {}).get("exitCode"),
                    )
                containers.append(
                    ContainerStatus(
                        name=cs.get("name", "?"),
                        ready=cs.get("ready", False),
                        restart_count=cs.get("restartCount", 0),
                        current=state,
                        last=last,
                    )
                )
            pods.append(
                Pod(
                    name=item["metadata"]["name"],
                    namespace=item["metadata"].get("namespace", namespace),
                    phase=status.get("phase", "Unknown"),
                    reason=status.get("reason"),
                    message=status.get("message"),
                    containers=containers,
                )
            )
        return PodList(namespace=namespace, pods=pods)

    def describe_pod(self, name: str, namespace: str) -> DescribeOutput:
        raw = self._run(["describe", "pod", name, "-n", namespace])
        events: list[str] = []
        in_events = False
        for line in raw.splitlines():
            if line.startswith("Events:"):
                in_events = True
                continue
            if in_events and line.strip():
                events.append(line.strip())
        return DescribeOutput(name=name, namespace=namespace, raw=raw, events_tail=events[-10:])

    def logs(
        self,
        pod: str,
        namespace: str,
        container: str | None = None,
        previous: bool = False,
        tail: int = 100,
    ) -> LogOutput:
        args = ["logs", pod, "-n", namespace, f"--tail={tail}"]
        if container:
            args.extend(["-c", container])
        if previous:
            args.append("--previous")
        text = self._run(args, check=False)
        return LogOutput(pod=pod, namespace=namespace, container=container, previous=previous, text=text)

    def get_events(self, namespace: str) -> EventList:
        raw = self._run(
            ["get", "events", "-n", namespace, "--sort-by=.lastTimestamp", "-o", "json"]
        )
        data = json.loads(raw)
        events = [
            Event(
                type=item.get("type", "Normal"),
                reason=item.get("reason", ""),
                object=f"{item.get('involvedObject', {}).get('kind', '?')}/{item.get('involvedObject', {}).get('name', '?')}",
                message=item.get("message", ""),
                count=item.get("count", 1),
            )
            for item in data.get("items", [])
        ]
        return EventList(namespace=namespace, events=events)


class RemoteKubectlTool:
    """HTTP-backed kubectl that talks to the scenario engine.

    Implements KubectlProtocol; the agent cannot distinguish this from the
    subprocess-backed KubectlTool. Returns empty results when no scenario is
    active in the requested namespace - matches the real cluster behaviour.
    """

    def __init__(self, base_url: str | None = None, timeout: float = 5.0):
        self.base_url = (base_url or os.environ.get("SCENARIO_ENGINE_URL", "http://localhost:8002")).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict | None = None) -> dict:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(f"{self.base_url}{path}", params=params or {})
        except httpx.HTTPError as exc:
            raise KubectlError(["scenario-engine", path], -1, str(exc)) from exc
        if r.status_code == 404:
            raise KubectlError(["scenario-engine", path], 404, r.text)
        if r.status_code >= 400:
            raise KubectlError(["scenario-engine", path], r.status_code, r.text)
        return r.json()

    def get_pods(self, namespace: str) -> PodList:
        data = self._get(f"/kubectl/get_pods/{namespace}")
        pods: list[Pod] = []
        for item in data.get("pods", []):
            containers = []
            for c in item.get("containers", []):
                current_obj = c.get("current") or {}
                last_obj = c.get("last")
                current = ContainerState(
                    state=current_obj.get("state") or "unknown",
                    reason=current_obj.get("reason"),
                    message=current_obj.get("message"),
                    exit_code=current_obj.get("exit_code"),
                )
                last = None
                if last_obj:
                    last = ContainerState(
                        state=last_obj.get("state") or "unknown",
                        reason=last_obj.get("reason"),
                        message=last_obj.get("message"),
                        exit_code=last_obj.get("exit_code"),
                    )
                containers.append(
                    ContainerStatus(
                        name=c.get("name", "?"),
                        ready=c.get("ready", False),
                        restart_count=c.get("restart_count", 0),
                        current=current,
                        last=last,
                    )
                )
            pods.append(
                Pod(
                    name=item.get("name", "?"),
                    namespace=item.get("namespace", namespace),
                    phase=item.get("phase", "Unknown"),
                    reason=item.get("reason"),
                    message=item.get("message"),
                    containers=containers,
                )
            )
        return PodList(namespace=namespace, pods=pods)

    def describe_pod(self, name: str, namespace: str) -> DescribeOutput:
        try:
            data = self._get(f"/kubectl/describe/{name}", {"namespace": namespace})
        except KubectlError as exc:
            if exc.returncode == 404:
                return DescribeOutput(name=name, namespace=namespace, raw="", events_tail=[])
            raise
        return DescribeOutput(
            name=data.get("name", name),
            namespace=data.get("namespace", namespace),
            raw=data.get("raw", ""),
            events_tail=data.get("events_tail", []),
        )

    def logs(
        self,
        pod: str,
        namespace: str,
        container: str | None = None,
        previous: bool = False,
        tail: int = 100,
    ) -> LogOutput:
        params = {"namespace": namespace, "previous": previous, "tail": tail}
        if container:
            params["container"] = container
        try:
            data = self._get(f"/kubectl/logs/{pod}", params)
        except KubectlError as exc:
            if exc.returncode == 404:
                return LogOutput(
                    pod=pod, namespace=namespace, container=container,
                    previous=previous, text="",
                )
            raise
        return LogOutput(
            pod=data.get("pod", pod),
            namespace=data.get("namespace", namespace),
            container=data.get("container", container),
            previous=data.get("previous", previous),
            text=data.get("text", ""),
        )

    def get_events(self, namespace: str) -> EventList:
        data = self._get(f"/kubectl/events/{namespace}")
        events = [
            Event(
                type=e.get("type", "Normal"),
                reason=e.get("reason", ""),
                object=e.get("object", "?"),
                message=e.get("message", ""),
                count=e.get("count", 1),
            )
            for e in data.get("events", [])
        ]
        return EventList(namespace=namespace, events=events)

    def ensure_namespace(self, namespace: str) -> None:
        # The scenario engine does not need a namespace to exist - it owns the
        # fake cluster state. No-op here so the runner code path is identical.
        return None

    def apply_manifest(self, manifest_yaml: str) -> str:
        # Same: the engine pre-loads scenarios; nothing to apply at this layer.
        return ""

    def delete_manifest(self, manifest_yaml: str) -> str:
        return ""


_default_tool: KubectlTool | None = None


def default_tool() -> KubectlTool:
    global _default_tool
    if _default_tool is None:
        _default_tool = KubectlTool()
    return _default_tool
