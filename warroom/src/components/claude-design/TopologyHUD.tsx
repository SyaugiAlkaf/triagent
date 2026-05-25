/* ============================================================================
 * TopologyHUD — Track D (revised for the wide bottom-strip layout)
 *
 * Slim overlay that sits on top of the topology canvas. Because the topology
 * is now a wide horizontal strip with labels baked onto the server boxes
 * themselves, the HUD only carries chrome:
 *   - top: TOPOLOGY status capsule (live / degraded / killed + edge flow
 *     summary), latency-injection badge, view label
 *   - bottom: horizontal LEGEND strip and a WS · LIVE + UTC clock card
 *
 * If you want floating per-node labels (e.g. when your R3F scene renders
 * un-labeled spheres), pass `showFloatingLabels` and we'll render them at
 * the percent positions given in `nodes`. Off by default.
 * ========================================================================== */
import React, { useMemo } from "react";
import { Radio, Clock4, Flame } from "lucide-react";
import { useStore } from "@/store/store";
import { LiveClock } from "./design-system";

export type TopologyNodeKind = "agent" | "gateway" | "engine" | "provider" | "tool";

export interface TopologyNode {
  /** Position in PERCENT of the topology pane (0..100). Match your R3F
   *  projected screen coords. */
  x: number;
  y: number;
  kind: TopologyNodeKind;
  color: string;
  /** Optional EWMA last-tick latency in ms (used in floating-label mode). */
  ewmaMs?: number;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  kind: "main" | "provider" | "tool" | "control";
  flow: "high" | "med" | "low" | "idle" | "killed";
  dashed?: boolean;
}

export interface TopologyHUDProps {
  nodes: Record<string, TopologyNode>;
  edges: TopologyEdge[];
  /** When true, render small floating tag-cards above each node. Off by default
   *  — assumes your R3F scene already draws labels (as ours does on the box
   *  top faces). */
  showFloatingLabels?: boolean;
  viewLabel?: string;
}

/* -------------------------------------------------------------------------- */

