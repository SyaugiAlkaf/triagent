/* ============================================================================
 * TraceFeed — Track A
 * Live stream of trace events. Each row: timestamp · kind tag · detail.
 *
 * Recovery rows (provider_fallback, tool_substitute, provider_restore) get:
 *   - a faint left-rail tinted in the kind's color
 *   - a curved branch glyph in the marker column
 *   - a subtle gradient background so they read as a recovery arc, not noise
 *
 * The verdict card (when lastResult is present) mounts as a child below the
 * scroller so the SRE sees the saga + verdict in one frame.
 * ========================================================================== */
import React, { useEffect, useRef } from "react";
import { Terminal, Play, Pause, RotateCcw } from "lucide-react";
import { useStore } from "@/store/store";
import { TRACE_KIND_META } from "./design-system";

export interface TraceEvent {
  kind: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  detail?: string;
  timestamp?: number;
  investigation_id?: string;
  // t is a derived offset in ms from the investigation start; computed if absent.
  t?: number;
}

export interface TraceFeedProps {
  /** Optional verdict card slot — typically <VerdictCard/> from this design folder. */
  children?: React.ReactNode;
}

export function TraceFeed({ children }: TraceFeedProps) {
  const events = useStore(s => s.traceEvents) as TraceEvent[];
  const activeSlug = useStore(s => s.activeIncidentSlug) as string | null;
  const [paused, setPaused] = React.useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Compute relative timestamps once per event count if not provided
  const start = events?.[0]?.timestamp ?? events?.[0]?.t ?? 0;

  useEffect(() => {
    if (paused) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events?.length, paused]);

  return (
    <section className="triagent-glass rounded-xl flex flex-col overflow-hidden h-full">
      <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={11} className="text-accent" />
          <span className="font-mono uppercase font-medium" style={{ letterSpacing: "0.18em", fontSize: 10, color: "var(--color-text)" }}>
            LIVE TRACE
          </span>
          {activeSlug ? (
            <>
              <span className="text-text-dim text-[10px]">·</span>
              <span className="font-mono text-[10px] text-text tracking-[0.14em] truncate">{activeSlug}</span>
            </>
          ) : (
            <span className="font-mono text-[10px] text-text-dim">· idle</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-dim tabular-nums">{events?.length ?? 0} EV</span>
          <button onClick={() => setPaused(p => !p)} className="w-6 h-6 rounded grid place-items-center text-text-dim hover:text-text hover:bg-white/[0.04]">
            {paused ? <Play size={10} /> : <Pause size={10} />}
          </button>
          <button className="w-6 h-6 rounded grid place-items-center text-text-dim hover:text-text hover:bg-white/[0.04]" title="Scroll to top">
            <RotateCcw size={11} />
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto py-1.5 relative triagent-scan">
        {(events ?? []).map((e, i) => (
          <TraceRow key={i} event={e} idx={i} start={start} />
        ))}
        <ThinkingDots />
      </div>

      {children}
    </section>
  );
}

function TraceRow({ event, idx, start }: { event: TraceEvent; idx: number; start: number }) {
  const meta = TRACE_KIND_META[event.kind] ?? { color: "#cdd2dd", label: event.kind.toUpperCase() };
  const isRecovery = !!meta.recovery;
  const t = event.t ?? ((event.timestamp ?? 0) - start);

  return (
    <div
      className="triagent-trace-in relative grid gap-2 items-start py-1.5 px-2"
      style={{
        gridTemplateColumns: "58px 22px 90px 1fr",
        animationDelay: `${Math.min(idx * 30, 600)}ms`,
        background: isRecovery
          ? "linear-gradient(90deg, rgba(162,89,255,0.06), rgba(162,89,255,0) 60%)"
          : "transparent",
      }}
    >
      {isRecovery && (
        <div
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r"
          style={{
            background: `linear-gradient(180deg, ${meta.color}, color-mix(in oklch, ${meta.color} 40%, transparent))`,
            boxShadow: `0 0 8px ${meta.color}60`,
          }}
        />
      )}

      <span className="font-mono text-[10px] tabular-nums text-text-dim pt-[3px]">{fmtTs(t)}</span>

      <div className="relative flex justify-center pt-[3px]">
        {isRecovery ? (
          <span className="relative inline-flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute" style={{ left: -9, top: -1 }}>
              <path d="M2 2 Q 2 10 10 10" stroke={meta.color} strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
            </svg>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}, 0 0 0 2px color-mix(in oklch, ${meta.color} 22%, transparent)` }}
            />
          </span>
        ) : (
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}90` }} />
        )}
      </div>

      <span className="font-mono text-[10px] tracking-[0.16em] font-bold uppercase pt-[1px]" style={{ color: meta.color }}>
        {meta.label}
      </span>

      <span className="font-mono text-[11.5px] text-text leading-snug truncate" title={event.detail}>
        {event.detail}
        {event.latency_ms ? <span className="ml-2 text-text-dim tabular-nums">· {event.latency_ms}ms</span> : null}
      </span>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mt-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full triagent-pulse-dot" style={{ background: "var(--color-accent)", boxShadow: "0 0 6px var(--color-accent)" }} />
        <span className="inline-block w-1.5 h-1.5 rounded-full triagent-pulse-dot" style={{ background: "var(--color-accent)", boxShadow: "0 0 6px var(--color-accent)", animationDelay: "0.3s" }} />
        <span className="inline-block w-1.5 h-1.5 rounded-full triagent-pulse-dot" style={{ background: "var(--color-accent)", boxShadow: "0 0 6px var(--color-accent)", animationDelay: "0.6s" }} />
      </span>
      <span className="font-mono text-[10px] tracking-[0.18em] text-text-dim">AGENT THINKING</span>
    </div>
  );
}

function fmtTs(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const s = Math.floor(total / 1000);
  const ms_ = total % 1000;
  return `+${s}.${String(ms_).padStart(3, "0")}s`;
}

export default TraceFeed;
