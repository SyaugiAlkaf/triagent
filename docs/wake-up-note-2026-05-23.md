# Wake-up note — 2026-05-23 03:05 Jakarta

Built while you slept. Status: **TF-primary pivot complete, merged to master, ready for your review + the final push to GitHub + Devpost submit.**

## What landed (K0 → K9, 7 phases, ~5h overnight)

| Phase | Outcome |
|---|---|
| K0 | TF signup + 3 free providers configured + .env populated |
| K1 | `app/gateway.py` rewritten — every LLM call now routes through `gateway.truefoundry.ai`. Three TF-routed virtual models (`tf-primary` Groq · `tf-verify` Gemini · `tf-tertiary` OpenRouter) at top of routing policy. Ollama-direct as last-ditch. Cost-aware reorder now pressure-gated (was always-cheapest, masked Groq) |
| K2 | UI relabel — cockpit chips, topology center node, chaos panel kill switches, store defaults all reflect the new 3-TF architecture. Chaos panel scenarios narrowed to our 3 (crashloop/oom/dns). Backend WS broadcasts live providers snapshot |
| K3 | End-to-end smoke — all 3 scenarios run through real TF gateway. Confirmed: `tf-primary` + `tf-verify` both hit on every investigation (ensemble verify), DNS-003 = 1.0 confidence consensus. **Total real-LLM cost: ~$0.0012** for 3 runs. Free-tier safe |
| K7 | Eval harness re-run in mock mode (120 runs, 4.4s): baseline collapses to 0% under any chaos mode, resilient holds 100%. Bar chart regenerated |
| K4 | HyperFrames demo composition substituted (all references → TF·GROQ/GEMINI/OPENROUTER), center node upgraded to "TF GATEWAY · gateway.truefoundry.ai". Re-rendered demo.mp4 (16.7MB, 2:21.9). Re-concat'd with intro+outro → `triagent-full-reel.mp4` (19MB, 2:50, 5100 frames) |
| K5 | `docs/devpost.md` rewritten — first sentence is now "Built on TrueFoundry AI Gateway." Drops the "mimic TF" framing entirely. "Beyond TrueFoundry's gateway" reframed as "On top of TrueFoundry's gateway" |
| K6 | `README.md` polished — TF-primary narrative, 4-step TF setup walkthrough in quickstart, architecture diagram makes TF gateway the load-bearing layer |
| K8 | 7 Devpost gallery screenshots captured via Playwright against the live war room. All in `docs/screenshots/00..06-*.png` |
| K9 | Pre-merge secret scan **clean** (zero hits across all signature patterns). Merged `feat/finish/tf-primary` → `master` with `--no-ff`. **Master now 29 commits ahead of origin — push deferred to you** |

## What is still pending

| Phase | Owner | Notes |
|---|---|---|
| K9 (push step) | **You** | `git push origin master` — per CLAUDE.md, "no remote push until user runs it manually". GitHub repo at `https://github.com/syaugi/triagent` needs to be public before submit |
| K10 | **You** | Devpost submission Wed 2026-05-27 evening Jakarta. Form draft at `docs/devpost-form-draft.md` |

## What to do when you wake up

1. **Watch the new reel** — `video/renders/triagent-full-reel.mp4`. Look for: TF·GROQ/GEMINI/OPENROUTER chips landing correctly, "TF GATEWAY" center node visible in topology, fallback beat showing tf-primary → tf-verify → tf-tertiary three-deep chain, callout text reading right.
2. **Eyeball the screenshots** — `docs/screenshots/00..06-*.png`. Any that look broken or stale, tell me and I'll re-capture.
3. **Push to GitHub** — `git push origin master` (29 commits will fly). Make sure repo is public. Optional: `gh repo create syaugi/triagent --public --source=. --remote=origin` if it doesn't exist yet.
4. **Upload reel to YouTube unlisted** — note the URL.
5. **Read `docs/devpost-form-draft.md`** — paste-ready Devpost form content. Optionally tweak the tagline.

## Servers still running

- FastAPI at http://127.0.0.1:8000 (USE_MOCK_LLM=false, real TF)
- Scenario engine at http://127.0.0.1:8002

Kill both with `lsof -i :8000 -t | xargs kill; lsof -i :8002 -t | xargs kill` when done.

## Tokens spent overnight

- **Real TF gateway: ~$0.001** total (3 smoke investigations + 1 Playwright UI investigation)
- Free-tier headroom remaining: Groq ~14k req/day intact, Gemini 15 RPM intact, OpenRouter rate-limited but plentiful
- Plenty of token budget for the demo recording + ~6 retake passes

## Risks / open questions

- **OpenRouter Arcee Trinity is a "thinking" model** — burns tokens on chain-of-thought before the final answer. If you see it spending more than expected during the demo, swap to a different OpenRouter free model in the TF dashboard (Llama-3.3-70b-instruct:free, Gemma-2-9b-it:free) and update `TRUEFOUNDRY_TERTIARY_MODEL` in `.env`.
- **Real-LLM crashloop/oom confidence is 0.2–0.5** because the LLMs occasionally disagree on phrasing with the canned expected_root_cause text — DNS hits 1.0 consensus reliably. For the demo recording, pick DNS as the first ensemble-CONSENSUS beat.
- **Real LLMs occasionally return "[High Confidence]" instead of numeric confidence** — the parser handles it but defaults conservatively. Acceptable.

## Commit log on master (last 8)

```
1ee5a58 merge: feat/finish/tf-primary -> TF-primary architecture lands
f5abf2d docs: 7 Devpost gallery screenshots from TF-primary war room
ad9befe feat: HyperFrames demo re-rendered for TF-primary architecture
d694c94 chore(testing): re-run chaos eval matrix after TF-primary pivot
ade2ae2 docs: TF-primary narrative in README + devpost
0203227 feat: relabel UI for TF-primary architecture
4c3c5d8 feat: pivot gateway to TF-primary architecture
aae513f merge: feat/finish/demo-reel-hyperframes -> full 2:50 HyperFrames demo lands
```

Sleep well. Tomorrow you push + submit.
