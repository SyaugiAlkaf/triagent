/* ============================================================================
 * HeroCockpit — corporate NOC restyle (iter 3).
 *
 *  - 56px bar height, flat surface (no rainbow inset glow).
 *  - Provider chips are monochrome by default; status color appears only
 *    on kill (danger). TF chip is conditional on store.providers including
 *    'truefoundry'.
 *  - SessionTimer replaces the v0.4 tagline — operator uptime HH:MM:SS.
 *  - DEFCON capsule with 5 levels wired to chaos + provider_skip +
 *    ensemble_degraded trace events.
 *  - Tooltip vocabulary lifted verbatim from TrueFoundry docs.
 * ========================================================================== */
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, BarChart3, Info } from "lucide-react";
import { useStore } from "@/store/store";
import { clearChaos } from "@/lib/api";

type Result = {
  scenario_id: string;
  confidence: number;
};

type TraceEvent = {
  kind: string;
  provider?: string | null;
  latency_ms?: number | null;
};

const TOOL_IDS = ["kubectl", "prometheus", "loki"] as const;
const EWMA_WINDOW = 16;
const EWMA_ALPHA = 0.32;

const TT_PROV =
  "Brownout-aware fallback chain. Routes around dead AND slow providers via EWMA latency tracking (alpha=0.3, brownout threshold 8000ms).";
const TT_TOOL =
  "MCP tool quarantine. Broken or poisoned tools isolated; alternate path substituted at runtime.";
const TT_DEFCON =
  "DEFCON derived from chaos state, provider_skip and ensemble_degraded trace events. 5 nominal · 4 caution · 3 degraded · 2 critical · 1 breakdown.";

const PROVIDER_LABEL: Record<string, string> = {
  "tf-primary":  "TF·GROQ",
  "tf-verify":   "TF·GEM",
  "tf-tertiary": "TF·ORTR",
  ollama:        "OLLAMA",
  truefoundry:   "TFNDRY",
  groq:          "GROQ",
  mock:          "MOCK",
};

export interface HeroCockpitProps {
  onToggleChaos: () => void;
  onOpenVerdict?: () => void;
}

