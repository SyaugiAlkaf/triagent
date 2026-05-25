# Demo video script — 3:00 hard cap, target 2:50 (iter3 corporate war room)

Single-take screen recording with voiceover. No music. No transitions. Mouse
moves with intent. Keep the trace scrolling.

## Setup before the camera rolls

- `make dev` running (honcho: api :8000, engine :8002, war room :3000).
- Browser tab A: war room at `http://localhost:3000` — sitting on the
  LoginScreen with the ASCII wave animating.
- Browser tab B: scenario engine control panel at `http://localhost:8002`.
- Chaos drawer closed, all chaos cleared, no scenarios active.
- `.env` configured with `GROQ_API_KEY` set; `TRUEFOUNDRY_API_KEY` set so
  the TFOUNDRY chip appears in the cockpit. `COST_AWARE=true` (default).
- Pre-cached responses in `demo/responses_cache.json` so offline takes are
  deterministic.

## Timeline (7 beats, 2:50 total)

### 0:00 — 0:18 | Cold open over the LoginScreen → fade into war room

> "This is the Triagent war room. SRE log-in is a presentation gate — the
> ASCII wave runs at sixty frames per second, the brand sits dead center,
> and the moment the operator logs in the overlay blurs out and the room
> is already painted underneath."

Action: hold on the LoginScreen for two seconds, then click `LOGIN ·
ENTER WAR ROOM`. Overlay blurs and fades out over 700ms. The corporate
cockpit is visible underneath: TRIAGENT + session timer, four neutral
provider chips (GROQ · OLLAMA · TFOUNDRY · MOCK), three tool chips
(KUBECTL · PROM · LOKI), token bar, **DEFCON 5 NOMINAL**, CHAOS button,
violet EVAL button.

### 0:18 — 0:40 | Crashloop investigation + ensemble verify

> "I trigger a crashloop scenario in the scenario engine."

Action: switch to tab B, click `Trigger crashloop`. Switch back to tab A.

> "An alert lands in the inbox. One-line card: P1 · CrashLoopBackOff ·
> triagent-demo · 2s. I click it."

Action: click the crashloop alert.

> "Triagent dispatches a LangGraph agent through the resilient AI gateway.
> Plan, investigate, hypothesize, verify. Watch the verify step — it runs
> on a different provider family than the hypothesize step. Groq
> hypothesizes, Ollama verifies, they reach the same root cause."

Action: trace events stream into the IncidentDetail column. Verdict card
slides in with the **CONSENSUS** badge next to RESOLVED, showing
`groq→ollama`, confidence 85%.

> "Cross-provider ensemble verify. The agent doesn't just trust its own
> first opinion — it forces a different model family to confirm the root
> cause. TrueFoundry routes one call at a time; this is the layer above."

### 0:40 — 1:15 | Chaos sequence — three-deep fallback

> "Now production happens. Open the chaos console."

Action: click CHAOS in the cockpit. Drawer slides in.

> "Kill Groq."

Action: toggle `kill groq`. The GROQ chip goes red. **DEFCON drops to 2 ·
CRITICAL**.

> "Quarantine kubectl. Inject 12 seconds of latency."

Action: toggle `quarantine kubectl`, drag latency to 12s. The KUBECTL chip
turns yellow. **DEFCON drops to 1 · BREAKDOWN**.

> "Trigger the OOM scenario."

Action: switch to tab B, trigger OOM. Switch back. The alert lands; click
it.

> "Three independent failures injected at once. Watch the trace."

Action: point at the trace as it paints:
- `plan`
- `tool_quarantine kubectl`
- `tool_substitute kubectl → prometheus`
- `tool_call prometheus query`
- `chaos_inject [groq] kill_provider`
- `provider_error [groq]`
- `provider_fallback groq → ollama`
- `provider_call [ollama]` (slow under injected latency)
- `provider_fallback ollama → truefoundry`
- `provider_call [truefoundry]` resolves

> "Three-deep fallback chain. Groq dead, Ollama brownout, TrueFoundry
> picks up the verify step. The agent never stops walking. Same root
> cause — OOMKilled, memory pressure — just the long road."

