"""Live cluster smoke. Not pytest-collected by default.

Run: .venv/bin/python tests/scenario_apply_smoke.py <slug>
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import _render_manifests, _wait_until_unhealthy
from app.tools.kubectl import KubectlError, KubectlTool


def run(slug: str, max_wait: int = 60) -> int:
    data = yaml.safe_load((ROOT / "scenarios" / f"{slug}.yaml").read_text())
    namespace = data.get("namespace", "triagent-demo")
    rendered = _render_manifests(data)
    if not rendered:
        print(f"no manifests rendered for {slug}", file=sys.stderr)
        return 2
    kubectl = KubectlTool()
    try:
        kubectl.ensure_namespace(namespace)
        kubectl.apply_manifest(rendered)
        started = time.time()
        _wait_until_unhealthy(kubectl, namespace, max_wait)
        elapsed = time.time() - started
        pods = kubectl.get_pods(namespace)
        print(f"{slug}: unhealthy_in={elapsed:.1f}s pods={len(pods.pods)}")
        for p in pods.pods:
            print(f"  - {p.summary}")
        return 0
    except KubectlError as exc:
        print(f"{slug}: kubectl error {exc}", file=sys.stderr)
        return 3
    finally:
        try:
            kubectl.delete_manifest(rendered)
            kubectl._run(["delete", "namespace", namespace, "--ignore-not-found", "--wait=false"], check=False)
        except KubectlError:
            pass


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "02-oom"
    max_wait = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    sys.exit(run(slug, max_wait))
