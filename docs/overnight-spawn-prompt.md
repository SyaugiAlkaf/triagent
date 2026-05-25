# Overnight spawn prompt — paste into a fresh Claude Code session

> **How to use:** Open a new Claude Code session, `cd ~/Desktop/Development/projects/triagent`, paste everything below the `---` line. Then go to sleep. In the morning read `docs/overnight-run-report.md`.

---

You are the autonomous overnight build agent for **Triagent**. Read `CLAUDE.md` and `GOALS.md` first — they have the full context, branch rules, stack, and the six named features. Do not re-derive context I already wrote down.

## Goal

Close out **Day 3 and Day 4** scope, plus the Day 5 Replay tab and hypothesis confidence tracker. All in mock mode (`USE_MOCK_LLM=true`). When you finish, write `docs/overnight-run-report.md` summarizing what shipped, what's open, and any deferred items.

## Phases (one branch per phase, stacked off master after merge)

### Phase 1 — `feat/tools-layer-and-scenarios` (Day 3 scope)
1. Read `scenarios/02-oom.yaml` and `scenarios/03-dns.yaml`. Extend `app/main.py::_render_manifests` if either needs fields the converter doesn't handle (env vars, resources, configmaps). Add a unit test that renders both to valid manifests.
2. Apply 02 and 03 to `k3d-dc` via `kubectl apply -f -`, confirm `_wait_until_unhealthy` triggers within 60s each. Cleanup the namespaces after.
3. Write `app/tools/prometheus.py` — thin httpx wrapper around `/api/v1/query` and `/api/v1/query_range`, pydantic-typed `Sample`/`Series` outputs, `PrometheusError` exception, `default_tool()` singleton helper. Reads `PROMETHEUS_URL` env. Health-check failure → `PrometheusError`.
4. Write `app/tools/loki.py` — thin httpx wrapper around `/loki/api/v1/query_range`, pydantic-typed `LogEntry` outputs, `LokiError` exception. Reads `LOKI_URL` env.
5. Write `app/tools/__init__.py` — tool registry: `register(name, tool)`, `get(name)`, `quarantine(name)`, `restore(name)`, `is_quarantined(name)`. Reads `ChaosController.killed_tools` so chaos panel can also kill tools.
6. Smoke: import everything, register kubectl/prometheus/loki, quarantine prometheus, verify `is_quarantined` returns True, `get` raises if quarantined.
7. Merge to master with `--no-ff`.

### Phase 2 — `feat/agent-quarantine` (Day 4 scope)
1. Modify `app/agent.py::investigate_node` — if `kubectl` is quarantined, attempt the alternate path via the prometheus tool (use mock data for now since no real Prom backend). If both quarantined, append a `tool_unavailable` finding and skip to hypothesize with degraded inputs.
2. Add FastAPI endpoints: `POST /chaos/kill_tool/{name}`, `POST /chaos/restore_tool/{name}`.
3. Add Chaos Panel buttons in `app/ui.py`: `Kill kubectl`, `Kill prometheus`, `Restore tools`. State badges show currently-killed tools.
4. Smoke: run scenario 1 in mock mode, kill kubectl via API mid-flow, confirm agent reaches a verdict using prometheus path. Trace must include `tool_quarantine` and `tool_substitute` events.
5. Merge to master with `--no-ff`.

### Phase 3 — `feat/replay-and-confidence` (Day 5 scope, partial)
1. Replay tab in `app/ui.py`: when an investigation finishes, store its trace in `st.session_state["last_trace"]`. Slider scrubs across trace indices, step detail panel renders the selected event with its full payload.
2. Hypothesis confidence tracker in Investigation tab: parse hypotheses text with `app.agent.CONF_RX`, render a ranked list with `st.progress` bars per hypothesis.
3. No CSS polish, no theme changes (user said hold polish).
4. Smoke: run scenario 1 in mock mode through the UI flow imports, confirm session state populates.
5. Merge to master with `--no-ff`.

### Phase 4 — Report + GOALS.md
1. Write `docs/overnight-run-report.md` covering: branches created, files added, smoke tests run + outcomes, GOALS.md items now `[x]`, anything deferred or `[!]` blocked with reasons.
2. Tick the relevant Day 3/4/5 items in `GOALS.md` with `2026-05-19` timestamp.
3. Single commit on master: `docs: overnight run report 2026-05-19`.

## Hard guardrails (do not cross)

- **Branches:** every code phase on its own `feat/*` branch. Merge to master with `--no-ff` only after smoke passes. Never commit code directly to master (project rule, see `feedback_branch_workflow.md`).
- **No remote push.** Local commits only. Syaugi pushes manually in the morning.
- **No `--no-verify`, no `--no-gpg-sign`.** Pre-commit gate must pass; if it blocks, fix the root cause and recommit.
- **Mock mode only.** `USE_MOCK_LLM=true`. Do not attempt real Groq/Ollama calls. Do not pip-install new packages.
- **No new features beyond the six named ones.** Anything tempting and adjacent goes to a `[ ]` row in GOALS.md, not into the code.
- **Don't touch** `demo/responses_cache.json` (Day 8), eval harness (Day 7-8), video footage (Day 9).

## Decision rules (pre-baked, do not stall)

- Naming/structure ambiguity → pick smaller change, note alternative in commit body.
- Missing dependency → use stdlib + already-installed packages from `requirements.txt`. Do NOT `pip install`. If a phase genuinely needs a new package, skip that step and document it in the report.
- k3d cluster down or unreachable → skip cluster-touching steps in Phase 1 step 2, finish file-only work, note in report under "deferred — needs cluster".
- Prometheus/Loki not running → wrapper still ships, smoke test uses mock HTTP responses or skips network call. Real-backend verification is morning work.
- Smoke test hangs >2 minutes → kill it, mark the phase item `[!]` in report with the hang signature, move to the next phase.
- Pre-commit gate blocks legitimately → fix the real issue and create a new commit. Never amend across hook failures.

## Stop-cleanly clause

If a phase breaks irrecoverably, context runs low, or smoke tests fail in a way you can't diagnose in a reasonable attempt:
1. Finish whatever can land cleanly on the current phase branch.
2. Merge it to master only if its own smoke passes.
3. Write `docs/overnight-run-report.md` with partial state honestly described.
4. Exit. Don't half-commit, don't push, don't force-merge a broken phase.

## In-flight memory

At the start of the run, write `/Users/syaugi/.claude/projects/-Users-syaugi-Desktop-Development-projects-triagent/memory/overnight_run_in_flight.md` with the phase plan + start timestamp. When done, replace its body with a one-paragraph completion record and a pointer to `docs/overnight-run-report.md`.

## Servers

The dev API and UI may still be running on ports 8000 and 8501 from the prior session (`/tmp/triagent-api.log`, `/tmp/triagent-ui.log`). Restart them if needed to verify endpoints; otherwise leave them.

Begin Phase 1 now. Report when done.
