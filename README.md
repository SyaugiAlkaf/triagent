# Triagent

> **Built on TrueFoundry AI Gateway.** A resilient Kubernetes incident agent that **stays observable, controllable, and recoverable** while its own tools and providers fail under chaos.

Built for the **TrueFoundry Resilient Agents** track at DevNetwork [AI+ML] 2026.

Your prod cluster breaks. Your AI incident agent investigates through TrueFoundry's AI Gateway. Then individual models behind the gateway start brown-outing, MCP tools start failing, and the gateway itself comes under chaos. Most agents stall. Triagent reroutes through the brown-out — across three TF-routed model families — quarantines the broken tool, and keeps walking. Every fallback decision is traced, replayable, and budget-attributed.

---

## The 30-second pitch

| Without resilience | With Triagent |
|---|---|
| **0%** successful investigations under chaos | **100%** under the same chaos matrix |
| Single-provider failure stalls the agent | Brown-out-aware fallback chain reroutes in <1s |
| One bad MCP tool breaks the run | Tool quarantine substitutes an alternate observability path |
| No idea where the dollar went | Per-provider cost attribution surfaced in the verdict card |

![Chaos resilience: baseline 0% / Triagent 100% across 120 runs](eval/results/chaos_eval.png)

*120-run eval matrix, 3 chaos modes × 3 scenarios × baseline-vs-Triagent. Mock mode, runs in ~5s.*

---

## Why this exists (and why TrueFoundry should care)

TrueFoundry launched **TrueFailover** in January 2026 — auto-reroute around model outages, brown-outs, MCP failures. Triagent is a hackathon-sized demo of exactly that product class, built end-to-end on TrueFoundry's resilience vocabulary:

| TrueFoundry product surface | How Triagent demonstrates it |
|---|---|
| **AI Gateway / TrueFailover** | **Every LLM call routes through `gateway.truefoundry.ai`** with three TF-routed virtual models (`tf-primary` Groq, `tf-verify` Gemini, `tf-tertiary` OpenRouter) — plus Ollama-direct as last-ditch outside the gateway. Per-provider EWMA latency reorder. Real `TrueFoundryProvider` ships in `app/gateway.py`. |
| **MCP Gateway** | Tool registry with MCP-style quarantine + alternate-path substitution (kubectl down → Prometheus) |
| **Agent Gateway — session replay** | Every state transition appended to a trace; war room scrubs the timeline live over WebSocket; counterfactual replay re-runs from any step with an injected chaos override |
| **Per-team budget controls & cost attribution** | `TOKEN_BUDGET_PER_INVESTIGATION` hard breaker; cost-by-provider surfaced per investigation; **cost-aware routing** skips expensive TF-routed models under budget pressure |
| **AI observability with execution tracing** | Trace events carry intent, not just calls — `provider_brownout`, `tool_quarantined`, `budget_breaker_tripped`, `ensemble_verify`, `provider_skip`, `counterfactual_of` |

Every line of code in this repo is in service of one 3-minute demo that a TrueFoundry DevRel team could ship as a Twitter thread tomorrow.

### Beyond TF's gateway — three primitives TF doesn't ship

TrueFoundry stops at the gateway boundary because TF sells infra, not agents. We built the next layer above:

- **Cross-provider ensemble verify** — `verify_node` forces a different provider family than `hypothesize_node` used; CONSENSUS / SPLIT badge on the verdict. Resilience in the agent's reasoning, not just below it.
- **Cost-aware fallback** — `Gateway._cost_aware_reorder` skips providers whose est cost would breach remaining budget (emitting `provider_skip` trace events) and promotes free providers under pressure.
- **Counterfactual replay** — `POST /investigations/{id}/replay` with `chaos_override` spawns a paired investigation that re-runs the scenario with a different chaos state. Drag-back-in-time + inject-chaos-after-the-fact.

---

## The six resilience features

1. **Brown-out-aware fallback chain** — `tf-primary` (Groq) → `tf-verify` (Gemini) → `tf-tertiary` (OpenRouter) → Ollama-direct → Mock. Falls through on `ProviderError` *and* deprioritises slow providers via per-provider EWMA latency. Ollama lives outside the TF gateway so the agent survives even a full TF outage.
2. **MCP tool quarantine** — `kubectl` killed mid-run? The tool registry substitutes Prometheus, the agent walks the alternate observability path. No retries against a dead tool.
3. **Latency-aware routing** — `alpha=0.3` EWMA per provider; smoothed latency above 8s sinks the provider to the tail of the candidate list before it ever times out.
4. **Semantic observability + replay** — every state transition appended to the trace with structured intent; the war room paints it in real time and lets the judge scrub backward through any investigation.
5. **Token budget breaker + cost attribution** — `TOKEN_BUDGET_PER_INVESTIGATION` hard cap; public Groq rates applied per call; cost-by-provider surfaced in the verdict card.
6. **Eval harness with chaos injection** — 120-run matrix (3 scenarios × 4 chaos modes × baseline-vs-Triagent × N samples). Baseline collapses to 0% under any chaos mode. Triagent holds 100%.

