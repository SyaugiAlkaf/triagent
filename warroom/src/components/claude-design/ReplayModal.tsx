import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Activity, Terminal, Footprints, Timer, Cpu, Coins } from "lucide-react";
import { useStore } from "@/store/store";
import { TRACE_KIND_META } from "./design-system";
import type { TraceEvent, Result } from "@/types";

interface ReplayModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReplayModal({ open, onClose }: ReplayModalProps) {
  const events = useStore((s) => s.traceEvents) as TraceEvent[];
  const result = useStore((s) => s.lastResult) as Result | null;
  const total = events?.length ?? 0;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [open]);

  useEffect(() => {
    if (!playing || !open) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => Math.min(total, s + 1)), 600 / speed);
    return () => clearTimeout(id);
  }, [playing, step, total, speed, open]);

  useEffect(() => {
    if (!scrollerRef.current) return;
    const el = scrollerRef.current.querySelector(`[data-step="${Math.max(0, step - 1)}"]`);
    if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }, [step]);

  if (!open) return null;

  const playhead = Math.max(0, Math.min(total, step));
  const frac = total > 0 ? playhead / total : 0;
  const current = events[playhead - 1];
  const seenKinds = new Set(events.slice(0, playhead).map((e) => e.kind));

  const snapshotConfidence = result ? (result.confidence ?? 0) * frac : 0;
  const snapshotTokens = result ? Math.round((result.tokens_spent ?? 0) * frac) : 0;
  const snapshotLatency = result ? Math.round((result.latency_ms ?? 0) * frac) : 0;
  const snapshotCost = result ? (result.cost_usd ?? 0) * frac : 0;
  const findings: string[] = (result?.findings as string[] | undefined) ?? [];
  const findingsUnlocked = result ? Math.floor(frac * (findings.length + 0.5)) : 0;
  const budget = result?.token_budget ?? 20000;
  const isComplete = playhead === total && total > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(5,7,12,0.78)", backdropFilter: "blur(10px)" }}
        onClick={onClose}
      />
      <div
        className="relative z-10 rounded-xl overflow-hidden flex flex-col"
        style={{
          width: "82%",
          maxWidth: 1280,
          height: "82%",
          maxHeight: 760,
          background: "linear-gradient(180deg, rgba(22,25,34,0.94), rgba(11,13,19,0.94))",
          border: "1px solid rgba(162,89,255,0.40)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 60px -10px rgba(162,89,255,0.45), 0 30px 80px -20px rgba(0,0,0,0.8)",
        }}
      >
        <header className="relative px-5 py-3 border-b border-border/60 flex items-center justify-between" style={{ background: "var(--color-bg-elevated)" }}>
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.7 }}
          />
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-md grid place-items-center"
              style={{
                background: "linear-gradient(135deg, #c084fc, #7c3aed)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 16px rgba(162,89,255,0.4)",
              }}
            >
              <Footprints size={14} className="text-white" />
            </div>
            <div className="leading-[1.1]">
              <div className="font-mono text-[13px] tracking-[0.24em] font-bold text-text-strong">SESSION REPLAY</div>
              <div className="font-mono text-[10px] tracking-[0.22em] text-text-dim">
                {result?.scenario_id ?? "—"} · {total} EVENTS · client-side introspection
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="lcd text-[20px] tabular-nums" style={{ color: "var(--color-accent)" }}>
              {String(playhead).padStart(2, "0")}
              <span className="text-text-dim">/{String(total).padStart(2, "0")}</span>
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 grid place-items-center rounded text-text-dim hover:text-text hover:bg-white/[0.04]"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="flex-1 grid gap-4 p-5 overflow-hidden" style={{ gridTemplateColumns: "1.4fr 1fr", minHeight: 0 }}>
          <section className="rounded-lg border border-border/60 flex flex-col overflow-hidden" style={{ background: "rgba(15, 18, 25, 0.6)" }}>
            <div className="px-3.5 py-2 border-b border-border/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={11} className="text-accent" />
                <span className="font-mono uppercase font-medium text-text" style={{ letterSpacing: "0.12em", fontSize: 11.5 }}>
                  TRACE PLAYBACK
                </span>
              </div>
              {current && (
                <span
                  className="font-mono text-[10px] tracking-[0.16em]"
                  style={{ color: TRACE_KIND_META[current.kind]?.color ?? "#cdd2dd" }}
                >
                  ▸ {current.kind.toUpperCase()}
                </span>
              )}
            </div>
            <div ref={scrollerRef} className="flex-1 overflow-y-auto py-2 relative">
              {events.map((e, i) => (
                <ReplayTraceRow key={i} event={e} idx={i} step={step} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border/60 flex flex-col overflow-hidden" style={{ background: "rgba(15, 18, 25, 0.6)" }}>
            <div className="px-3.5 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0">
              <Activity size={11} className="text-accent" />
              <span className="font-mono uppercase font-medium text-text" style={{ letterSpacing: "0.12em", fontSize: 11.5 }}>
                VERDICT AT STEP {playhead}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <SnapshotPanel
                current={current}
                confidence={snapshotConfidence}
                tokens={snapshotTokens}
                latency={snapshotLatency}
                cost={snapshotCost}
                budget={budget}
                rootCause={result?.root_cause}
                findings={findings}
                findingsUnlocked={findingsUnlocked}
                seenKinds={seenKinds}
                isComplete={isComplete}
              />
            </div>
          </section>
        </div>

        <footer className="border-t border-border/60 px-5 py-3" style={{ background: "var(--color-bg-elevated)" }}>
          <Scrubber total={total} playhead={playhead} onPlayhead={setStep} />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => { setStep(0); setPlaying(true); }} className="inline-flex items-center justify-center w-8 h-8 rounded text-text-dim hover:text-text hover:bg-white/[0.04]" title="restart">
                <RotateCcw size={13} />
              </button>
              <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex items-center justify-center w-8 h-8 rounded text-text-dim hover:text-text hover:bg-white/[0.04]" title="step back">
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-md font-mono text-[11px] tracking-[0.18em] font-bold text-white"
                style={{
                  background: "linear-gradient(180deg, color-mix(in oklch, var(--color-accent) 95%, white), var(--color-accent))",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 4px 14px -4px rgba(162,89,255,.7)",
                }}
              >
                {playing ? <Pause size={12} /> : <Play size={12} />}
                {playing ? "PAUSE" : "PLAY"}
              </button>
              <button onClick={() => setStep((s) => Math.min(total, s + 1))} className="inline-flex items-center justify-center w-8 h-8 rounded text-text-dim hover:text-text hover:bg-white/[0.04]" title="step forward">
                <ChevronRight size={13} />
              </button>
              <div className="ml-2 inline-flex rounded border border-border/60 overflow-hidden">
                {[1, 2, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2 h-7 font-mono text-[10px] tracking-[0.18em] font-bold transition-colors ${
                      speed === s ? "text-accent" : "text-text-dim hover:text-text"
                    }`}
                    style={speed === s ? { background: "color-mix(in oklch, var(--color-accent) 20%, transparent)" } : {}}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] text-text-dim">
              <span>STEP · <span className="text-text tabular-nums">{playhead}</span></span>
              <span className="opacity-50">|</span>
              <span>{isComplete ? "COMPLETE" : playing ? "PLAYING" : "PAUSED"}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ReplayTraceRow({ event, idx, step }: { event: TraceEvent; idx: number; step: number }) {
  const meta = TRACE_KIND_META[event.kind] ?? { color: "#cdd2dd", label: event.kind.toUpperCase() };
  const status = idx < step - 1 ? "past" : idx === step - 1 ? "current" : "future";
  const opacity = status === "past" ? 0.45 : status === "future" ? 0.32 : 1;
  return (
    <div
      data-step={idx}
      className="relative grid gap-2 items-center py-2 px-3 transition-all"
      style={{
        gridTemplateColumns: "52px 18px 110px minmax(0, 1fr)",
        opacity,
        background: status === "current" ? "linear-gradient(90deg, color-mix(in oklch, var(--color-accent) 12%, transparent), transparent 70%)" : "transparent",
        borderLeft: status === "current" ? `3px solid var(--color-accent)` : "3px solid transparent",
      }}
    >
      <span className="font-mono text-[10px] tabular-nums text-text-dim">#{String(idx + 1).padStart(2, "0")}</span>
      <div className="relative flex justify-center">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: meta.color,
            boxShadow: status === "current" ? `0 0 12px ${meta.color}, 0 0 0 3px color-mix(in oklch, ${meta.color} 30%, transparent)` : `0 0 6px ${meta.color}80`,
            transform: status === "current" ? "scale(1.4)" : "scale(1)",
            transition: "transform 200ms, box-shadow 200ms",
          }}
        />
      </div>
      <span className="font-mono text-[10px] tracking-[0.14em] font-bold uppercase truncate" style={{ color: meta.color }}>
        {meta.label}
      </span>
      <span className="font-mono text-[11.5px] text-text leading-snug truncate min-w-0">
        {event.detail}
        {event.latency_ms ? <span className="ml-2 text-text-dim tabular-nums">· {Math.round(event.latency_ms)}ms</span> : null}
      </span>
    </div>
  );
}

interface SnapshotProps {
  playhead: number;
  current: TraceEvent | undefined;
  confidence: number;
  tokens: number;
  latency: number;
  cost: number;
  budget: number;
  rootCause?: string;
  findings: string[];
  findingsUnlocked: number;
  seenKinds: Set<string>;
  isComplete: boolean;
}

function SnapshotPanel({ current, confidence, tokens, latency, cost, budget, rootCause, findings, findingsUnlocked, seenKinds, isComplete }: Omit<SnapshotProps, "playhead">) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/60 p-3" style={{ background: "rgba(19, 22, 30, 0.4)" }}>
        <div className="font-mono uppercase font-medium text-text-mid mb-1" style={{ letterSpacing: "0.12em", fontSize: 11 }}>
          CURRENT EVENT
        </div>
        {current ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: TRACE_KIND_META[current.kind]?.color ?? "#cdd2dd" }}
              />
              <span
                className="font-mono text-[11px] tracking-[0.18em] font-bold uppercase"
                style={{ color: TRACE_KIND_META[current.kind]?.color ?? "#cdd2dd" }}
              >
                {current.kind}
              </span>
            </div>
            <div className="font-mono text-[11.5px] text-text leading-snug">{current.detail}</div>
          </div>
        ) : (
          <div className="font-mono text-[11px] text-text-dim">— awaiting first event —</div>
        )}
      </div>

      <div className="rounded-md border border-border/60 p-3 flex items-center gap-3" style={{ background: "rgba(19, 22, 30, 0.4)" }}>
        <MiniConfArc value={confidence} />
        <div className="flex-1 min-w-0">
          <div className="font-mono uppercase font-medium text-text-mid mb-0.5" style={{ letterSpacing: "0.12em", fontSize: 11 }}>
            CONFIDENCE
          </div>
          <div className="text-[22px] leading-none font-semibold text-text-strong tabular-nums">
            {Math.round(confidence * 100)}<span className="text-text-dim text-[12px] ml-0.5">%</span>
          </div>
          <div className="font-mono text-[10px] text-text-dim mt-0.5">{isComplete ? "investigation closed" : "building..."}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="LATENCY" value={`${(latency / 1000).toFixed(2)}s`} color="var(--color-info)" icon={<Timer size={10} />} />
        <Stat label="TOKENS" value={`${(tokens / 1000).toFixed(1)}k`} sub={`/ ${(budget / 1000) | 0}k`} color="var(--color-warning)" icon={<Cpu size={10} />} />
        <Stat label="COST" value={`$${cost.toFixed(4)}`} color="var(--color-success)" icon={<Coins size={10} />} />
      </div>

      <div className="rounded-md border border-border/60 p-3" style={{ background: "rgba(19, 22, 30, 0.4)" }}>
        <div className="font-mono uppercase font-medium text-text-mid mb-2" style={{ letterSpacing: "0.12em", fontSize: 11 }}>
          RECOVERY EVENTS UNLOCKED
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["chaos_inject", "ensemble_verify", "provider_fallback", "tool_substitute", "provider_restore"].map((k) => {
            const m = TRACE_KIND_META[k] ?? { color: "#cdd2dd" };
            const seen = seenKinds.has(k);
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-1.5 h-5 rounded font-mono text-[9px] tracking-[0.16em] font-bold"
                style={{
                  background: seen ? `color-mix(in oklch, ${m.color} 12%, transparent)` : "transparent",
                  border: `1px solid color-mix(in oklch, ${m.color} ${seen ? 40 : 18}%, transparent)`,
                  color: seen ? m.color : "var(--color-text-dim)",
                  opacity: seen ? 1 : 0.5,
                }}
              >
                <span className="w-1 h-1 rounded-full" style={{ background: seen ? m.color : "var(--color-text-dim)" }} />
                {k.replace("_", " ").toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>

      {findings.length > 0 && (
        <div className="rounded-md border border-border/60 p-3" style={{ background: "rgba(19, 22, 30, 0.4)" }}>
          <div className="font-mono uppercase font-medium text-text-mid mb-2" style={{ letterSpacing: "0.12em", fontSize: 11 }}>
            FINDINGS · {findingsUnlocked}/{findings.length}
          </div>
          <ul className="space-y-1.5">
            {findings.map((f, i) => {
              const unlocked = i < findingsUnlocked;
              return (
                <li key={i} className="flex items-start gap-2 text-[11.5px] leading-snug" style={{ opacity: unlocked ? 1 : 0.32 }}>
                  <span
                    className="mt-[6px] inline-block w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: unlocked ? "var(--color-accent)" : "var(--color-text-dim)" }}
                  />
                  <span className="text-text">{f}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isComplete && rootCause && (
        <div className="rounded-md border border-accent/40 p-3 land-in" style={{ background: "color-mix(in oklch, var(--color-accent) 5%, transparent)" }}>
          <div className="font-mono uppercase font-medium mb-1" style={{ letterSpacing: "0.12em", fontSize: 11, color: "var(--color-accent)" }}>
            ROOT CAUSE
          </div>
          <div className="text-[13px] text-text-strong font-medium leading-[1.4]">{rootCause}</div>
        </div>
      )}
    </div>
  );
}

function MiniConfArc({ value }: { value: number }) {
  const r = 22;
  const cx = 28;
  const cy = 28;
  const startA = 225;
  const sweep = 270;
  const toXY = (deg: number): [number, number] => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
  const [sx, sy] = toXY(startA);
  const [tex, tey] = toXY(((startA + sweep) % 360 + 360) % 360);
  const fillSweep = sweep * value;
  const fillEnd = (((startA + fillSweep) % 360) + 360) % 360;
  const [fex, fey] = toXY(fillEnd);
  const largeArc = fillSweep > 180 ? 1 : 0;
  const tier = value >= 0.8 ? "high" : value >= 0.5 ? "med" : "low";
  const g1 = tier === "high" ? "#10b981" : tier === "med" ? "#f59e0b" : "#ef4444";
  const g2 = tier === "high" ? "#6ee7b7" : tier === "med" ? "#fde68a" : "#fca5a5";
  const trackPath = `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${tex} ${tey}`;
  const fillPath = value > 0.005 ? `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${fex} ${fey}` : "";
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="flex-shrink-0">
      <defs>
        <linearGradient id={`mca-${tier}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={g1} />
          <stop offset="100%" stopColor={g2} />
        </linearGradient>
      </defs>
      <path d={trackPath} fill="none" stroke="#1d212c" strokeWidth="4" strokeLinecap="round" />
      {fillPath && <path d={fillPath} fill="none" stroke={`url(#mca-${tier})`} strokeWidth="4" strokeLinecap="round" />}
    </svg>
  );
}

function Stat({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 px-2.5 py-2" style={{ background: "rgba(19, 22, 30, 0.4)" }}>
      <div className="flex items-center gap-1 mb-0.5" style={{ color }}>
        {icon}
        <span className="font-mono uppercase font-medium" style={{ letterSpacing: "0.18em", fontSize: 9 }}>
          {label}
        </span>
      </div>
      <div className="text-[14px] font-semibold text-text-strong tabular-nums leading-[1.1]">{value}</div>
      {sub && <div className="font-mono text-[9.5px] text-text-dim tabular-nums">{sub}</div>}
    </div>
  );
}

function Scrubber({ total, playhead, onPlayhead }: { total: number; playhead: number; onPlayhead: (n: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const handleMove = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onPlayhead(Math.round(x * total));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    handleMove(e.clientX);
    const mv = (ev: MouseEvent) => handleMove(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };
  const pct = total > 0 ? playhead / total : 0;
  return (
    <div ref={trackRef} onMouseDown={onMouseDown} className="relative h-5 cursor-pointer select-none">
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full" style={{ background: "#1d212c" }} />
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full"
        style={{
          width: `${pct * 100}%`,
          background: "var(--color-accent)",
          boxShadow: "0 0 8px color-mix(in oklch, var(--color-accent) 60%, transparent)",
        }}
      />
      {Array.from({ length: Math.min(total, 40) }).map((_, i) => {
        const t = i / Math.max(1, total - 1);
        return (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-2"
            style={{ left: `${t * 100}%`, background: "color-mix(in oklch, var(--color-text-dim) 40%, transparent)" }}
          />
        );
      })}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full cursor-grab active:cursor-grabbing"
        style={{
          left: `${pct * 100}%`,
          background: "linear-gradient(180deg, color-mix(in oklch, var(--color-accent) 90%, white), var(--color-accent))",
          border: "1.5px solid white",
          boxShadow: "0 0 0 3px color-mix(in oklch, var(--color-accent) 30%, transparent), 0 4px 10px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}
