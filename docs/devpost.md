# Triagent

> **Built on TrueFoundry AI Gateway.** A resilient Kubernetes incident agent
> that survives infrastructure chaos in its own tooling. Submission for the
> TrueFoundry **Resilient Agents** track at DevNetwork [AI+ML] 2026.

---

## Inspiration

In January 2026 TrueFoundry shipped **TrueFailover** — automatic reroute around
LLM provider outages, brownouts, and MCP server failures. The Resilient Agents
track brief reads: *"How does your agent behave when an MCP server starts
erroring out? An LLM server goes down? OpenAI or Claude errors out or browns
out?"* That brief is fishing for a hackathon-sized demo of TrueFoundry's
product in action.

We built one. Every LLM call in Triagent goes through `gateway.truefoundry.ai`.
The demo is a K8s incident-response agent that an SRE could run on their own
cluster, with TrueFoundry as the load-bearing routing layer underneath. Three
free models — Groq Llama-3.3-70B, Google Gemini Gemma, OpenRouter Arcee — sit
behind that one gateway, each individually killable in front of the camera.

## What it does

Triagent is a LangGraph state machine that investigates failing pods on a
local k3d cluster. The `plan → investigate → hypothesize → verify` loop runs
through the **TrueFoundry AI Gateway**, which we use as the production routing
layer. Three virtual models — `tf-primary` (Groq), `tf-verify` (Gemini),
`tf-tertiary` (OpenRouter) — are configured in the TF dashboard and exposed
through one OpenAI-compatible endpoint. The agent code calls
`gateway.complete(messages)` and TF handles provider selection, failover,
billing, and execution tracing.

The user-facing surface is a **corporate NOC war room** — designed to read
from a TV across an SRE bay. A full-canvas LoginScreen with an ASCII wave
cold-opens the demo; LOGIN blurs the overlay out into the war room already
painted underneath. The 56-pixel cockpit carries the brand mark, session
timer, **three TF-routed provider chips** (`TF·GROQ`, `TF·GEMINI`,
`TF·OPENROUTER`) with EWMA latency readouts, three MCP-tool chips, a token
budget bar, a 5-level **DEFCON capsule** tied to live chaos state, and the
EVAL button.

Below it: an **AlertInbox** column on the left driven by a WebSocket; an
**IncidentDetail** stream in the middle that paints trace events in real time
and slides in a collapsible **VerdictCard** with a `CONSENSUS / DIVERGENT`
ensemble badge plus confidence / cost / tokens / root-cause readouts; and a
**3D Topology** on the right (React Three Fiber) where particles flow from
the agent into a central **TF Gateway** node and out to the three TF-routed
providers. When a provider gets killed, its edge goes red and its particles
freeze; when the fallback chain redirects to the next TF-routed model, its
edge ignites in violet.

The **chaos drawer** is the resilience harness. `Kill TF·Groq` → the next
gateway call raises `ProviderError`, the routing policy falls through to
`tf-verify` (Gemini), trace shows `chaos_inject → provider_fallback →
provider_call [tf-verify]` painting in real time, topology redraws. `Kill
TF·Gemini` next → falls through to `tf-tertiary` (OpenRouter). `Kill the TF
Gateway itself` → falls through to **Ollama-direct**, the last-ditch outside
the gateway. Quarantine `kubectl` → tool registry quarantines it, agent walks
the alternate path through Prometheus, trace shows `tool_quarantine →
tool_substitute → tool_call [prometheus]`. Same verdict, slower path, full
audit trail.

A **chaos eval harness** runs 120 investigations across three scenarios
(CrashLoopBackOff, OOMKilled, CoreDNS misconfiguration) and four chaos modes
(off, provider kill, tool kill, combined). A baseline gateway with no fallback
drops to **0% success the moment any chaos fires**. The full Triagent setup
on top of TF stays at **100% across every chaos mode**. The bar chart is the
credibility anchor for the whole submission.

## How we built it

