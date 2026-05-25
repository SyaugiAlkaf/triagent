/* ============================================================================
 * ChaosConsole — Track C
 * Drawer that slides in from the right. NOT a settings panel — a control
 * surface. Sections:
 *   - SCENARIOS  : trigger tiles
 *   - PROVIDERS  : LED-lit kill switches
 *   - TOOLS      : quarantine slots with hatched fills when armed
 *   - LATENCY    : slider with marked thresholds (0 / 5s / 8s brownout / 12s)
 *   - POISON     : ARM toggle for malformed JSON
 *
 * Wires directly to your api helpers — killProvider, restoreProvider,
 * killTool, restoreTool, setLatency, clearChaos, triggerScenario,
 * resetScenarios.
 * ========================================================================== */
import React, { useRef } from "react";
import {
  X, Sword, Bug, Skull, RotateCcw, Power, Layers, Timer, ChevronRight,
} from "lucide-react";
import { useStore } from "@/store/store";
import {
  killProvider, restoreProvider, killTool, restoreTool,
  setLatency, clearChaos, triggerScenario,
} from "@/lib/api";

const LATENCY_MARKS: { v: number; label: string; sub: string }[] = [
  { v: 0,     label: "0",   sub: "normal" },
  { v: 5000,  label: "5s",  sub: "slow" },
  { v: 8000,  label: "8s",  sub: "brownout" },
  { v: 12000, label: "12s", sub: "breakdown" },
];
const LATENCY_MAX = 12000;

type ScenarioDef = {
  slug: string;
  name: string;
  ns: string;
  sev: "P1" | "P2" | "P3";
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const SCENARIOS: ScenarioDef[] = [
  { slug: "01-crashloop", name: "CrashLoopBackOff", ns: "triagent-demo", sev: "P1", icon: RotateCcw },
  { slug: "02-oom",       name: "OOMKilled",        ns: "triagent-demo", sev: "P1", icon: Skull },
  { slug: "03-dns",       name: "CoreDNS Misconfig",ns: "triagent-demo", sev: "P2", icon: Power },
];

export interface ChaosConsoleProps {
  open: boolean;
  onClose: () => void;
}

export function ChaosConsole({ open, onClose }: ChaosConsoleProps) {
  const chaos = useStore(s => s.chaos);
  const providers = useStore(s => s.providers);
  const tools = useStore(s => s.tools);

  if (!open) return null;

  const totalInjections =
    chaos.killed_providers.length +
    chaos.killed_tools.length +
    (chaos.injected_latency_ms > 0 ? 1 : 0) +
    (chaos.poison_json ? 1 : 0);

  return (
    <aside
      className="triagent-drawer-in absolute top-3 right-3 bottom-3 w-[460px] z-40 rounded-xl flex flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(22,15,15,0.85), rgba(13,11,15,0.85))",
        backdropFilter: "blur(22px) saturate(1.2)",
        WebkitBackdropFilter: "blur(22px) saturate(1.2)",
        border: "1px solid rgba(248,113,113,0.30)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 40px -8px rgba(248,113,113,0.35), 0 28px 70px -20px rgba(0,0,0,0.8)",
      }}
    >
      <Header total={totalInjections} onClose={onClose} />

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <Section icon={Bug} title="SCENARIOS" sub="trigger a failure pattern">
          <div className="grid grid-cols-2 gap-1.5">
            {SCENARIOS.map(s => (
              <ScenarioTile key={s.slug} s={s} onTrigger={() => { triggerScenario(s.slug); onClose(); }} />
            ))}
          </div>
        </Section>

        <Section icon={Power} title="PROVIDERS" sub="circuit breakers · kill switch">
          <div className="flex flex-col gap-1.5">
            {providers.map(p => {
              const killed = chaos.killed_providers.includes(p);
              return (
                <KillSwitch
                  key={p}
                  label={p}
                  killed={killed}
                  onToggle={() => (killed ? restoreProvider(p) : killProvider(p))}
                />
              );
            })}
          </div>
        </Section>

        <Section icon={Layers} title="TOOLS" sub="quarantine bays" warn>
          <div className="grid grid-cols-3 gap-1.5">
            {tools.map(t => {
              const killed = chaos.killed_tools.includes(t);
              return (
                <QuarantineSlot
                  key={t}
                  label={t === "prometheus" ? "PROM" : t}
                  killed={killed}
                  onToggle={() => (killed ? restoreTool(t) : killTool(t))}
                />
              );
            })}
          </div>
        </Section>

        <section className="rounded-md border border-border/60 p-3 bg-[#13161e]/40">
          <LatencySlider value={chaos.injected_latency_ms} onChange={setLatency} />
        </section>

        {/* Poison JSON arm switch. Triagent doesn't expose this in api helpers
         * by name — if you have a togglePoisonJson(), call it here. */}
        <section className="rounded-md border border-border/60 p-2.5 bg-[#13161e]/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Led killed={chaos.poison_json} />
            <div>
              <div className="font-mono text-[11.5px] tracking-[0.18em] font-bold text-text-strong">POISON JSON</div>
              <div className="font-mono text-[10px] text-text-dim">inject malformed payloads</div>
            </div>
          </div>
          <button
            onClick={() => {
              // TODO(triagent): wire to your poison-json API helper.
              // Falling back to no-op so the prototype doesn't crash.
              console.info("[chaos] toggle poison json");
            }}
            className={`px-3 h-7 rounded font-mono text-[10px] tracking-[0.18em] font-bold transition
              ${chaos.poison_json ? "bg-danger text-white" : "border border-border-strong text-text hover:border-danger hover:text-danger"}`}
          >
            {chaos.poison_json ? "ARMED" : "ARM"}
          </button>
        </section>
      </div>

      <footer className="px-3 py-2 border-t border-border/60 flex items-center justify-between bg-[#0a0608]/60">
        <span className="font-mono text-[10px] tracking-[0.16em] text-text-dim">chaos-engine</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          <span className="font-mono text-[10px] tracking-[0.16em] text-warning font-bold">DESTRUCTIVE</span>
        </div>
      </footer>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

function Header({ total, onClose }: { total: number; onClose: () => void }) {
  return (
    <header className="relative px-4 py-3 border-b border-border/60 flex items-center justify-between"
            style={{ background: "linear-gradient(90deg, rgba(248,113,113,0.10), transparent 70%)" }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #fbbf24 0, #fbbf24 8px, #18181b 8px, #18181b 16px)" }} />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md grid place-items-center"
             style={{ background: "linear-gradient(135deg, #fb7185, #b91c1c)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 16px rgba(248,113,113,0.5)" }}>
          <Sword size={14} />
        </div>
        <div className="leading-[1.1]">
          <div className="font-mono text-[12px] tracking-[0.22em] font-bold text-text-strong">CHAOS CONSOLE</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-danger triagent-pulse-dot" style={{ boxShadow: "0 0 6px var(--color-danger)" }} />
            <span className="font-mono text-[9.5px] tracking-[0.22em] text-danger font-bold">{total} ACTIVE INJECTIONS</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => clearChaos()} className="font-mono text-[10px] tracking-[0.16em] font-bold text-danger hover:text-text-strong border border-danger/40 hover:border-danger px-2 h-7 rounded">
          CLEAR ALL
        </button>
        <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded text-text-dim hover:text-text hover:bg-white/[0.04]">
          <X size={13} />
        </button>
      </div>
    </header>
  );
}

function Section({ icon: Icon, title, sub, warn, children }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; sub: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={11} className={warn ? "text-warning" : "text-danger"} />
        <span className="font-mono text-[10.5px] tracking-[0.22em] font-bold text-text-strong">{title}</span>
        <span className="font-mono text-[10px] tracking-[0.16em] text-text-dim">· {sub}</span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      {children}
    </section>
  );
}

