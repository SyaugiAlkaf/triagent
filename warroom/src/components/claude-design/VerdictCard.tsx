import { useEffect, useMemo, useState } from "react";
import {
  Wrench,
  Zap,
  Copy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  Timer,
  Coins,
  Cpu,
  Check,
  AlertTriangle,
  Play,
} from "lucide-react";
import { useStore } from "@/store/store";
import { PROVIDER_META } from "./design-system";

type Ensemble = {
  consensus: boolean;
  hypothesize?: { provider?: string; confidence?: number };
  verify?: { provider?: string; confidence?: number };
};

/* ============================================================================
 * VerdictCard
 * ----------------------------------------------------------------------------
 * The investigation's "money shot" — slides in below the trace once the agent
 * finishes. Designed to be screenshot-worthy: confidence arc, root-cause
 * headline, latency / token / cost triad with sparkline + budget bar +
 * per-provider breakdown, and a remediation callout with action buttons.
 *
 * Reads from the existing zustand store via narrow selectors so re-renders
 * stay tight to the slices it actually uses.
 * ========================================================================== */

type Result = {
  scenario_id: string;
  namespace: string;
  failing_pod: string;
  findings: string[];
  hypotheses: string[];
  root_cause: string;
  confidence: number; // 0..1
  latency_ms: number;
  tokens_spent: number;
  token_budget: number;
  cost_usd: number;
  cost_by_provider: Record<string, number>;
  ensemble?: Ensemble | null;
};

export function VerdictCard() {
  const result = useStore((s) => s.lastResult) as Result | null | undefined;
  const traceEvents = useStore((s) => s.traceEvents);

  const latencyHistory = useMemo(() => {
    const events = traceEvents ?? [];
    const series: number[] = [];
    for (let i = 0; i < events.length && series.length < 48; i++) {
      const e = events[i];
      if (e?.kind === "provider_call" && typeof e.latency_ms === "number") {
        series.push(e.latency_ms);
      }
    }
    return series.slice(-24);
  }, [traceEvents]);

  if (!result) return null;

  return <VerdictCardInner result={result} latencyHistory={latencyHistory} />;
}