| Layer | Pick | Why |
|---|---|---|
| **Routing layer** | **TrueFoundry AI Gateway** | Every LLM call routes through `gateway.truefoundry.ai`. TF handles provider auth, virtual model abstraction, OpenAI-compatible response shape, and execution tracing. Free Developer tier. |
| **TF-routed models** | `tf-primary` (Groq Llama-3.3-70B), `tf-verify` (Google Gemma-4-31B), `tf-tertiary` (OpenRouter Arcee Trinity Large) | Three distinct provider families behind one gateway; all on the free tier of their upstream providers. Cross-provider ensemble verify gets real diversity, not branded variants of one model. |
| **Last-ditch fallback** | Ollama-direct (`qwen2.5:latest`) | Lives outside TF. Only ever called if the TF gateway itself is unreachable — proves the agent survives even a full TF outage. |
| Orchestration | **LangGraph 1.0** | Built-in checkpointer, trace recording, easy to extend with new tool nodes. |
| Agent layer (above TF) | Custom `Gateway` wrapper around the OpenAI SDK | Adds the three differentiators TF doesn't ship: ensemble verify, cost-aware routing decisions, counterfactual replay. |
| Tools | `app/tools/kubectl.py`, `prometheus.py`, `loki.py` — each behind a `KubectlProtocol`, with both subprocess-backed and HTTP-Remote implementations | Tool poisoning → agent does not crash, it substitutes via the MCP-style registry. |
| Frontend | **Vite + React 19 + TypeScript + Tailwind v4 + Zustand + React Three Fiber** — corporate NOC war room with ASCII-wave LoginScreen + 56px cockpit + ensemble-aware VerdictCard + ReplayScrubber + EvalModal, all on a single WebSocket | TV-readable, screenshot-worthy. R3F for topology with the TF Gateway as the center node. |
| Scenario engine | Separate FastAPI on :8002 with canned cluster telemetry | Mirrors a real observability layer; lets one fake backend serve both demo and eval. |
| Process orchestration | honcho via `Procfile` | One `make dev` boots api + engine + war room dev server. |
| Demo cluster | k3d (`k3d-dc` context) | Real K8s. Agent applies our three scenario manifests, then investigates. |
| Lang | Python 3.12+, Node 18+ | FastAPI + LangGraph + httpx + pydantic v2 / React 19 + Three.js |

The agent uses the production code path for both real-LLM and chaos demos.
There is no demo-only branch shadowing the real graph. If a `chaos_inject`
event lands in the trace during the video recording, it lands the same way
in production with TrueFoundry's actual AI Gateway in front of it.

## The six resilience features

1. **Brownout-aware fallback chain** — `Gateway.complete` walks the
   routing_policy in order: `tf-primary → tf-verify → tf-tertiary →
   ollama-direct → mock`. On `ProviderError` it records a `provider_fallback`
   trace event with the from/to providers and the chaos cause. Kill Groq via
   TF dashboard → next call lands on Gemini. Kill the TF gateway entirely →
   next call lands on Ollama-direct.

2. **MCP tool quarantine** — `app/tools/__init__.py` keeps a registry plus a
   `_local_quarantine` set, augmented by `ChaosController.killed_tools`. The
   agent's `investigate_node` consults `is_quarantined("kubectl")` before
   every call; on hit it routes through `_investigate_via_prometheus` and
   records `tool_substitute` in the trace.

3. **Latency-aware routing** — per-provider EWMA (alpha=0.3); when a
   provider's smoothed latency exceeds `latency_brownout_ms=8000`, it is
   reordered to the tail of the candidate list for the next call. The Chaos
   Panel's `Inject 12s latency` button is the live demo of this — TF-routed
   Groq starts brownout-ing and the gateway preempts it onto Gemini.

4. **AI observability with execution tracing + session replay** — every
   state transition appends a `TraceEvent` with kind, provider, model,
   latency, timestamp, and a free-text detail. The war room's IncidentDetail
   column streams these over a WebSocket as the agent runs; each event is
   colour-keyed by kind (violet for `provider_fallback` and `tool_substitute`,
   red for `chaos_inject` and `budget_exceeded`, blue for `provider_call`).
   The replay scrubber lets a viewer drag back through any prior step. This
   is execution tracing for an agent, in TrueFoundry's vocabulary.