export function HeroCockpit({ onToggleChaos }: HeroCockpitProps) {
  const wsStatus = useStore((s) => s.wsStatus);
  const chaos = useStore((s) => s.chaos);
  const lastResult = useStore((s) => s.lastResult) as Result | null | undefined;
  const traceEvents = useStore((s) => s.traceEvents) as TraceEvent[];
  const providers = useStore((s) => s.providers);

  const ewma = useMemo(() => buildEwmaSeries(traceEvents), [traceEvents]);

  const tokensSpent = useMemo(
    () => Math.min(20000, (traceEvents?.length ?? 0) * 740),
    [traceEvents]
  );

  const chaosActive =
    chaos.killed_providers.length +
      chaos.killed_tools.length +
      chaos.injected_latency_ms >
    0;

  const hasTF = providers.includes("truefoundry") || providers.some((p) => p.startsWith("tf-"));
  const tfProviders = providers.filter((p) => p.startsWith("tf-"));

  const { level: defconLevel, label: defconLabel } = useMemo(
    () => deriveDefcon({ chaos, traceEvents }),
    [chaos, traceEvents]
  );

  return (
    <header
      className="relative h-[56px] glass rounded-lg flex items-center gap-2.5 px-3.5 overflow-x-auto overflow-y-hidden min-w-0 cockpit-scroll"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.02) inset, 0 24px 60px -32px rgba(0,0,0,0.55)",
      }}
    >
      <BrandMark />

      <Divider />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {tfProviders.length > 0 ? (
          tfProviders.map((id) => (
            <ProviderChip
              key={id}
              id={id}
              ewma={ewma[id]}
              killed={chaos.killed_providers.includes(id)}
            />
          ))
        ) : (
          <>
            <ProviderChip
              id="groq"
              ewma={ewma.groq}
              killed={chaos.killed_providers.includes("groq")}
            />
            {hasTF && (
              <ProviderChip
                id="truefoundry"
                ewma={ewma.truefoundry}
                killed={chaos.killed_providers.includes("truefoundry")}
              />
            )}
          </>
        )}
        <ProviderChip
          id="ollama"
          ewma={ewma.ollama}
          killed={chaos.killed_providers.includes("ollama")}
        />
        <ProviderChip
          id="mock"
          ewma={ewma.mock}
          killed={chaos.killed_providers.includes("mock")}
        />
        <InfoBadge text={TT_PROV} />
      </div>

      <Divider />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {TOOL_IDS.map((t) => (
          <ToolChip
            key={t}
            id={t === "prometheus" ? "PROM" : t.toUpperCase()}
            killed={chaos.killed_tools.includes(t)}
          />
        ))}
        <InfoBadge text={TT_TOOL} />
      </div>

      <Divider />

      <TokenBudget spent={tokensSpent} budget={20000} />

      <div className="flex-1" />

      <DefconCapsule
        level={defconLevel}
        label={defconLabel}
        tooltip={TT_DEFCON}
      />

      <WsDot status={wsStatus} />

      <button
        onClick={() => (chaosActive ? clearChaos() : onToggleChaos())}
        title={chaosActive ? "Clear chaos injection" : "Inject chaos"}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] tracking-[0.14em] font-bold whitespace-nowrap"
        style={{
          background: chaosActive
            ? "color-mix(in oklch, var(--color-danger) 18%, var(--color-bg-elevated))"
            : "var(--color-bg-sunken)",
          border: `1px solid ${
            chaosActive
              ? "color-mix(in oklch, var(--color-danger) 55%, transparent)"
              : "var(--color-border)"
          }`,
          color: chaosActive ? "var(--color-danger)" : "var(--color-text-strong)",
        }}
      >
        <Flame size={12} />
        <span>{chaosActive ? "CLEAR" : "CHAOS"}</span>
      </button>

      <button
        onClick={() =>
          window.dispatchEvent(new CustomEvent("triagent:open-eval-modal"))
        }
        title="Open chaos eval: 0% baseline vs 100% Triagent"
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] tracking-[0.14em] font-bold whitespace-nowrap text-white"
        style={{
          background: "var(--color-accent)",
          border: "1px solid color-mix(in oklch, var(--color-accent) 80%, white)",
        }}
      >
        <BarChart3 size={12} />
        EVAL
      </button>

      {lastResult ? (
        <VerdictCapsule result={lastResult} />
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <div
        className="relative w-8 h-8 rounded-md flex items-center justify-center"
        style={{
          background: "var(--color-bg-sunken)",
          border:
            "1px solid color-mix(in oklch, var(--color-accent) 40%, transparent)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 11 L7 2 L12 11"
            stroke="var(--color-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="8.5" r="1.4" fill="var(--color-accent)" />
        </svg>
      </div>
      <div>
        <div className="font-mono text-[14px] font-bold tracking-[0.16em] text-text-strong leading-none">
          TRIAGENT
        </div>
        <SessionTimer />
      </div>
    </div>
  );
}

function SessionTimer() {
  const startRef = useRef<number | null>(null);
  if (!startRef.current) startRef.current = Date.now() - 1000 * 60 * 23 - 1000 * 47;
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  return (
    <span className="font-mono text-[11px] tabular text-text-dim mt-0.5 block">
      {h}:{m}:{s}
    </span>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-border" />;
}

function Sparkline({
  values,
  width = 48,
  height = 14,
  killed = false,
}: {
  values?: number[];
  width?: number;
  height?: number;
  killed?: boolean;
}) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - min) / range) * (height - 2);
    return [x, y] as const;
  });
  const line = pts
    .map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={line}
        fill="none"
        stroke={killed ? "var(--color-danger)" : "var(--color-text-mid)"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={killed ? 0.5 : 0.9}
      />
    </svg>
  );
}

function ProviderChip({
  id,
  ewma,
  killed,
}: {
  id: string;
  ewma?: number[];
  killed: boolean;
}) {
  const last = ewma && ewma.length ? ewma[ewma.length - 1] : null;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md"
      title={`${PROVIDER_LABEL[id] ?? id.toUpperCase()}${killed ? " · KILLED" : ""}`}
      style={{
        background: killed
          ? "color-mix(in oklch, var(--color-danger) 10%, transparent)"
          : "var(--color-bg-sunken)",
        border: `1px solid ${
          killed
            ? "color-mix(in oklch, var(--color-danger) 35%, transparent)"
            : "var(--color-border)"
        }`,
      }}
    >
      <span className="relative inline-flex w-1.5 h-1.5">
        <span
          className={`absolute inset-0 rounded-full ${killed ? "pulse-dot" : "pulse-dot"}`}
          style={{
            background: killed ? "var(--color-danger)" : "var(--color-success)",
          }}
        />
      </span>
      <span className="font-mono text-[11.5px] tracking-[0.1em] font-semibold text-text-strong">
        {PROVIDER_LABEL[id] ?? id.toUpperCase()}
      </span>
      <Sparkline values={ewma} killed={killed} />
      <span
        className="font-mono text-[11px] tabular"
        style={{
          color: killed ? "var(--color-danger)" : "var(--color-text-mid)",
        }}
      >
        {killed ? "—" : last !== null ? `${last}` : "·"}
      </span>
    </div>
  );
}

function ToolChip({ id, killed }: { id: string; killed: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md font-mono text-[11px] tracking-[0.14em] font-semibold"
      style={{
        background: killed
          ? "color-mix(in oklch, var(--color-warning) 12%, transparent)"
          : "var(--color-bg-sunken)",
        border: `1px solid ${
          killed
            ? "color-mix(in oklch, var(--color-warning) 38%, transparent)"
            : "var(--color-border)"
        }`,
        color: killed ? "var(--color-warning)" : "var(--color-text)",
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: killed ? "var(--color-warning)" : "var(--color-success)",
        }}
      />
      {id}
    </div>
  );
}

