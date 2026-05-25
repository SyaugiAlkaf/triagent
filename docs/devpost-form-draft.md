# Devpost submission form — draft

> Ready to paste into https://devpost.com when submission window opens.
> Track: **TrueFoundry Resilient Agents** at DevNetwork [AI+ML] 2026.
> Single judge: Sai Krishna, Head of DevRel @ TrueFoundry.

---

## Title (max 60 chars)

```
Triagent — K8s incident agent on TrueFoundry AI Gateway
```

(55 chars)

## Tagline (max 120 chars — the line judges skim)

```
Resilient K8s incident agent built on TrueFoundry AI Gateway. Ensemble-verify, cost-aware, counterfactual-replay.
```

(112 chars)

## Elevator pitch (3 sentences, ~280 chars)

> Production agents die when their LLM provider browns out. Triagent is a K8s
> incident-response agent built on TrueFoundry AI Gateway that survives any
> provider, model, or MCP-tool failure mid-investigation — visibly, with full
> trace replay.

## Built with (tag pills)

```
python, langgraph, langchain, fastapi, uvicorn, pydantic, httpx, openai,
truefoundry-ai-gateway, groq, google-gemini, openrouter, ollama, react,
vite, tailwind, zustand, three.js, r3f, kubernetes, k3d, kubectl,
prometheus, loki, matplotlib
```

## Long description

Paste the full body of `docs/devpost.md` into the long-description field.

## Try it out / links

| Field | Value |
|---|---|
| Code repository | `https://github.com/syaugi/triagent` (push gated on K9) |
| Live demo URL | (skip — local-only demo; Devpost converts fine without) |
| Devpost video URL | YouTube unlisted upload of `video/renders/triagent-full-reel.mp4` |
| Tweet thread | (post after submit if Sai retweets the demo) |

## Sai-retweet-bait sentence

> Triagent: K8s incident agent on @TrueFoundryAI Gateway. Kill any provider
> mid-investigation, ensemble verify across the survivors, $-aware fallback,
> counterfactual replay. 0% → 100% recovery under chaos.

## Gallery images (Devpost takes up to 6)

| # | Filename (under docs/screenshots/) | Caption |
|---|---|---|
| 1 | `01-cockpit-overview.png` | Corporate NOC cockpit with three TF-routed provider chips (TF·GROQ / TF·GEMINI / TF·OPENROUTER), live token budget, DEFCON capsule |
| 2 | `02-ensemble-verdict-consensus.png` | VerdictCard with CONSENSUS badge — Groq hypothesizes, Gemini verifies, both at 0.85 confidence |
| 3 | `03-chaos-panel-tf-kill.png` | Chaos panel with TF-routed provider kill switches armed mid-investigation |
| 4 | `04-trace-three-deep-fallback.png` | Trace stream showing `tf-primary → tf-verify → tf-tertiary` fallback chain after chaos injection |
| 5 | `05-topology-tf-center.png` | 3D topology with TF Gateway as the load-bearing center node, three TF-routed providers as spokes |
| 6 | `06-eval-modal.png` | Eval modal: baseline 0% vs Triagent 100% across all 4 chaos modes |

These get captured in K8.

## Video upload

`video/renders/triagent-full-reel.mp4` after K4 re-render lands. 2:50 hard
cut. Upload as YouTube unlisted, paste URL into Devpost video field. Devpost
also accepts direct upload up to 100 MB — the reel is ~18-20 MB, fits.

## Submission timing

| Day | Action |
|---|---|
| Mon 2026-05-26 | K8 polish + screenshots, K9 push + Devpost form prefill |
| Tue 2026-05-27 evening Jakarta | Final review, hit submit (buffer day) |
| Wed 2026-05-28 evening Jakarta | Watch for any judge questions; respond same day |
| Thu 2026-05-29 00:00 WIB | Hard deadline (= Wed 10am PDT) |

## Pre-submit checklist

- [ ] Demo video uploaded to YouTube unlisted + URL pasted
- [ ] GitHub repo pushed + made public + README is the new version
- [ ] All 6 gallery images uploaded with captions
- [ ] Long description = current `docs/devpost.md` content
- [ ] Tagline matches the one above
- [ ] Track selection: **TrueFoundry — Resilient Agents**
- [ ] Built-with tags include `truefoundry-ai-gateway`
- [ ] Eval bar chart visible in long description (raw file path or hosted URL)
- [ ] `.env` confirmed gitignored, no keys in tracked files
- [ ] One last `git log` check for any debug commits sneaking in