5. **Token budget breaker with cost attribution** — the gateway accumulates
   tokens across an investigation and raises `BudgetExceeded` if
   `TOKEN_BUDGET_PER_INVESTIGATION` is exceeded. Cost is computed per
   TF-routed model: Groq rates apply to `tf-primary` (~$0.59/$0.79 per M
   tokens, free upstream), Gemini and OpenRouter rates are $0 on free tier.
   The cockpit's four-metric row surfaces tokens / budget / cost-by-provider
   live. A typical real-LLM investigation runs ~$0.0004.

6. **Eval harness with chaos injection** — `eval/harness.py` runs a
   (3 scenarios × 4 chaos modes × 2 systems × 5 replicas) matrix in mock
   mode in ~5 seconds. `eval/plot.py` emits the bar chart. Eval modal in the
   UI auto-loads it.

## Eval results

![Chaos resilience bar chart](../eval/results/chaos_eval.png)

| System | No chaos | Provider kill | Tool kill | Combined |
|---|---|---|---|---|
| Baseline (single TF-routed model, no fallback) | 100% | 0% | 0% | 0% |
| **Triagent (full resilience layer on TF)** | **100%** | **100%** | **100%** | **100%** |

The baseline collapses the moment any chaos fires because there is nothing
behind the failing provider or tool. Triagent absorbs each failure mode
independently, and absorbs all three at once. Even when both kubectl and
the primary TF-routed model are dead, the substituted Prometheus path feeds
enough signal into the hypothesize step — using a different TF-routed model —
to return a verdict.

## On top of TrueFoundry's gateway

TF AI Gateway routes; it fails over; it bills; it catalogs MCP tools. The
product stops at the gateway boundary because TF sells infrastructure, not
agents. We built the **agent layer that lives above it** — three primitives
that the gateway by itself can't provide.

1. **Cross-provider ensemble verify.** `verify_node` calls TF gateway with
   `avoid_family={hypothesize_provider_family}`, which guarantees the verify
   call lands on a *different* TF-routed model family than the hypothesize
   step did (Groq hypothesizes, Gemini verifies, OpenRouter stands by).
   Trace records both confidences plus a `CONSENSUS / DIVERGENT` badge.
   Combined confidence is `max(both)` on consensus, `min(both)` on mixed
   consensus, `max - 0.20` on split. Resilience in the agent's reasoning,
   not just below it. Eight new tests cover the path.

2. **Cost-aware fallback policy.** Gateway tracks `_remaining_budget_usd`;
   `_cost_aware_reorder` skips providers whose estimated next-call cost
   would breach the remaining budget (emitting `provider_skip [P]
   reason=budget_pressure` trace events). Under budget pressure, free
   TF-routed models (Gemini, OpenRouter) jump ahead of paid TF-routed Groq.
   Under healthy budget, the routing policy order is preserved so the
   fastest model wins. TF bills cost; we route on it.

3. **Counterfactual replay.** `InvestigationManager.replay(original_id,
   chaos_override)` spawns a new investigation paired to the original via
   `counterfactual_of`. War room UI lets a viewer drag back to step N,
   inject a chaos override the original didn't have, and watch the
   alternate recovery stream in alongside the first one. TF has trace
   replay; nobody has counterfactual replay for agents.

These three sit cleanly on top of TF's gateway primitives. The agent layer
becomes opinionated about *which* TF-routed model to call and *when to skip
one*; TF handles everything below that.

## Why IT Operations

TrueFoundry's IT-Operations solution page sells GenAI governance to
enterprise IT leaders — ITSM workflows, RBAC, audit trails, MCP-governed
tool access. The demo scenario is K8s incident response, but every primitive
ships translates cleanly: brownout-aware fallback becomes SLA-grade
availability; MCP tool quarantine becomes approved-tool-only enforcement;
cost-aware routing becomes per-team budget controls in production. Triagent
is what a TF customer's SRE team would build on top of the AI Gateway to get
from "API integration done" to "production-ready incident agent."