---

## The demo (what the judge sees)

A war room dashboard. An alert lands in the inbox. The investigation streams in: kubectl describes, Prometheus queries, hypothesis tightens, verdict emits. Then the **Chaos Panel** slides open.

| Button | What breaks | What the trace shows |
|---|---|---|
| `Kill TF·Groq` | Primary TF-routed model down | `provider_brownout` → reroute to `tf-verify` (Gemini) → investigation continues |
| `Kill TF·Gemini` | Secondary TF-routed model down | Falls through to `tf-tertiary` (OpenRouter) — three-deep TF chain |
| `Kill TF Gateway` | Entire TF gateway unreachable | Falls through to Ollama-direct outside TF — full-outage survival |
| `Kill kubectl` | Primary observability tool down | `tool_quarantined` → substitute Prometheus → alternate path holds |
| `Inject latency` | All `tf-primary` calls +5s | EWMA crosses threshold → tf-primary sinks to tail → tf-verify promoted |
| `Poison tool output` | kubectl returns garbage JSON | Validation fail → quarantine → alternate path |
| `Clear chaos` | Restore everything | Providers and tools re-enter rotation on next call |

Every button pairs with a real trace event. The 3D topology view paints particles along the new edges. The verdict card shows cost split per provider.

Then the eval bar chart: **0% vs 100%**, 120 runs. End of pitch.

---

## Quickstart

```bash
git clone https://github.com/SyaugiAlkaf/triagent
cd triagent

make install                 # pip + npm install
cp .env.example .env
# Real-LLM mode (recommended):
#   1. Sign up at https://signup.truefoundry.com  (free Developer tier)
#   2. In the TF dashboard, plug three free providers:
#      - Groq (free tier, console.groq.com)
#      - OpenRouter (free models, openrouter.ai)
#      - Google Gemini (free tier, aistudio.google.com)
#   3. Add models under each provider — Groq llama-3.3-70b, OpenRouter
#      arcee-trinity-free, Gemini gemma-4-31b-it
#   4. Generate a Personal Access Token (PAT) and paste into .env:
#        TRUEFOUNDRY_API_KEY=tfy-...
#        TRUEFOUNDRY_GATEWAY_URL=https://gateway.truefoundry.ai
#        TRUEFOUNDRY_PRIMARY_MODEL=groq/llama-3.3-70b-versatile
#        TRUEFOUNDRY_VERIFY_MODEL=google-gemini/gemma-4-31b-it
#        TRUEFOUNDRY_TERTIARY_MODEL=openrouter/arcee-ai-trinity-large-thinking-free
#   5. Set USE_MOCK_LLM=false
#
# Offline mode: leave USE_MOCK_LLM=true and skip the TF setup entirely.

make dev                     # api :8000, engine :8002, war room :3000

open http://localhost:3000   # war room
open http://localhost:8002   # scenario engine control panel
```

Click **Trigger crashloop** on the scenario engine → an alert lands in the war room within 2 seconds → click **Investigate** → trace streams into the IncidentDetail column. Open the **Chaos Panel**, press **Kill groq** — the next investigation shows the red edge to Groq and traffic redirecting to Ollama in the topology.

### Production-ish (war room served from FastAPI)

```bash
make warroom-build           # vite build into warroom-dist/
make demo                    # api + engine; war room at :8000/warroom/
```

### Eval harness

```bash
make engine                                              # separate shell
SCENARIO_ENGINE_URL=http://localhost:8002 .venv/bin/python -m eval.harness
.venv/bin/python -m eval.plot                            # writes eval/results/chaos_eval.png
```

---

## Architecture

