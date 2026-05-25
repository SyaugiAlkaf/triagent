/* ============================================================================
 * AlertInbox — Track A
 * Glass panel with tightened cards. Each card has a severity rail, namespace
 * color, summary, age, and an INVESTIGATE button that calls
 * startInvestigation(slug) from @/lib/api.
 *
 * Reads narrowly from the zustand store; selectors only depend on alerts +
 * activeIncidentSlug.
 * ========================================================================== */
import { useEffect } from "react";
import { AlertTriangle, Filter, Search, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useStore } from "@/store/store";
import { startInvestigation, listIncidents } from "@/lib/api";
import { timeAgo } from "./design-system";

export interface Alert {
  slug: string;
  name: string;
  namespace: string;
  severity?: "P1" | "P2";
  summary?: string;
  triggered_at?: number;
}

export function AlertInbox() {
  const alerts = useStore(s => s.alerts) as Alert[];
  const activeSlug = useStore(s => s.activeIncidentSlug) as string | null;
  const setActiveIncident = useStore(s => s.setActiveIncident);
  const resetTrace = useStore(s => s.resetTrace);
  const applyWsEvent = useStore(s => s.applyWsEvent);
  const inv = useStore(s => s.investigation);

  useEffect(() => {
    let cancelled = false;
    listIncidents()
      .then((rows) => {
        if (cancelled) return;
        for (const row of rows) {
          applyWsEvent({
            type: "alert",
            payload: {
              slug: row.slug,
              id: row.id,
              name: row.name,
              namespace: row.namespace,
              severity: row.slug.startsWith("01") || row.slug.startsWith("02") ? "P1" : "P2",
              summary: row.alert_summary,
              triggered_at: Date.now(),
            },
          } as never);
        }
      })
      .catch((err) => console.warn("listIncidents bootstrap failed", err));
    return () => {
      cancelled = true;
    };
  }, [applyWsEvent]);

  const handleInvestigate = async (slug: string) => {
    if (slug !== activeSlug) {
      resetTrace();
    }
    setActiveIncident(slug);
    if (inv && inv.status === 'running' && slug === activeSlug) {
      return;
    }
    try {
      await startInvestigation(slug);
    } catch (err) {
      console.warn('startInvestigation failed', err);
    }
  };

  return (
    <aside
      className="rounded-lg flex flex-col overflow-hidden h-full"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle size={11} className="text-danger" />
          <span
            className="font-mono uppercase font-medium"
            style={{ letterSpacing: "0.14em", fontSize: 11, color: "var(--color-text)" }}
          >
            ALERTS
          </span>
          <span className="font-mono text-[11px] text-text-dim tabular">· {alerts.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="w-6 h-6 rounded grid place-items-center text-text-dim hover:text-text hover:bg-white/[0.04]">
            <Filter size={11} />
          </button>
          <button className="w-6 h-6 rounded grid place-items-center text-text-dim hover:text-text hover:bg-white/[0.04]">
            <Search size={11} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
        {alerts.map((a) => (
          <AlertCard
            key={a.slug}
            alert={a}
            active={a.slug === activeSlug}
            verdictPct={a.slug === activeSlug && inv && inv.status === 'done' ? Math.round((inv.result?.confidence ?? 0) * 100) : null}
            running={a.slug === activeSlug && inv?.status === 'running'}
            onInvestigate={() => handleInvestigate(a.slug)}
          />
        ))}
      </div>

      <footer className="px-3 py-1.5 border-t border-border flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-text-dim">alertmanager-prod</span>
        <span className="font-mono text-[10.5px] text-text-dim">live</span>
      </footer>
    </aside>
  );
}

function AlertCard({
  alert,
  active,
  verdictPct,
  running,
  onInvestigate,
}: {
  alert: Alert;
  active: boolean;
  verdictPct: number | null;
  running: boolean;
  onInvestigate: () => void;
}) {
  const sevColor = alert.severity === "P1" ? "var(--color-danger)" : "var(--color-warning)";
  return (
    <div
      className="relative rounded-md pl-3 pr-2 py-2 cursor-pointer"
      style={{
        background: active ? "color-mix(in oklch, var(--color-accent) 8%, transparent)" : "transparent",
        border: `1px solid ${active ? "color-mix(in oklch, var(--color-accent) 40%, transparent)" : "transparent"}`,
      }}
      onClick={onInvestigate}
      title={alert.summary ?? alert.name}
    >
      {active && (
        <motion.div
          layoutId="alert-active-rail"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
          style={{ background: "var(--color-accent)" }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {!active && (
        <div
          className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r"
          style={{ background: sevColor, opacity: 0.7 }}
        />
      )}
      <div className="flex items-start gap-2">
        <span
          className="font-mono text-[10px] tracking-[0.16em] font-bold tabular-nums flex-shrink-0 mt-px"
          style={{ color: sevColor, minWidth: 20 }}
        >
          {alert.severity ?? "—"}
        </span>
        <span className="text-[12.5px] text-text-strong leading-snug font-medium flex-1 line-clamp-2 pr-1">
          {alert.name}
        </span>
        {!active && <ChevronRight size={11} className="text-text-dim flex-shrink-0 mt-1" />}
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-[28px]">
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-dim truncate flex-1">
          {alert.namespace}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-dim flex-shrink-0">
          {timeAgo(alert.triggered_at)}
        </span>
        {running && (
          <span className="inline-flex items-center gap-1 px-1.5 h-4 rounded font-mono text-[9px] tracking-[0.14em] font-bold flex-shrink-0"
            style={{ color: "var(--color-accent)", background: "color-mix(in oklch, var(--color-accent) 14%, transparent)" }}>
            <span className="w-1 h-1 rounded-full pulse-dot" style={{ background: "var(--color-accent)" }} />
            RUN
          </span>
        )}
        {verdictPct != null && (
          <span
            className="inline-flex items-center px-1.5 h-4 rounded font-mono text-[9.5px] tabular-nums font-bold flex-shrink-0"
            style={{
              color: verdictPct >= 80 ? "var(--color-success)" : verdictPct >= 50 ? "var(--color-warning)" : "var(--color-danger)",
              background: verdictPct >= 80
                ? "color-mix(in oklch, var(--color-success) 14%, transparent)"
                : verdictPct >= 50
                ? "color-mix(in oklch, var(--color-warning) 14%, transparent)"
                : "color-mix(in oklch, var(--color-danger) 14%, transparent)",
            }}
          >
            {verdictPct}%
          </span>
        )}
      </div>
    </div>
  );
}

export default AlertInbox;