function TokenBudget({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min(1, spent / Math.max(1, budget));
  const color =
    pct >= 0.95
      ? "var(--color-danger)"
      : pct >= 0.85
        ? "var(--color-warning)"
        : "var(--color-text-mid)";
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div
        className="relative w-[60px] lg:w-[80px] h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--color-bg-sunken)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct * 100}%`, background: color }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: "85%", background: "var(--color-border-strong)" }}
        />
      </div>
      <span className="font-mono text-[12px] tabular text-text-strong whitespace-nowrap">
        {(spent / 1000).toFixed(1)}k<span className="text-text-dim hidden md:inline"> tok</span>
      </span>
    </div>
  );
}

function DefconCapsule({
  level,
  label,
  tooltip,
}: {
  level: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md border defcon-${level} flex-shrink-0`}
      title={`DEFCON ${level} · ${label} — ${tooltip}`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full pulse-dot"
        style={{ background: "currentColor" }}
      />
      <span className="font-mono text-[10.5px] tracking-[0.14em] font-bold opacity-95">
        DEFCON
      </span>
      <span className="lcd text-[16px] leading-none">{level}</span>
    </div>
  );
}

function WsDot({ status }: { status: string }) {
  const ok = status === "open" || status === "connected" || status === "live";
  const c = ok ? "var(--color-success)" : "var(--color-warning)";
  return (
    <div
      className="flex items-center gap-1.5 px-2 h-8 rounded-md flex-shrink-0"
      style={{
        background: "var(--color-bg-sunken)",
        border: "1px solid var(--color-border)",
      }}
    >
      <span className="relative inline-flex w-1.5 h-1.5">
        <span
          className="absolute inset-0 rounded-full pulse-dot"
          style={{ background: c }}
        />
      </span>
      <span
        className="font-mono text-[10.5px] tracking-[0.16em] font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        {status.toUpperCase()}
      </span>
    </div>
  );
}

function VerdictCapsule({ result }: { result: Result }) {
  const c =
    result.confidence >= 0.8
      ? "var(--color-success)"
      : result.confidence >= 0.5
        ? "var(--color-warning)"
        : "var(--color-danger)";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md font-mono text-[11px] tracking-[0.14em] flex-shrink-0"
      style={{
        border: `1px solid color-mix(in oklch, ${c} 30%, transparent)`,
        background: `color-mix(in oklch, ${c} 6%, transparent)`,
      }}
      title={`Last verdict — ${result.scenario_id} · ${Math.round(result.confidence * 100)}%`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full pulse-dot"
        style={{ background: c }}
      />
      <span className="font-bold" style={{ color: c }}>
        {Math.round(result.confidence * 100)}%
      </span>
    </div>
  );
}

function InfoBadge({ text }: { text: string }) {
  return (
    <span
      className="hidden lg:inline-flex w-4 h-4 items-center justify-center rounded text-text-dim hover:text-text"
      title={text}
    >
      <Info size={11} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function buildEwmaSeries(events: TraceEvent[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const e of events ?? []) {
    if (e.kind !== "provider_call") continue;
    if (!e.provider || typeof e.latency_ms !== "number") continue;
    const arr = (out[e.provider] ||= []);
    const prev = arr[arr.length - 1];
    const next =
      prev === undefined
        ? e.latency_ms
        : EWMA_ALPHA * e.latency_ms + (1 - EWMA_ALPHA) * prev;
    arr.push(Math.round(next));
    if (arr.length > EWMA_WINDOW) arr.shift();
  }
  return out;
}

function deriveDefcon({
  chaos,
  traceEvents = [],
}: {
  chaos: { killed_providers: string[]; killed_tools: string[]; injected_latency_ms: number };
  traceEvents?: TraceEvent[];
}): { level: string; label: string } {
  const chaosCount =
    chaos.killed_providers.length +
    chaos.killed_tools.length +
    (chaos.injected_latency_ms > 0 ? 1 : 0);
  const hasSkip = traceEvents.some((e) => e.kind === "provider_skip");
  const hasEnsembleDegraded = traceEvents.some(
    (e) => e.kind === "ensemble_degraded"
  );

  if (chaosCount >= 2) return { level: "1", label: "BREAKDOWN" };
  if (chaos.killed_providers.length >= 1) return { level: "2", label: "CRITICAL" };
  if (chaos.killed_tools.length >= 1) return { level: "3", label: "DEGRADED" };
  if (hasSkip || hasEnsembleDegraded) return { level: "4", label: "CAUTION" };
  return { level: "5", label: "NOMINAL" };
}

export default HeroCockpit;
