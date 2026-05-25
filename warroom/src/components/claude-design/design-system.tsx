/* ============================================================================
 * Triagent — shared design tokens, keyframes, and small primitives used by all
 * claude-design components. Drop this once into your tree and import from each
 * component, OR copy the keyframes block into your globals.css and ditch this.
 * ========================================================================== */
import React from "react";

/* Per-provider color palette. Add new providers here. */
export const PROVIDER_META: Record<string, { color: string; label: string; sublabel?: string }> = {
  "tf-primary":  { color: "#a259ff", label: "TF · GROQ",       sublabel: "llama-3.3-70b" },
  "tf-verify":   { color: "#a259ff", label: "TF · GEMINI",     sublabel: "gemma-4-31b" },
  "tf-tertiary": { color: "#a259ff", label: "TF · OPENROUTER", sublabel: "arcee-trinity" },
  ollama:        { color: "#60a5fa", label: "OLLAMA",               sublabel: "direct · last-ditch" },
  truefoundry:   { color: "#a259ff", label: "TRUEFOUNDRY",          sublabel: "gateway" },
  groq:          { color: "#34d399", label: "GROQ" },
  mock:          { color: "#6b7280", label: "MOCK" },
};

/* Namespace color palette — used by AlertInbox + topology. */
export const NS_PALETTE: Record<string, string> = {
  "triagent-demo":  "#a259ff",
  "payments-prod":  "#a259ff",
  "orders-prod":    "#60a5fa",
  "checkout-prod":  "#34d399",
  "identity-prod":  "#fbbf24",
};

export const TRACE_KIND_META: Record<string, { color: string; label: string; recovery?: boolean }> = {
  plan:              { color: "#60a5fa", label: "PLAN" },
  tool_call:         { color: "#60a5fa", label: "TOOL" },
  provider_call:     { color: "#9aa0ad", label: "LLM" },
  tool_substitute:   { color: "#a259ff", label: "SUBST",    recovery: true },
  provider_fallback: { color: "#a259ff", label: "FAILOVER", recovery: true },
  tool_quarantine:   { color: "#fbbf24", label: "QUARANT" },
  provider_error:    { color: "#fbbf24", label: "ERROR" },
  provider_skip:     { color: "#fbbf24", label: "SKIP" },
  chaos_inject:      { color: "#f87171", label: "CHAOS" },
  tool_unavailable:  { color: "#f87171", label: "UNAVAIL" },
  budget_exceeded:   { color: "#f87171", label: "BUDGET" },
  provider_restore:  { color: "#34d399", label: "RESTORE",  recovery: true },
  ensemble_verify:   { color: "#34d399", label: "VERIFY",   recovery: true },
  ensemble_degraded: { color: "#fbbf24", label: "DEGRADED" },
};

export function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/** Live UTC clock — re-renders every second. */
export function LiveClock(): React.ReactElement {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return <span className="font-mono text-[10px] tabular-nums text-text-dim">{hh}:{mm}:{ss} UTC</span>;
}

/** Compact mono uppercase label used throughout. */
export function MicroLabel({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`font-mono uppercase font-medium ${className}`}
      style={{ letterSpacing: "0.18em", fontSize: 10, color: "var(--color-text-dim)", ...style }}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Keyframes — once per app. Mount <DesignSystemStyles/> at the root of the war
 * room (or inline these into globals.css and delete this component).
 * -------------------------------------------------------------------------- */
export function DesignSystemStyles(): React.ReactElement {
  return (
    <style>{`
      @keyframes triagent-pulseDot { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
      .triagent-pulse-dot { animation: triagent-pulseDot 2s ease-in-out infinite }

      @keyframes triagent-pulseSoft { 0%,100% { opacity: .85; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
      .triagent-pulse-soft { animation: triagent-pulseSoft 2.4s ease-in-out infinite; transform-origin: center; transform-box: fill-box }

      @keyframes triagent-nodeAlarm { 0%,100% { transform: scale(1) } 50% { transform: scale(1.1) } }
      .triagent-node-alarm { animation: triagent-nodeAlarm 0.7s ease-in-out infinite; transform-origin: center; transform-box: fill-box }

      @keyframes triagent-dash { to { stroke-dashoffset: -240 } }
      .triagent-flow       { animation: triagent-dash 6s linear infinite }
      .triagent-flow-fast  { animation: triagent-dash 2.2s linear infinite }
      .triagent-flow-slow  { animation: triagent-dash 14s linear infinite }
      .triagent-flow-killed{ animation: triagent-dash 1.2s linear infinite }

      @keyframes triagent-fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
      .triagent-fade-up { animation: triagent-fadeUp 360ms cubic-bezier(.2,.7,.2,1) both }

      @keyframes triagent-traceIn { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: translateX(0) } }
      .triagent-trace-in { animation: triagent-traceIn 320ms cubic-bezier(.2,.7,.2,1) both }

      @keyframes triagent-landIn {
        0%   { opacity: 0; transform: translateY(14px) scale(.985); filter: blur(2px) }
        60%  { opacity: 1; filter: blur(0) }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) }
      }
      .triagent-land-in { animation: triagent-landIn 520ms cubic-bezier(.2,.7,.2,1) both }

      @keyframes triagent-scan { 0% { background-position: 0 -100% } 100% { background-position: 0 100% } }
      .triagent-scan {
        background-image: linear-gradient(180deg, transparent, rgba(162,89,255,.06) 50%, transparent);
        background-size: 100% 200%;
        animation: triagent-scan 4.5s linear infinite;
      }

      @keyframes triagent-drawerIn { from { opacity: 0; transform: translateX(40px) } to { opacity: 1; transform: translateX(0) } }
      .triagent-drawer-in { animation: triagent-drawerIn 320ms cubic-bezier(.2,.7,.2,1) both }

      @keyframes triagent-redSweep {
        0%   { opacity: 0; transform: scale(.4) }
        20%  { opacity: 1 }
        100% { opacity: 0; transform: scale(2.4) }
      }
      .triagent-red-sweep { animation: triagent-redSweep 1.6s ease-out both; transform-origin: center; transform-box: fill-box }

      .triagent-glass {
        background: linear-gradient(180deg, rgba(22,25,34,.7), rgba(17,19,26,.6));
        backdrop-filter: blur(18px) saturate(1.2);
        -webkit-backdrop-filter: blur(18px) saturate(1.2);
        border: 1px solid rgba(46,51,68,.7);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04), inset 0 0 0 1px rgba(162,89,255,.05), 0 20px 60px -20px rgba(0,0,0,.7);
      }
      .triagent-glass-faint {
        background: linear-gradient(180deg, rgba(17,19,26,.55), rgba(10,11,15,.45));
        backdrop-filter: blur(14px) saturate(1.15);
        -webkit-backdrop-filter: blur(14px) saturate(1.15);
        border: 1px solid rgba(35,39,51,.6);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
      }
    `}</style>
  );
}
