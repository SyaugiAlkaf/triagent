# Overnight run report - 2026-05-18 / 2026-05-19

Autonomous build covering Day 3, Day 4, and the open Day 5 items from `GOALS.md`. Mock-mode only (`USE_MOCK_LLM=true`), no remote pushes, no `--no-verify`. Started 2026-05-18 21:22 WIB.

## Branches landed

| Phase | Branch | Merge commit |
|---|---|---|
| Day 3 | `feat/tools-layer-and-scenarios` | `5533064` |
| Day 4 | `feat/agent-quarantine` | `7238f7d` |
| Day 5 partial | `feat/replay-and-confidence` | `9b961ee` |

Each branch was merged into `master` with `--no-ff` only after its own smoke passed. All commits live locally and remain unpushed; Syaugi pushes manually.

## Files added or changed

- `app/agent.py` - `_investigate_via_prometheus` substitute path, `parse_hypotheses` helper for the confidence tracker.
- `app/main.py` - `_register_default_tools()` at import time (kubectl + prometheus/MockPrometheusTool + loki), `_render_manifests` ConfigMap support and kube-system rewrite guard, new endpoints `POST /chaos/kill_tool/{name}` and `POST /chaos/restore_tool/{name}`.
- `app/tools/__init__.py` - tool registry (`register`, `get`, `quarantine`, `restore`, `is_quarantined`, `clear`) honoring `ChaosController.killed_tools`.
- `app/tools/prometheus.py` - real `PrometheusTool` httpx wrapper (`/api/v1/query`, `/api/v1/query_range`) with `Sample` / `Series` / `PrometheusError`; `MockPrometheusTool` returning canned restart / memory / DNS samples for offline substitution.
- `app/tools/loki.py` - `LokiTool` httpx wrapper for `/loki/api/v1/query_range` with `LogEntry` / `LokiError`.
- `app/ui.py` - Chaos Panel Kill kubectl / Kill prometheus / Restore tools buttons + killed-tools badge; Replay tab with slider scrubber and event payload viewer; Investigation tab hypothesis progress bars; trace colours for `tool_quarantine` / `tool_substitute` / `tool_unavailable` / `tool_error`.
- `scenarios/02-oom.yaml` - rewritten to actually OOMKill (`python:3.12-alpine` allocating 200MB under a 64Mi limit, isolated to `triagent-oom`).
- `scenarios/03-dns.yaml` - busybox `nslookup nonexistent-host.invalid` CrashLoop and a `coredns-shadow` ConfigMap, namespace `triagent-dns`. The renderer rewrites the kube-system reference to the scenario namespace so the real cluster CoreDNS is untouched.
- `tests/test_render_manifests.py`, `tests/test_tool_registry.py`, `tests/test_agent_quarantine.py`, `tests/test_hypothesis_parsing.py`, `tests/scenario_apply_smoke.py` (live-cluster smoke, not pytest-collected by default).

## Smoke results

- `pytest tests/` (excluding the live-cluster smoke): **13 passed**.
- Cluster apply via `tests/scenario_apply_smoke.py`:
  - `02-oom`: unhealthy detected in 12.9s, container `terminated reason=OOMKilled`.
  - `03-dns`: unhealthy detected in 12.6s, container `restarts=1 reason=Error`.
- E2E API smoke (mock LLM, kubectl quarantined before run, `/investigate?scenario=01-crashloop`):
  - Trace kinds: `plan, tool_quarantine, tool_substitute, tool_call, tool_call, provider_call, provider_call`.
  - Findings sourced from `MockPrometheusTool` (restart count, memory pressure).
  - Confidence 0.86, correct root cause text returned.
- `import app.ui` runs without errors (Streamlit bare-mode warnings are expected).
- Streamlit on :8501 restarted and returns HTTP 200.

## GOALS.md items moved to `[x]`

Day 3:
- [x] Validate scenarios 2 (OOM) and 3 (CoreDNS) YAMLs render to valid manifests through `_render_manifests`
- [x] Apply 02-oom and 03-dns to k3d-dc, confirm `_wait_until_unhealthy` triggers correctly
- [x] `app/tools/prometheus.py` httpx wrapper + pydantic Sample/Series
- [x] `app/tools/loki.py` httpx wrapper + pydantic LogEntry
- [x] `app/tools/__init__.py` tool registry, ChaosController-aware
- [x] Hypothesis confidence tracker added to Investigation tab

Day 4:
- [x] Agent state machine consults tool registry (kubectl quarantined -> prometheus; both quarantined -> degraded with `tool_unavailable`)
- [x] Chaos Panel: Kill kubectl / Kill prometheus / Restore tools buttons via `/chaos/kill_tool/{name}` and `/chaos/restore_tool/{name}`
- [x] End-to-end smoke proved via API (mock LLM; real cluster verification with mid-flow kubectl kill on 03-dns is a morning step)

Day 5:
- [x] Replay tab: timeline scrubber over the trace list, step detail panel (pulls last result from session state)
- [-] Cheap polish pass (gradient header, monospace trace, pulsing CHAOS indicator) - explicitly held by user; left open as a Day 6 candidate

Day 6 (early landing):
- [x] MCP tool quarantine fully wired - Kill kubectl button quarantines it, agent picks prometheus alternate, trace shows substitution

## Deferred / blocked

- Polish pass (header, fonts, pulsing indicator) - user said hold; left as Day 6 row.
- Live mid-investigation kubectl kill against 03-dns on the real cluster: the building blocks are in place (`POST /chaos/kill_tool/kubectl` mid-run), but timing this requires a manual two-process orchestration which is a better morning task than overnight.
- Eval tab file uploader / chart preview: still on the Day 5 list, deferred to Day 6 build sprint per the freeze plan.

## What to do next (morning hand-off)

1. Open the Streamlit UI, hit Investigation -> run `01-crashloop`, then jump to Replay tab to verify the scrubber populates.
2. Press `Kill kubectl` in the Chaos Panel, run 01-crashloop again, confirm the trace shows `tool_quarantine` + `tool_substitute` and findings sourced from prometheus.
3. Push the seven new local commits to GitHub.
4. Decide whether the polish pass and Eval-tab uploader land before the Day 6 build sprint or get folded into it.
