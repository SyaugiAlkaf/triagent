from __future__ import annotations

from pathlib import Path

import yaml

from app.main import _render_manifests


SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "scenarios"


def _load(slug: str) -> dict:
    return yaml.safe_load((SCENARIOS_DIR / f"{slug}.yaml").read_text())


def _parse_rendered(rendered: str) -> list[dict]:
    return [d for d in yaml.safe_load_all(rendered) if d]


def test_render_01_crashloop():
    rendered = _render_manifests(_load("01-crashloop"))
    docs = _parse_rendered(rendered)
    assert len(docs) == 1
    dep = docs[0]
    assert dep["kind"] == "Deployment"
    assert dep["metadata"]["namespace"] == "triagent-demo"
    container = dep["spec"]["template"]["spec"]["containers"][0]
    env_names = [e["name"] for e in container.get("env", [])]
    assert "DATABASE_URL" in env_names
    assert container["command"] == ["/bin/sh", "-c", 'test -n "$DATABASE_URL" || exit 1']


def test_render_02_oom():
    rendered = _render_manifests(_load("02-oom"))
    docs = _parse_rendered(rendered)
    assert len(docs) == 1
    dep = docs[0]
    assert dep["kind"] == "Deployment"
    assert dep["metadata"]["namespace"] == "triagent-oom"
    container = dep["spec"]["template"]["spec"]["containers"][0]
    assert container["resources"]["limits"]["memory"] == "64Mi"
    assert "bytearray" in container["command"][-1]


def test_render_03_dns_includes_configmap_and_deployment():
    rendered = _render_manifests(_load("03-dns"))
    docs = _parse_rendered(rendered)
    kinds = sorted(d["kind"] for d in docs)
    assert kinds == ["ConfigMap", "Deployment"]
    cm = next(d for d in docs if d["kind"] == "ConfigMap")
    # kube-system targets are rewritten to the scenario namespace to
    # protect the cluster's real CoreDNS.
    assert cm["metadata"]["namespace"] == "triagent-dns"
    assert "Corefile" in cm["data"]
    dep = next(d for d in docs if d["kind"] == "Deployment")
    assert dep["metadata"]["namespace"] == "triagent-dns"
    container = dep["spec"]["template"]["spec"]["containers"][0]
    assert container["image"].startswith("busybox")


def test_unknown_kind_is_silently_skipped():
    rendered = _render_manifests(
        {
            "id": "x",
            "namespace": "triagent-x",
            "manifests": [{"kind": "Mystery", "name": "what"}],
        }
    )
    assert rendered == ""