## Challenges we ran into

- **TF virtual model FQN discovery.** TF generates virtual model IDs in the
  shape `{provider-slug}/{model-name}` (e.g. `groq/llama-3.3-70b-versatile`,
  `google-gemini/gemma-4-31b-it`, `openrouter/arcee-ai-trinity-large-thinking-free`).
  We hit the `/api/inference/openai/v1/models` endpoint to enumerate them
  and pin the three slots in `.env`.
- **Cost-aware bug shipped in Phase C.** Initial `_cost_aware_reorder`
  sorted by cost ascending *always*, which masked the demo's
  primary→verify→tertiary order — free Gemini kept beating fast Groq under
  healthy budget. Fixed to pressure-gate: only reorder when remaining
  budget < 50%.
- **Mock provider keyword priority.** `CrashLoopBackOff` appears in every
  failing pod's summary, including OOM scenarios. Reordered the keyword
  match so OOMKilled and nslookup checks win before the generic crashloop
  fallback.
- **Real-LLM confidence parsing.** Cross-provider LLMs emit "verified" or
  "[High Confidence]" more often than `confidence 0.X`. Parser was
  defaulting to 0.5 on those, dragging the demo card down. Added
  qualitative phrase detection mapping each phrase to a numeric value.
- **TF JWT in `.env` had a leading space.** Copy-paste artifact. Fixed
  before first smoke. `.env` is gitignored.

## What we learned

- **The right abstraction for agent resilience is the gateway, not the
  agent.** TF gateway absorbs every kind of LLM failure behind a single
  `complete()` call. The agent does not have to know which provider
  answered.
- **MCP tool quarantine is not optional infrastructure.** Treat every tool
  call as a potentially failing dependency, expose a quarantine knob, and
  let the agent re-route via an alternate tool.
- **TrueFoundry's vocabulary aligns to the product story.** Their term-of-art
  ("browns out", "AI observability + execution tracing", "session replay",
  "cost attribution", "tool poisoning", "circuit breaker", "virtual
  models") maps cleanly onto the six features. Used verbatim.
- **Free upstream tiers + TF Developer tier = $0 production-shape demo.**
  Groq free tier + OpenRouter free models + Gemini free tier + TF Developer
  tier ($0/mo, 50k req/mo). Three real cross-provider families, ensemble
  verify, chaos drills — all on the free tier of every component.

## What's next for Triagent

- **TF MCP Registry integration.** TF ships an MCP control plane; the
  hackathon budget didn't cover a deep mount. Drop-in for the existing tool
  registry.
- **Tool poisoning chaos mode.** Plumbing is in `ChaosController`
  (`poison_json` flag); the harness does not exercise it yet.
- **Integration into our larger observability stack (Orca).** The resilience
  layer is portable — we lift `app/gateway.py` and `app/tools/` into Orca's
  incident detection module after the hackathon.

## Built with

`python` `langgraph` `langchain` `fastapi` `uvicorn` `pydantic` `httpx`
`openai` `truefoundry-ai-gateway` `groq` `ollama` `react` `vite` `tailwind`
`zustand` `three.js` `r3f` `kubernetes` `k3d` `kubectl` `prometheus` `loki`
`matplotlib`

## Try it

```bash
git clone https://github.com/syaugi/triagent
cd triagent
make install
cp .env.example .env
# Add TRUEFOUNDRY_API_KEY (free Developer tier @ signup.truefoundry.com)
# Plug Groq + OpenRouter + Gemini into your TF dashboard as providers
# Set TRUEFOUNDRY_PRIMARY_MODEL / VERIFY_MODEL / TERTIARY_MODEL to your TF FQNs
# Leave USE_MOCK_LLM=false for real TF routing
make cluster          # ensure k3d-dc is up
make dev              # honcho boots api + scenario_engine + war room
```

Open http://localhost:3000, click an incident in the AlertInbox, watch the
trace paint through `tf-primary` then ensemble-verify on `tf-verify`. Then
press `Inject Chaos` and kill whichever TF-routed model you want.