function ScenarioTile({ s, onTrigger }: { s: ScenarioDef; onTrigger: () => void }) {
  const Icon = s.icon;
  const sevColor = s.sev === "P1" ? "#f87171" : s.sev === "P2" ? "#fbbf24" : "#60a5fa";
  return (
    <button onClick={onTrigger}
      className="group relative text-left rounded-lg p-2.5 border border-border/60 hover:border-danger/50 transition-colors bg-[#13161e]/70 hover:bg-[#1a0f12]/70 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(45deg, #f87171, #f87171 1px, transparent 1px, transparent 7px)" }} />
      <div className="relative flex items-start gap-2">
        <div className="w-7 h-7 rounded-md grid place-items-center flex-shrink-0"
             style={{ background: `color-mix(in oklch, ${sevColor} 14%, transparent)`, color: sevColor, border: `1px solid color-mix(in oklch, ${sevColor} 28%, transparent)` }}>
          <Icon size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono text-[10px] tracking-[0.18em] font-bold tabular-nums" style={{ color: sevColor }}>{s.sev}</span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-text-dim truncate">{s.ns}</span>
          </div>
          <div className="text-[12.5px] font-medium text-text-strong leading-snug truncate">{s.name}</div>
        </div>
      </div>
      <div className="relative mt-2 flex items-center justify-end">
        <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.18em] font-bold text-danger opacity-0 group-hover:opacity-100 transition-opacity">
          TRIGGER <ChevronRight size={9} />
        </span>
      </div>
    </button>
  );
}

function Led({ killed, warn }: { killed: boolean; warn?: boolean }) {
  const c = warn ? "var(--color-warning)" : killed ? "var(--color-danger)" : "var(--color-success)";
  return (
    <span className="relative inline-block w-2 h-2 rounded-full" style={{ background: c }}>
      <span className="absolute inset-[-3px] rounded-full opacity-45 blur-[3px]" style={{ background: c }} />
    </span>
  );
}

