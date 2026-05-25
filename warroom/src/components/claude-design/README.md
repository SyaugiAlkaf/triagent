# Triagent · claude-design

Drop-in React 19 + TypeScript components for the Triagent war room. Each
component reads narrowly from your existing `useStore` and wires to the api
helpers in `@/lib/api`. No new store fields required.

## Files

| File | Track | What it is |
|---|---|---|
| `design-system.tsx` | shared | Tokens (`PROVIDER_META`, `NS_PALETTE`, `TRACE_KIND_META`), `LiveClock`, `MicroLabel`, `DesignSystemStyles` (keyframes + glass classes). Mount `<DesignSystemStyles/>` once at the war-room root. |
| `HeroCockpit.tsx` | A | Top cockpit bar: wordmark · 3 provider chips with EWMA sparklines · 3 tool pills · live latency badge · token-budget bar · last-verdict capsule · WS dot · INJECT/CLEAR CHAOS button. EWMA series derived from recent `provider_call` events in `traceEvents` — no new store fields. |
| `AlertInbox.tsx` | A | 320px-wide glass column. Tightened card with severity rail, namespace color chip, age, INVESTIGATE CTA wired to `startInvestigation(slug)`. |
| `TraceFeed.tsx` | A | Live trace stream. Recovery rows (`provider_fallback`, `tool_substitute`, `provider_restore`) get a left-tinted rail + branch arc glyph + gradient background so they read as a story arc. Verdict mounts as children below the scroller. |
| `VerdictCard.tsx` | B | The centerpiece. Confidence arc, root-cause headline, latency/tokens/cost triad with sparkline + budget bar + per-provider breakdown, remediation callout with APPLY PATCH / COPY MANIFEST / RUNBOOK. |
| `TopologyHUD.tsx` | D | Pointer-passthrough overlay for the R3F canvas. Top status capsule (live/degraded/killed) + per-node labels + per-edge flow badges (LIVE/WARM/LOW/IDLE/KILLED) + hover tooltip + legend + WS clock. Takes `nodes` + `edges` props so it can address R3F nodes by id without depending on the 3D scene. |
| `ChaosConsole.tsx` | C | Right-side drawer redesigned as a chaos console. Scenarios as trigger tiles · providers as LED-lit kill switches · tools as quarantine slots · latency slider with marked thresholds (0 / 5s / 8s brownout / 12s) · POISON JSON arm switch. Hazard-stripe header + active-injection counter. |

## How to wire it up

The topology now lives as a **wide bottom strip**, not a narrow right column.
Body row (alerts + trace) sits above; topology fills the full width below.

```tsx
// warroom/src/App.tsx
import { DesignSystemStyles } from "@/components/claude-design/design-system";
import { HeroCockpit }   from "@/components/claude-design/HeroCockpit";
import { AlertInbox }    from "@/components/claude-design/AlertInbox";
import { TraceFeed }     from "@/components/claude-design/TraceFeed";
import { VerdictCard }   from "@/components/claude-design/VerdictCard";
import { TopologyHUD }   from "@/components/claude-design/TopologyHUD";
import { ChaosConsole }  from "@/components/claude-design/ChaosConsole";

const TOPOLOGY_STRIP_HEIGHT = 372; // tweak to taste

export function WarRoom() {
  const [chaosOpen, setChaosOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-bg text-text">
      <DesignSystemStyles />

      <div className="absolute top-3 left-3 right-3 z-30">
        <HeroCockpit onToggleChaos={() => setChaosOpen(o => !o)} />
      </div>

      {/* Body row — alerts left + trace/verdict right */}
      <div
        className="absolute top-[72px] left-3 w-[320px] z-20"
        style={{ bottom: TOPOLOGY_STRIP_HEIGHT + 12 }}
      >
        <AlertInbox />
      </div>

      <div
        className="absolute top-[72px] left-[336px] right-3 z-20 flex flex-col"
        style={{ bottom: TOPOLOGY_STRIP_HEIGHT + 12 }}
      >
        <TraceFeed>
          <VerdictCard />
        </TraceFeed>
      </div>

      {/* Topology — wide bottom strip, isometric server grid */}
      <div
        className="absolute left-3 right-3 bottom-3 z-20 rounded-xl overflow-hidden triagent-glass"
        style={{ height: TOPOLOGY_STRIP_HEIGHT }}
      >
        <Topology />  {/* your R3F canvas — top-side angled view */}
        <TopologyHUD nodes={NODES} edges={EDGES} />
      </div>

      <ChaosConsole open={chaosOpen} onClose={() => setChaosOpen(false)} />
    </div>
  );
}
```

### Topology data

The HUD addresses nodes by id. Use a 3×3 floor grid: **tools** on the left,
**engine → agent → gateway** in the middle column, **providers** on the right.

```ts
// floor positions in percent of the topology pane (0..100), matching your
// R3F screen-projected coords:
const NODES = {
  // tools (left)
  kubectl:    { x: 10, y: 35, kind: "tool",     color: "#a259ff" },
  prometheus: { x: 14, y: 55, kind: "tool",     color: "#34d399" },
  loki:       { x: 18, y: 78, kind: "tool",     color: "#fbbf24" },
  // middle column
  engine:     { x: 48, y: 30, kind: "engine",   color: "#60a5fa" },
  agent:      { x: 50, y: 50, kind: "agent",    color: "#a259ff" },
  gateway:    { x: 52, y: 75, kind: "gateway",  color: "#cdd2dd" },
  // providers (right)
  groq:       { x: 86, y: 32, kind: "provider", color: "#34d399" },
  ollama:     { x: 88, y: 52, kind: "provider", color: "#60a5fa" },
  anthropic:  { x: 90, y: 78, kind: "provider", color: "#a78bfa" },
};

const EDGES = [
  { id: "e-a",  from: "engine",  to: "agent",      kind: "control", flow: "low",  dashed: true },
  { id: "a-g",  from: "agent",   to: "gateway",    kind: "main",    flow: "high" },
  { id: "a-k",  from: "agent",   to: "kubectl",    kind: "tool",    flow: "high" },
  { id: "a-p",  from: "agent",   to: "prometheus", kind: "tool",    flow: "med"  },
  { id: "a-l",  from: "agent",   to: "loki",       kind: "tool",    flow: "med"  },
  { id: "g-gr", from: "gateway", to: "groq",       kind: "provider",flow: "high" },
  { id: "g-ol", from: "gateway", to: "ollama",     kind: "provider",flow: "med"  },
  { id: "g-an", from: "gateway", to: "anthropic",  kind: "provider",flow: "low"  },
];
```

Pass `<TopologyHUD nodes={NODES} edges={EDGES} showFloatingLabels />` if your
R3F scene draws bare spheres and you want the HUD to render label tags above
each one. Off by default — assume your scene draws labels itself.

## Notes

- All components use only Tailwind v4 token classes (`bg-bg-elevated`,
  `text-text-strong`, `border-accent`, etc.) plus the keyframes/glass helpers
  from `design-system.tsx`. No global CSS edits required beyond mounting
  `<DesignSystemStyles/>` once.
- Lucide icons throughout — `lucide-react` only.
- Selectors stay narrow (`useStore(s => s.X)`).
- A few wires use placeholder helpers: poison-json toggle in `ChaosConsole`
  is a `console.info` stub; swap for your real helper. `APPLY PATCH` in
  `VerdictCard` is also a stub.