### 1:15 — 1:45 | Counterfactual replay

Action: clear chaos. Wait for fresh verdict.

> "Every investigation can be replayed. Drag the scrubber back to step
> three. The trace truncates."

Action: drag the ReplayScrubber under the verdict back to step 3.

> "Toggle WHAT IF. Now I can inject chaos that the original investigation
> didn't have. Kill Groq at step three, commit."

Action: toggle WHAT IF, click `Kill Groq`, click commit. A second trace
column streams in alongside the original, marked
`counterfactual_of=...`. The verdicts may agree or split.

> "Counterfactual replay. The cache makes the LLM deterministic; the
> agent code path with new chaos state produces an alternate recovery.
> TrueFoundry has trace replay. Nobody has counterfactual replay for
> agents."

### 1:45 — 2:10 | Cost-aware fallback skip

> "Set the token budget low — twelve hundred tokens — and trigger a fresh
> investigation."

Action: set `COST_BUDGET_USD_PER_INVESTIGATION=0.05` env via the dev
helper, trigger crashloop again.

> "The trace shows a `provider_skip` event with a dollar-sign glyph.
> Triagent saw that calling Groq again would breach the remaining budget,
> so it reordered the free Ollama provider ahead. The tooltip shows the
> reason — `budget_pressure`. **DEFCON 4 · CAUTION** because the gateway
> is deliberately routing around a paid provider."

Action: hover the provider_skip row to show the tooltip.

> "TrueFoundry bills cost. We route on it."

### 2:10 — 2:35 | EVAL modal — the credibility anchor

> "Does any of this actually work? Click EVAL."

Action: click the violet EVAL button in the cockpit. The modal opens with
the bar chart at top and a results table at the bottom.

> "One hundred twenty investigations. Three scenarios — crashloop, OOM,
> CoreDNS. Four chaos modes — off, provider kill, tool kill, combined.
> The baseline is a single-provider gateway with no fallback. It drops
> to zero percent the moment any chaos fires. Triagent stays at one
> hundred percent across every chaos mode."

Action: mouse over each red 0% baseline cell, then each green 100%
Triagent cell.

### 2:35 — 2:50 | Close

> "Six locked features. Three primitives TrueFoundry doesn't ship —
> cross-provider ensemble verify, cost-aware fallback, counterfactual
> replay. Real TrueFoundry AI Gateway as the third hop in the live chain.
> Triagent."

Hold on the EVAL modal for one second. Cut.

## Editing rules

- Hard cut at 2:50 even if the take feels short. Better short than over.
- Strip any silence longer than 1.0s.
- No b-roll. No animated transitions. The ASCII wave login → fade-out and
  the trace painting are the visual interest; do not overlay anything.
- Subtitles on (auto-generate, hand-fix the model names).
- Export 1080p, H.264, 30fps. Devpost prefers YouTube embed.

## What to capture as still screenshots for Devpost

In this order:

1. LoginScreen with ASCII wave (cold-open frame).
2. War room dashboard, fresh state, DEFCON 5.
3. Mid-investigation with trace painting, ensemble CONSENSUS badge in
   verdict.
4. Chaos console open with three injections active, DEFCON 1.
5. Trace with `provider_skip [groq] reason=budget_pressure` row visible.
6. Counterfactual replay with two trace columns side-by-side.
7. EVAL modal full-frame.

One animated GIF (15s) of the chaos sequence from the 0:40 — 1:15 segment.

## Fallback cuts if the take overruns 2:50

In order of what to drop first:

1. Cost-aware fallback beat (1:45 — 2:10). Re-time: ensemble verify
   stretches to 0:18 — 0:45, chaos to 0:45 — 1:25, counterfactual to
   1:25 — 1:55, EVAL 1:55 — 2:35, close 2:35 — 2:50.
2. Counterfactual replay beat. Falls back to a static replay scrubber
   demo (drag back, no WHAT IF).
3. The LoginScreen cold open. Cut directly to the war room with a
   pre-set CSS to skip the auth gate (set `localStorage.triagent_skip_auth
   = '1'` before recording, gate the LoginScreen on its absence — not
   implemented yet, only if time allows).