```
+----------------------------------------------------+
| Vite war room :3000 (dev) / FastAPI /warroom (prod)|
|   React 19 + TS + Tailwind v4 + R3F topology       |
|   Hero (provider/tool health pills)                |
|   AlertInbox (driven by /ws alerts)                |
|   IncidentDetail (live trace + verdict + cost)     |
|   Topology (3D scene; particles along live edges)  |
|   ChaosDrawer (POSTs /chaos/*)                     |
|   State: Zustand store, single reconnecting /ws    |
+----------------------------------------------------+
       ^ WebSocket /ws push     ^ HTTP /api/*
       |                        |
+----------------------------------------------------+
| FastAPI :8000 (war room backend)                   |
|   /investigations, /chaos/*, /ws, /warroom         |
|                                                    |
|   LangGraph agent: plan -> investigate ->          |
|     hypothesize -> verify                          |
|                                                    |
|   Resilient gateway wrapper:                       |
|     [tf-primary, tf-verify, tf-tertiary]           |
|       -> all route through gateway.truefoundry.ai  |
|     -> ollama-direct (outside TF, last-ditch)      |
|     -> mock (final safety)                         |
|     + EWMA latency reorder                         |
|     + token budget breaker                         |
|     + per-provider cost attribution                |
|     + ensemble verify (avoid_family)               |
|     + cost-aware reorder under budget pressure     |
|                                                    |
|   Tool registry (MCP-shaped):                      |
|     KubectlProtocol + Remote{Kubectl,Prom,Loki}    |
|     quarantine() / restore() per tool              |
+----------------------------------------------------+
       v HTTP/SDK (OpenAI-compatible)
+----------------------------------------------------+
| TrueFoundry AI Gateway (cloud)                     |
|   gateway.truefoundry.ai                           |
|   Virtual models -> upstream provider keys (BYOK): |
|     groq/llama-3.3-70b-versatile                   |
|     google-gemini/gemma-4-31b-it                   |
|     openrouter/arcee-ai-trinity-large-thinking-free|
+----------------------------------------------------+

+----------------------------------------------------+
| FastAPI :8002 (scenario engine)                    |
|   Control plane: trigger/clear/reset scenarios     |
|   Telemetry: canned kubectl / Prom / Loki fixtures |
|   Mirrors real tool response shapes                |
+----------------------------------------------------+
```

Mermaid diagram and single-investigation lifecycle in `docs/architecture.md`.

---

## Demo scenarios

| Slug | What breaks | Where the agent looks | Chaos-amplified path |
|---|---|---|---|
| `01-crashloop` | container exit 1 from missing `DATABASE_URL` env var | kubectl get/describe/logs | n/a |
| `02-oom` | python allocates 200MB into a 64Mi limit | kubectl + container state | n/a |
| `03-dns` | busybox `nslookup` against `nonexistent-host.invalid` | kubectl + (via chaos) Prometheus | **kubectl killed mid-run → quarantine → Prometheus alternate path** |

---

## Stack

| Layer | Pick |
|---|---|
| Orchestration | LangGraph 1.0 (built-in checkpointer = free state persistence) |
| Routing layer | **TrueFoundry AI Gateway** at `gateway.truefoundry.ai` (Developer tier, free) |
| TF-routed models | `tf-primary` Groq Llama-3.3-70B · `tf-verify` Google Gemma-4-31B · `tf-tertiary` OpenRouter Arcee Trinity (all free upstream tiers) |
| Last-ditch fallback | Ollama-direct (`qwen2.5:latest`) outside the TF gateway |
| Agent layer (above TF) | Custom `Gateway` wrapper adding ensemble verify, cost-aware reorder, counterfactual replay |
| Tools | kubectl, Prometheus, Loki — wrapped behind a Protocol, both real and HTTP-remote implementations |
| War room | Vite + React 19 + TypeScript + Tailwind v4 + Zustand + R3F (three.js) |
| Scenario engine | FastAPI on :8002 with canned telemetry |
| Process orchestration | honcho via Procfile |
| Demo cluster | k3d (`k3d-dc`) |
| Lang | Python 3.12+, Node 18+ |

---

## Repo layout (concise)

```
app/            agent, gateway, chaos, runner, ws + tools/{kubectl,prometheus,loki}
warroom/        Vite + React + R3F war room UI
scenario_engine/  FastAPI :8002, telemetry + control panel
eval/           harness (120-run matrix) + matplotlib bar-chart plot
scenarios/      01-crashloop / 02-oom / 03-dns fixtures
docs/           architecture.md, demo-script.md, devpost.md
tests/          pytest suite, 24 passing
```

The legacy Streamlit dashboard is parked at `app/legacy_ui.py` for the k3d-direct path — useful as proof the agent works against a real cluster, not in the demo flow.

---

## What we deliberately did NOT build

- **No multi-agent swarm.** One agent, observable state machine, traceable verdicts. Swarms hide the resilience story.
- **No LLM-as-judge for reliability.** The eval harness uses deterministic outcome checks against scenario fixtures.
- **No "durable execution" claims.** LangGraph checkpointing is state persistence — useful, not magic. The resilience story is in the gateway and tool registry.
- **No chatbot wrapper.** No free-form text input. The agent is invoked by alerts, not by prompts.
- **No 7th feature.** Feature freeze May 22. Six is enough.

---

## License

MIT