function VerdictCardInner({
  result,
  latencyHistory,
}: {
  result: Result;
  latencyHistory: number[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const verdictKind: "resolved" | "inconclusive" | "failed" =
    result.confidence >= 0.7
      ? "resolved"
      : result.confidence >= 0.4
        ? "inconclusive"
        : "failed";

  return (
    <article
      className="land-in relative w-full rounded-2xl overflow-hidden bg-bg-card border border-border-strong"
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px -20px rgba(0,0,0,0.7)",
      }}
    >
      <Header
        scenario={result.scenario_id}
        kind={verdictKind}
        ensemble={result.ensemble ?? null}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {collapsed ? (
        <CollapsedDebrief result={result} />
      ) : (
        <>
          <Body result={result} />
          <StatsTriad result={result} latencyHistory={latencyHistory} />
          <Remediation result={result} />
          <Footer
            hypothesesCount={result.hypotheses.length}
            findingsCount={result.findings.length}
            tokensSpent={result.tokens_spent}
          />
        </>
      )}

      {/* Inline keyframes — extracted as a <style> tag so the component is
       * fully drop-in and doesn't require touching tailwind.config or globals.
       * If you'd rather move these to globals.css, the class names are:
       *   .land-in, .fade-up, .scan, .pulse-dot
       */}
      <Styles />
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * HEADER
 * ------------------------------------------------------------------------- */

function Header({
  scenario,
  kind,
  ensemble,
  collapsed,
  onToggle,
}: {
  scenario: string;
  kind: "resolved" | "inconclusive" | "failed";
  ensemble: Ensemble | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="relative flex items-center justify-between px-6 py-3 border-b border-border bg-bg-elevated">
      <div className="flex items-center gap-3 min-w-0">
        <StatusPill kind={kind} />
        {ensemble ? <EnsembleBadge ensemble={ensemble} /> : null}
        <span className="text-text-dim text-[11px] font-mono">·</span>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="label">SCENARIO</span>
          <span className="font-mono text-[12px] text-text-strong truncate">
            {scenario}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="label">INVESTIGATION CLOSED</span>
        <LiveTimestamp />
        <button
          onClick={onToggle}
          title={collapsed ? "Expand verdict" : "Collapse verdict"}
          className="w-6 h-6 rounded grid place-items-center text-text-dim hover:text-text-strong hover:bg-white/[0.05]"
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>
    </header>
  );
}

function EnsembleBadge({ ensemble }: { ensemble: Ensemble }) {
  const consensus = !!ensemble.consensus;
  const color = consensus ? "var(--color-success)" : "var(--color-warning)";
  const label = consensus ? "CONSENSUS" : "DIVERGENT";
  const tooltip = consensus
    ? "Cross-provider ensemble verify. hypothesize_node and verify_node ran on DIFFERENT model families and arrived at the same root cause."
    : "Cross-provider ensemble verify ran on different model families. The verifier disagreed with the hypothesizer — verdict flagged divergent.";
  const hyp = ensemble.hypothesize?.provider ?? "?";
  const ver = ensemble.verify?.provider ?? "?";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded"
      title={tooltip}
      style={{
        border: `1px solid color-mix(in oklch, ${color} 45%, transparent)`,
        background: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      {consensus ? (
        <Check size={10} style={{ color }} />
      ) : (
        <AlertTriangle size={10} style={{ color }} />
      )}
      <span
        className="font-mono text-[10px] tracking-[0.12em] font-bold"
        style={{ color }}
      >
        {label}
      </span>
      <span className="font-mono text-[10px] text-text-dim">
        {hyp}→{ver}
      </span>
    </span>
  );
}

function CollapsedDebrief({ result }: { result: Result }) {
  const onOpenTrace = () => {
    document
      .querySelector("[data-trace-feed-scroll]")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <span className="font-mono text-[20px] font-semibold text-text-strong tabular leading-none">
        {Math.round(result.confidence * 100)}
        <span className="text-text-dim text-[13px]">%</span>
      </span>
      <span className="h-4 w-px bg-border" />
      <span
        className="text-[13px] text-text-strong truncate flex-1"
        title={result.root_cause}
      >
        {result.root_cause}
      </span>
      <span className="font-mono text-[11px] text-text-dim tabular flex-shrink-0">
        {(result.latency_ms / 1000).toFixed(2)}s ·{" "}
        {(result.tokens_spent / 1000).toFixed(1)}k · ${result.cost_usd.toFixed(4)}
      </span>
      <button
        onClick={onOpenTrace}
        className="inline-flex items-center gap-1 px-2 h-7 rounded font-mono text-[10.5px] tracking-[0.1em] font-bold text-white flex-shrink-0"
        style={{
          background: "var(--color-accent)",
          border: "1px solid color-mix(in oklch, var(--color-accent) 80%, white)",
        }}
      >
        <Play size={10} /> REPLAY
      </button>
    </div>
  );
}

function StatusPill({
  kind,
}: {
  kind: "resolved" | "inconclusive" | "failed";
}) {
  const map = {
    resolved:     { color: "var(--color-success)", text: "RESOLVED",     glow: true },
    inconclusive: { color: "var(--color-warning)", text: "INCONCLUSIVE", glow: false },
    failed:       { color: "var(--color-danger)",  text: "FAILED",       glow: false },
  } as const;
  const m = map[kind];
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border"
      style={{
        borderColor: `color-mix(in oklch, ${m.color} 38%, transparent)`,
        background: `color-mix(in oklch, ${m.color} 8%, transparent)`,
      }}
    >
      <span className="relative inline-flex w-1.5 h-1.5">
        <span
          className="absolute inset-0 rounded-full pulse-dot"
          style={{
            background: m.color,
            boxShadow: m.glow ? `0 0 8px ${m.color}` : "none",
          }}
        />
      </span>
      <span
        className="font-mono text-[10px] tracking-[0.22em] font-semibold"
        style={{ color: m.color }}
      >
        {m.text}
      </span>
    </div>
  );
}

function LiveTimestamp() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return (
    <span className="font-mono text-[11px] tabular text-text-dim">
      {hh}:{mm}:{ss} UTC
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * BODY — confidence meter + root cause + findings
 * ------------------------------------------------------------------------- */

function Body({ result }: { result: Result }) {
  return (
    <section className="relative px-6 pt-6 pb-5 flex items-start gap-6">
      <ConfidenceMeter value={result.confidence} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="label">ROOT CAUSE</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <h2
          className="text-text-strong text-[18.5px] leading-[1.35] font-medium"
          style={{ letterSpacing: "-0.005em", textWrap: "pretty" }}
        >
          {result.root_cause}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <span className="px-1.5 py-0.5 rounded border border-border bg-[#0f1219] text-text">
            <span className="text-text-dim">pod </span>
            {result.failing_pod}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-border bg-[#0f1219] text-text">
            <span className="text-text-dim">ns </span>
            {result.namespace}
          </span>
        </div>

        {result.findings.length > 0 && (
          <div className="mt-4">
            <div className="label mb-2">KEY FINDINGS</div>
            <ul className="flex flex-col gap-1.5">
              {result.findings.slice(0, 3).map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[12.5px] text-text leading-snug fade-up"
                  style={{ animationDelay: `${380 + i * 80}ms` }}
                >
                  <span
                    className="mt-[7px] inline-block w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: "var(--color-text-dim)" }}
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * CONFIDENCE METER — 270° arc gauge, animated fill
 * ------------------------------------------------------------------------- */

function ConfidenceMeter({ value }: { value: number }) {
  const r = 64;
  const cx = 80;
  const cy = 80;
  const startA = 225;
  const sweep = 270;

  const toXY = (deg: number): [number, number] => [
    cx + r * Math.sin((deg * Math.PI) / 180),
    cy - r * Math.cos((deg * Math.PI) / 180),
  ];
  const [sx, sy] = toXY(startA);
  const [tex, tey] = toXY(((startA + sweep) % 360 + 360) % 360);

  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnim(eased * value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const fillSweep = sweep * anim;
  const fillEndAngle = ((startA + fillSweep) % 360 + 360) % 360;
  const [fex, fey] = toXY(fillEndAngle);
  const largeArc = fillSweep > 180 ? 1 : 0;

  const tier = value >= 0.8 ? "high" : value >= 0.5 ? "med" : "low";
  const tierColor =
    tier === "high"
      ? "var(--color-success)"
      : tier === "med"
        ? "var(--color-warning)"
        : "var(--color-danger)";
  const tierLabel = tier === "high" ? "HIGH" : tier === "med" ? "MEDIUM" : "LOW";
  const gradStart =
    tier === "high" ? "#10b981" : tier === "med" ? "#f59e0b" : "#ef4444";
  const gradEnd =
    tier === "high" ? "#6ee7b7" : tier === "med" ? "#fde68a" : "#fca5a5";

  const trackPath = `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${tex} ${tey}`;
  const fillPath =
    anim > 0.005
      ? `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${fex} ${fey}`
      : "";

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const a = startA + sweep * t;
    const aw = ((a % 360) + 360) % 360;
    const [x1, y1] = toXY(aw);
    const inner = r - 12;
    const x2 = cx + inner * Math.sin((aw * Math.PI) / 180);
    const y2 = cy - inner * Math.cos((aw * Math.PI) / 180);
    return { x1, y1, x2, y2, t };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: 160, height: 160 }}>
      <svg viewBox="0 0 160 160" className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="confGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={gradStart} />
            <stop offset="100%" stopColor={gradEnd} />
          </linearGradient>
          <filter id="confGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        {ticks.map((tk) => (
          <line
            key={tk.t}
            x1={tk.x1}
            y1={tk.y1}
            x2={tk.x2}
            y2={tk.y2}
            stroke="#2a2f3e"
            strokeWidth="1"
            strokeLinecap="round"
          />
        ))}
        <path
          d={trackPath}
          fill="none"
          stroke="#1d212c"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {fillPath && (
          <>
            <path
              d={fillPath}
              fill="none"
              stroke="url(#confGrad)"
              strokeWidth="14"
              strokeLinecap="round"
              opacity="0.35"
              filter="url(#confGlow)"
            />
            <path
              d={fillPath}
              fill="none"
              stroke="url(#confGrad)"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="text-[44px] leading-none font-semibold text-text-strong tabular"
          style={{ letterSpacing: "-0.02em" }}
        >
          {Math.round(anim * 100)}
          <span className="text-text-dim text-[22px] ml-0.5">%</span>
        </div>
        <div className="label mt-1">CONFIDENCE</div>
        <div
          className="mt-2 px-2 py-0.5 rounded-sm tabular text-[10px] tracking-[0.2em] font-medium font-mono"
          style={{
            color: tierColor,
            background: `color-mix(in oklch, ${tierColor} 12%, transparent)`,
          }}
        >
          {tierLabel}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * STATS TRIAD — latency / tokens / cost
 * ------------------------------------------------------------------------- */

function StatsTriad({
  result,
  latencyHistory,
}: {
  result: Result;
  latencyHistory: number[];
}) {
  const fmtLatencyValue = (ms: number) =>
    ms >= 1000 ? (ms / 1000).toFixed(2) : `${ms}`;
  const fmtLatencyUnit = (ms: number) => (ms >= 1000 ? "s" : "ms");

  const p50 = useMemo(() => {
    if (!latencyHistory.length) return null;
    const sorted = [...latencyHistory].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [latencyHistory]);

  return (
    <section className="relative grid grid-cols-3 border-t border-border bg-[#13161e]">
      <div className="border-r border-border">
        <StatCell
          label="LATENCY"
          icon={<Timer size={11} />}
          value={fmtLatencyValue(result.latency_ms)}
          sub={fmtLatencyUnit(result.latency_ms)}
          accent="var(--color-info)"
          right={
            p50 ? (
              <span className="font-mono text-[10px] text-text-dim tabular">
                p50 · {(p50 / 1000).toFixed(2)}s
              </span>
            ) : null
          }
        >
          {latencyHistory.length >= 2 ? (
            <Sparkline values={latencyHistory} color="var(--color-info)" />
          ) : (
            <div className="h-[26px]" />
          )}
        </StatCell>
      </div>

      <div className="border-r border-border">
        <StatCell
          label="TOKENS"
          icon={<Cpu size={11} />}
          value={result.tokens_spent.toLocaleString()}
          sub={`/ ${result.token_budget.toLocaleString()}`}
          accent="var(--color-warning)"
        >
          <TokenBar
            spent={result.tokens_spent}
            budget={result.token_budget}
          />
        </StatCell>
      </div>

      <StatCell
        label="COST"
        icon={<Coins size={11} />}
        value={`$${result.cost_usd.toFixed(4)}`}
        accent="var(--color-success)"
        right={
          <span className="font-mono text-[10px] text-text-dim tabular">
            USD
          </span>
        }
      >
        <CostBreakdown by={result.cost_by_provider} />
      </StatCell>
    </section>
  );
}

function StatCell({
  label,
  icon,
  value,
  sub,
  accent,
  right,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub?: string;
  accent?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 px-5 py-4 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color: accent || "var(--color-text-dim)" }}>
            {icon}
          </span>
          <span className="label">{label}</span>
        </div>
        {right}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[22px] leading-none font-semibold text-text-strong tabular"
          style={{ letterSpacing: "-0.01em" }}
        >
          {value}
        </span>
        {sub && (
          <span className="text-text-dim text-[11px] font-mono tabular">
            {sub}
          </span>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Sparkline({
  values,
  color = "var(--color-info)",
  width = 92,
  height = 26,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${height} L ${pts[0][0].toFixed(1)} ${height} Z`;
  const last = pts[pts.length - 1];
  const gradId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, []);
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} opacity="0.25" />
    </svg>
  );
}

function TokenBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min(1, spent / Math.max(1, budget));
  const overWarn = pct >= 0.85;
  const overCrit = pct >= 0.95;
  const color = overCrit
    ? "var(--color-danger)"
    : overWarn
      ? "var(--color-warning)"
      : "var(--color-info)";

  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnim(eased * pct);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div className="w-full">
      <div className="relative h-1.5 rounded-full bg-[#1d212c] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${anim * 100}%`,
            background: `linear-gradient(90deg, ${color}, color-mix(in oklch, ${color} 60%, white))`,
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-[#2a2f3e]" style={{ left: "50%" }} />
        <div className="absolute top-0 bottom-0 w-px bg-[#2a2f3e]" style={{ left: "85%" }} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[11px]">
        <span className="tabular text-text">
          {spent.toLocaleString()}
          <span className="text-text-dim"> / {budget.toLocaleString()}</span>
        </span>
        <span className="tabular" style={{ color }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
    </div>
  );
}

function CostBreakdown({ by }: { by: Record<string, number> }) {
  const entries = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1e-9);
  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([k, v], i) => {
        const meta =
          PROVIDER_META[k] ?? {
            color: "var(--color-text-dim)",
            label: k.toUpperCase(),
          };
        const w = (v / max) * 100;
        return (
          <div
            key={k}
            className="flex items-center gap-2 fade-up"
            style={{ animationDelay: `${300 + i * 80}ms` }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: meta.color,
                boxShadow: `0 0 6px ${meta.color}80`,
              }}
            />
            <span
              className="label"
              style={{ width: 64, color: "var(--color-text-dim)" }}
            >
              {meta.label}
            </span>
            <div className="flex-1 h-1 rounded-full bg-[#1d212c] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${w}%`, background: meta.color, opacity: 0.85 }}
              />
            </div>
            <span
              className="font-mono tabular text-[11px] text-text-strong"
              style={{ minWidth: 52, textAlign: "right" }}
            >
              ${v.toFixed(4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * REMEDIATION CALLOUT
 * ------------------------------------------------------------------------- */

function Remediation({ result }: { result: Result }) {
  const onOpenTrace = () => {
    document
      .querySelector("[data-trace-feed-scroll]")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onExportReceipt = () => {
    const receipt = {
      scenario_id: result.scenario_id,
      namespace: result.namespace,
      failing_pod: result.failing_pod,
      root_cause: result.root_cause,
      confidence: result.confidence,
      latency_ms: result.latency_ms,
      tokens_spent: result.tokens_spent,
      token_budget: result.token_budget,
      cost_usd: result.cost_usd,
      cost_by_provider: result.cost_by_provider,
      ensemble: (result as Result & { ensemble?: unknown }).ensemble ?? null,
      trace_event_count: (result as Result & { trace?: unknown[] }).trace?.length ?? null,
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `triagent-receipt-${result.scenario_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const onViewEval = () => {
    window.dispatchEvent(new CustomEvent("triagent:open-eval-modal"));
  };

  return (
    <section
      className="relative border-t border-border px-6 py-5"
      style={{
        background:
          "linear-gradient(90deg, rgba(162,89,255,0.06), rgba(162,89,255,0.0) 60%)",
      }}
    >
      <div
        className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r"
        style={{
          background:
            "linear-gradient(180deg, var(--color-accent), color-mix(in oklch, var(--color-accent) 50%, transparent))",
        }}
      />

      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
          style={{
            background:
              "color-mix(in oklch, var(--color-accent) 16%, transparent)",
            color: "var(--color-accent)",
          }}
        >
          <Wrench size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="label" style={{ color: "var(--color-accent)" }}>
              REMEDIATION
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              SUGGESTED PATCH
            </span>
          </div>
          <p
            className="text-text-strong text-[14px] leading-[1.5]"
            style={{ textWrap: "pretty" }}
          >
            {/* The verdict copy is intentionally rendered as plain text here.
             *  When you have a structured remediation field on Result later,
             *  swap this paragraph for a templated render with <code> spans. */}
            {result.root_cause}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenTrace}
              className="group inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] tracking-[0.12em] font-semibold text-white"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklch, var(--color-accent) 95%, white), var(--color-accent))",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px -4px color-mix(in oklch, var(--color-accent) 70%, transparent)",
              }}
            >
              <Zap size={13} />
              OPEN TRACE
              <ChevronRight
                size={13}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
            <button
              onClick={onExportReceipt}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] tracking-[0.12em] font-semibold text-text border border-border-strong hover:border-accent hover:text-text-strong transition-colors bg-[#0f1219]"
            >
              <Copy size={12} />
              EXPORT RECEIPT
            </button>
            <button
              onClick={onViewEval}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] tracking-[0.12em] font-semibold text-text-dim border border-border hover:text-text transition-colors"
            >
              VIEW EVAL
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * FOOTER
 * ------------------------------------------------------------------------- */

function Footer({
  hypothesesCount,
  findingsCount,
  tokensSpent,
}: {
  hypothesesCount: number;
  findingsCount: number;
  tokensSpent: number;
}) {
  return (
    <footer className="flex items-center justify-between px-6 py-2.5 bg-bg-elevated border-t border-border">
      <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.14em] text-text-dim">
        <span>HYPOTHESES TESTED · {hypothesesCount}</span>
        <span>FINDINGS · {findingsCount}</span>
        <span>TRACE · {Math.round(tokensSpent / 28)} events</span>
      </div>
      <button className="font-mono text-[10px] tracking-[0.18em] text-text-dim hover:text-text inline-flex items-center gap-1">
        DETAILS <ChevronRight size={10} />
      </button>
    </footer>
  );
}

/* ---------------------------------------------------------------------------
 * STYLES — scoped via class names; safe to move into globals.css
 * ------------------------------------------------------------------------- */

function Styles() {
  return (
    <style>{`
      @keyframes triagent-landIn {
        0%   { opacity: 0; transform: translateY(14px) scale(0.985); filter: blur(2px); }
        60%  { opacity: 1; filter: blur(0); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      .land-in { animation: triagent-landIn 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }

      @keyframes triagent-fadeUp {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .fade-up { animation: triagent-fadeUp 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }

      @keyframes triagent-scanline {
        0% { background-position: 0 -100%; }
        100% { background-position: 0 100%; }
      }
      .scan {
        background-image: linear-gradient(180deg, transparent 0%, rgba(162,89,255,0.06) 50%, transparent 100%);
        background-size: 100% 200%;
        animation: triagent-scanline 4.5s linear infinite;
      }

      @keyframes triagent-pulseDot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      .pulse-dot { animation: triagent-pulseDot 2s ease-in-out infinite; }

      .tabular { font-variant-numeric: tabular-nums; }
      .label {
        font-family: var(--font-mono, ui-monospace, monospace);
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 10px;
        color: var(--color-text-dim);
        font-weight: 500;
      }
    `}</style>
  );
}

export default VerdictCard;