function KillSwitch({ label, killed, onToggle }: { label: string; killed: boolean; onToggle: () => void }) {
  const c = "#f87171";
  return (
    <div className={`flex items-center justify-between px-2.5 py-2 rounded-md border transition
                     ${killed ? "border-danger/40 bg-danger/[0.04]" : "border-border/60 bg-[#13161e]/60 hover:bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Led killed={killed} />
        <div className="min-w-0">
          <div className="font-mono text-[11.5px] tracking-[0.18em] font-bold text-text-strong truncate">{label}</div>
          <div className="font-mono text-[10px] text-text-dim tabular-nums">{killed ? "KILLED" : "HEALTHY"}</div>
        </div>
      </div>
      <button onClick={onToggle} aria-pressed={killed}
        className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
        style={{
          background: killed ? `linear-gradient(180deg, ${c}, color-mix(in oklch, ${c} 60%, black))` : "#1d212c",
          border: `1px solid ${killed ? c : "#2e3344"}`,
          boxShadow: killed ? `0 0 12px ${c}66, inset 0 1px 0 rgba(255,255,255,0.15)` : "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}>
        <span className="absolute top-1/2 w-4 h-4 rounded-full transition-transform bg-text-strong"
              style={{
                left: "2px",
                transform: `translateY(-50%) translateX(${killed ? "20px" : "0px"})`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
              }} />
      </button>
    </div>
  );
}

function QuarantineSlot({ label, killed, onToggle }: { label: string; killed: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`relative h-[64px] rounded-md border-2 transition flex flex-col items-center justify-center gap-1 overflow-hidden
                  ${killed ? "border-warning/60 bg-warning/[0.06]" : "border-dashed border-border-strong/60 bg-[#0f1219]/60 hover:bg-white/[0.02] hover:border-warning/40"}`}>
      {killed && (
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(135deg, #fbbf24 0, #fbbf24 1px, transparent 1px, transparent 8px)" }} />
      )}
      <div className="relative flex items-center gap-1.5">
        <Led killed={false} warn={killed} />
        <span className="font-mono text-[10px] tracking-[0.2em] font-bold" style={{ color: killed ? "var(--color-warning)" : "var(--color-text)" }}>{label.toUpperCase()}</span>
      </div>
      <span className="relative font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: killed ? "var(--color-warning)" : "var(--color-text-dim)" }}>
        {killed ? "⚠ QUARANTINED" : "OPERATIONAL"}
      </span>
    </button>
  );
}

function LatencySlider({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (value / LATENCY_MAX) * 100;
  const handleMove = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChange(Math.round((x * LATENCY_MAX) / 100) * 100);
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
  const zoneColor = value <= 5000 ? "var(--color-info)" : value <= 8000 ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Timer size={11} className="text-warning" />
          <span className="font-mono uppercase font-medium" style={{ letterSpacing: "0.22em", fontSize: 10, color: "var(--color-text-strong)" }}>
            INJECTED LATENCY
          </span>
        </div>
        <div className="font-mono text-[10px] tabular-nums">
          <span className="font-bold text-text-strong">{(value / 1000).toFixed(1)}s</span>
          <span className="text-text-dim ml-1">/ 12s</span>
        </div>
      </div>
      <div ref={trackRef} onMouseDown={onMouseDown}
           className="relative h-7 rounded-full cursor-pointer mt-2"
           style={{ background: "#1d212c" }}>
        <div className="absolute inset-y-0 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0" style={{ width: "41.66%", background: "linear-gradient(90deg, rgba(96,165,250,0.18), rgba(96,165,250,0.30))" }} />
          <div className="absolute inset-y-0" style={{ left: "41.66%", width: "25%", background: "linear-gradient(90deg, rgba(251,191,36,0.18), rgba(251,191,36,0.30))" }} />
          <div className="absolute inset-y-0" style={{ left: "66.66%", right: "0", background: "linear-gradient(90deg, rgba(248,113,113,0.20), rgba(248,113,113,0.45))" }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded-full" style={{ width: `${pct}%`, background: zoneColor, boxShadow: `0 0 8px ${zoneColor}80` }} />
        {LATENCY_MARKS.map(m => (
          <div key={m.v} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-3"
               style={{ left: `${(m.v / LATENCY_MAX) * 100}%`, background: "rgba(245,247,251,0.3)" }} />
        ))}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full cursor-grab active:cursor-grabbing"
             style={{
               left: `${pct}%`,
               background: `linear-gradient(180deg, color-mix(in oklch, ${zoneColor} 90%, white), ${zoneColor})`,
               border: "1.5px solid white",
               boxShadow: `0 0 0 3px color-mix(in oklch, ${zoneColor} 30%, transparent), 0 4px 12px rgba(0,0,0,0.5)`,
             }} />
      </div>
      <div className="relative mt-2 h-7">
        {LATENCY_MARKS.map(m => {
          const active = value >= m.v - 100 && value <= m.v + 100;
          return (
            <div key={m.v} className="absolute -translate-x-1/2 text-center" style={{ left: `${(m.v / LATENCY_MAX) * 100}%` }}>
              <div className={`font-mono text-[10px] tracking-[0.16em] font-bold tabular-nums ${active ? "text-text-strong" : "text-text-dim"}`}>{m.label}</div>
              <div className="font-mono text-[9px] tracking-[0.16em] uppercase" style={{ color: active ? zoneColor : "var(--color-text-dim)" }}>{m.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChaosConsole;