export function TopologyHUD({
  nodes,
  edges,
  showFloatingLabels = false,
  viewLabel = "ISOMETRIC · prod-cluster-1",
}: TopologyHUDProps) {
  const chaos = useStore(s => s.chaos);
  const wsStatus = useStore(s => s.wsStatus) as string;

  const edgeStates = useMemo(() => deriveEdgeStates(edges, chaos), [edges, chaos]);

  const flowCounts = useMemo(() => {
    const c: Record<string, number> = { high: 0, med: 0, low: 0, idle: 0, killed: 0 };
    edgeStates.forEach(e => (c[e.flow] = (c[e.flow] ?? 0) + 1));
    return c;
  }, [edgeStates]);

  const stats = useMemo(() => {
    let live = 0, killed = 0, degraded = 0;
    Object.keys(nodes).forEach(id => {
      const n = nodes[id];
      const k = chaos.killed_providers.includes(id) || chaos.killed_tools.includes(id);
      if (k) killed++;
      else if (n.kind === "provider" || n.kind === "tool") live++;
    });
    if (chaos.injected_latency_ms > 0) degraded += 2;
    return { live, degraded, killed };
  }, [nodes, chaos]);

  const hasChaos =
    chaos.killed_providers.length +
    chaos.killed_tools.length +
    (chaos.injected_latency_ms > 0 ? 1 : 0) > 0;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* TOP STRIP */}
      <div className="absolute top-2.5 left-3 right-3 flex items-center gap-2 pointer-events-auto">
        <div className="triagent-glass-faint rounded-md px-3 py-1.5 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Radio size={11} className="text-accent" />
            <Micro tone="text">TOPOLOGY</Micro>
          </div>
          <Bar />
          <div className="flex items-center gap-2.5 font-mono text-[10px] tabular-nums">
            <Stat dot="var(--color-success)" v={stats.live} label="LIVE" />
            <Stat dot="var(--color-warning)" v={stats.degraded} label="DGR" />
            <Stat dot="var(--color-danger)"  v={stats.killed}   label="KIL" />
          </div>
          <Bar />
          <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums text-text-dim">
            <Micro>EDGES</Micro>
            <span><span className="text-success font-bold">{flowCounts.high}</span> LIVE</span>
            <span><span className="text-info font-bold">{flowCounts.med}</span> WARM</span>
            {flowCounts.low > 0 && <span><span className="text-warning font-bold">{flowCounts.low}</span> LOW</span>}
            {flowCounts.killed > 0 && <span><span className="text-danger font-bold">{flowCounts.killed}</span> KIL</span>}
          </div>
        </div>

        {chaos.injected_latency_ms > 0 && (
          <div className="triagent-glass-faint rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
            <Clock4 size={11} className="text-warning" />
            <span className="font-mono text-[10px] tabular-nums font-bold text-warning">+{chaos.injected_latency_ms}ms</span>
            <Micro>INJ</Micro>
          </div>
        )}

        {hasChaos && (
          <div
            className="triagent-glass-faint rounded-md px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ borderColor: "rgba(248,113,113,0.32)", background: "rgba(60,12,12,0.5)" }}
          >
            <Flame size={11} className="text-danger" />
            <span className="font-mono text-[10px] tracking-[0.22em] font-bold text-danger">INCIDENT</span>
          </div>
        )}

        <div className="flex-1" />

        <div className="triagent-glass-faint rounded-md px-2.5 py-1.5 flex items-center gap-2">
          <Micro>VIEW</Micro>
          <span className="font-mono text-[10px] text-text">{viewLabel}</span>
        </div>
      </div>

      {/* OPTIONAL: floating per-node labels */}
      {showFloatingLabels && (
        <FloatingLabels nodes={nodes} chaos={chaos} />
      )}

      {/* BOTTOM STRIP */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-2 pointer-events-auto">
        <div className="triagent-glass-faint rounded-md px-3 py-1.5 flex items-center gap-4">
          <Micro>LEGEND</Micro>
          <Bar />
          <div className="flex items-center gap-3.5">
            {(
              [
                { kind: "agent" as const,    label: "AGENT",    color: "#a259ff" },
                { kind: "gateway" as const,  label: "GATEWAY",  color: "#cdd2dd" },
                { kind: "engine" as const,   label: "ENGINE",   color: "#60a5fa" },
                { kind: "provider" as const, label: "PROVIDER", color: "#34d399" },
                { kind: "tool" as const,     label: "TOOL",     color: "#cdd2dd" },
                { kind: "flow" as const,     label: "FLOW",     color: "#a259ff" },
              ]
            ).map(r => (
              <div key={r.label} className="flex items-center gap-1.5 min-w-0">
                <LegendGlyph kind={r.kind} color={r.color} />
                <span className="font-mono text-[10px] tracking-[0.18em] font-semibold text-text">{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="triagent-glass-faint rounded-md px-2.5 py-1.5 flex items-center gap-2">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span
              className="absolute inset-0 rounded-full triagent-pulse-dot"
              style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
            />
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] font-bold text-success">
            {(wsStatus ?? "live").toUpperCase()}
          </span>
          <Bar />
          <LiveClock />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FloatingLabels({
  nodes,
  chaos,
}: {
  nodes: Record<string, TopologyNode>;
  chaos: { killed_providers: string[]; killed_tools: string[] };
}) {
  return (
    <div className="absolute inset-0">
      {Object.entries(nodes).map(([id, n]) => {
        const killed = chaos.killed_providers.includes(id) || chaos.killed_tools.includes(id);
        const dxPx =
          n.kind === "tool" ? -16 :
          n.kind === "provider" ? 16 :
          n.kind === "engine" ? -10 : 0;
        const dyPx =
          n.kind === "agent" ? -54 :
          n.kind === "gateway" ? -32 :
          n.kind === "engine" ? -26 : 0;
        const transX =
          n.kind === "tool" ? "-100%" :
          n.kind === "provider" ? "0%" :
          "-50%";
        const color = killed ? "#f87171" : "#cdd2dd";
        const subColor = killed ? "#f87171" : "#6b7280";

        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              transform: `translate(calc(${transX} + ${dxPx}px), ${dyPx}px)`,
            }}
          >
            <div
              className="px-1.5 py-0.5 rounded-sm flex flex-col"
              style={{
                alignItems: n.kind === "tool" ? "flex-end" : n.kind === "provider" ? "flex-start" : "center",
                background: "rgba(7,8,12,0.72)",
                border: `1px solid color-mix(in oklch, ${killed ? "#f87171" : n.color} 22%, transparent)`,
              }}
            >
              <div className="font-mono text-[10px] tracking-[0.2em] font-bold uppercase leading-tight" style={{ color }}>
                {id}
              </div>
              <div className="font-mono text-[8.5px] tracking-[0.18em] uppercase leading-tight" style={{ color: subColor }}>
                {n.kind}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function deriveEdgeStates(
  edges: TopologyEdge[],
  chaos: { killed_providers: string[]; killed_tools: string[] },
): (TopologyEdge & { flow: "high" | "med" | "low" | "idle" | "killed" })[] {
  return edges.map(e => {
    const killed =
      chaos.killed_providers.includes(e.to) ||
      chaos.killed_providers.includes(e.from) ||
      chaos.killed_tools.includes(e.to);
    if (killed) return { ...e, flow: "killed" };
    if (chaos.killed_providers.includes("tf-primary") && e.to === "tf-verify") return { ...e, flow: "high" };
    if (chaos.killed_providers.includes("tf-verify") && e.to === "tf-tertiary") return { ...e, flow: "high" };
    return e;
  });
}

function LegendGlyph({ kind, color = "#cdd2dd" }: { kind: TopologyNodeKind | "flow"; color?: string }) {
  if (kind === "agent")    return <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke={color} strokeWidth="1.5"/><circle cx="7" cy="7" r="1.6" fill={color}/></svg>;
  if (kind === "gateway")  return <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="3.5" width="10" height="7" rx="1.5" fill="none" stroke={color} strokeWidth="1.5"/><line x1="4" y1="7" x2="10" y2="7" stroke={color} strokeWidth="1.5"/></svg>;
  if (kind === "engine")   return <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="7,2 12,11 2,11" fill="none" stroke={color} strokeWidth="1.5"/><circle cx="7" cy="8.5" r="1.2" fill={color}/></svg>;
  if (kind === "provider") return <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4.5" fill="none" stroke={color} strokeWidth="1.5"/><circle cx="7" cy="7" r="1.6" fill={color}/></svg>;
  if (kind === "tool")     return <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.5" y="2.5" width="9" height="9" rx="1" fill="none" stroke={color} strokeWidth="1.5"/><rect x="5.4" y="5.4" width="3.2" height="3.2" fill={color}/></svg>;
  if (kind === "flow")     return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="7" x2="13" y2="7" stroke={color} strokeWidth="1.6" strokeDasharray="2.4 2.6" className="triagent-flow"/></svg>;
  return null;
}

function Micro({ children, tone }: { children: React.ReactNode; tone?: "dim" | "text" }) {
  const color = tone === "text" ? "var(--color-text)" : "var(--color-text-dim)";
  return (
    <span className="font-mono uppercase font-medium" style={{ letterSpacing: "0.18em", fontSize: 10, color }}>
      {children}
    </span>
  );
}

function Bar() {
  return <div className="h-3 w-px bg-border" />;
}

function Stat({ dot, v, label }: { dot: string; v: number; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-1.5 h-1.5 rounded-full triagent-pulse-dot" style={{ background: dot }} />
      <span className="text-text-strong font-bold">{v}</span>
      <span className="text-text-dim">{label}</span>
    </span>
  );
}

export default TopologyHUD;
