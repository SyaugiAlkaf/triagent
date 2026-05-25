import { useState } from "react";
import { useStore } from "@/store/store";

const TILE = 200;
const ISO_COS = 0.866;
const ISO_SIN = 0.18;
const HALF_FOOT = 0.34;
const BOX_H = 56;
const ORIGIN_X = 615;
const ORIGIN_Y = 110;

type GroupRender = "rack" | "stack" | "pair" | "cloud";

interface Group {
  gx: number;
  gz: number;
  render: GroupRender;
  color: string;
  label: string;
  sub: string;
  members: string[];
  items?: { id: string; label: string }[];
}

const iso = (gx: number, gz: number, h = 0) => ({
  x: ORIGIN_X + (gx - gz) * TILE * ISO_COS,
  y: ORIGIN_Y + (gx + gz) * TILE * ISO_SIN - h,
});

const GROUP_BASE = "#6b7484";
const GROUP_ACCENT = "var(--color-accent)";

const GROUPS: Record<string, Group> = {
  k8s: {
    gx: 0,
    gz: 0,
    render: "stack",
    color: GROUP_BASE,
    label: "K8S",
    sub: "kubectl · 3 nodes",
    members: ["kubectl"],
    items: [
      { id: "kubectl-n1", label: "NODE-1" },
      { id: "kubectl-n2", label: "NODE-2" },
      { id: "kubectl-n3", label: "NODE-3" },
    ],
  },
  observability: {
    gx: 0,
    gz: 2,
    render: "pair",
    color: GROUP_BASE,
    label: "OBSERV",
    sub: "prom · loki",
    members: ["prometheus", "loki"],
    items: [
      { id: "prometheus", label: "PROM" },
      { id: "loki", label: "LOKI" },
    ],
  },
  core: {
    gx: 2,
    gz: 0,
    render: "stack",
    color: GROUP_ACCENT,
    label: "CORE",
    sub: "agent · engine",
    members: ["agent", "engine"],
    items: [
      { id: "agent", label: "AGENT" },
      { id: "engine", label: "ENGINE" },
    ],
  },
  gateway: {
    gx: 2,
    gz: 2,
    render: "rack",
    color: GROUP_BASE,
    label: "TF GATEWAY",
    sub: "gateway.truefoundry.ai",
    members: ["tf-gateway"],
  },
  "tf-primary": {
    gx: 4,
    gz: 0,
    render: "cloud",
    color: GROUP_BASE,
    label: "TF·GROQ",
    sub: "cloud · llama-3.3-70b",
    members: ["tf-primary"],
  },
  "tf-verify": {
    gx: 4,
    gz: 1,
    render: "cloud",
    color: GROUP_BASE,
    label: "TF·GEMINI",
    sub: "cloud · gemma-4-31b",
    members: ["tf-verify"],
  },
  "tf-tertiary": {
    gx: 4,
    gz: 2,
    render: "cloud",
    color: GROUP_BASE,
    label: "TF·OPENROUTER",
    sub: "cloud · arcee-trinity",
    members: ["tf-tertiary"],
  },
  ollama: {
    gx: 5.2,
    gz: 1,
    render: "rack",
    color: GROUP_BASE,
    label: "OLLAMA",
    sub: "onprem · last-ditch",
    members: ["ollama"],
  },
  mock: {
    gx: 5.2,
    gz: 2,
    render: "rack",
    color: GROUP_BASE,
    label: "MOCK",
    sub: "cache · sha256 replay",
    members: ["mock"],
  },
};

interface Edge {
  id: string;
  from: string;
  to: string;
  kind: "main" | "tool" | "provider" | "lastditch";
  flow: "high" | "med" | "low" | "killed";
}

const GROUP_EDGES: Edge[] = [
  { id: "core-gw", from: "core", to: "gateway", kind: "main", flow: "high" },
  { id: "core-k8s", from: "core", to: "k8s", kind: "tool", flow: "high" },
  { id: "core-obs", from: "core", to: "observability", kind: "tool", flow: "med" },
  { id: "gw-tfp", from: "gateway", to: "tf-primary", kind: "provider", flow: "high" },
  { id: "gw-tfv", from: "gateway", to: "tf-verify", kind: "provider", flow: "med" },
  { id: "gw-tft", from: "gateway", to: "tf-tertiary", kind: "provider", flow: "low" },
  { id: "core-oll", from: "core", to: "ollama", kind: "lastditch", flow: "low" },
  { id: "core-mock", from: "core", to: "mock", kind: "lastditch", flow: "low" },
];

interface ChaosState {
  killed_providers: string[];
  killed_tools: string[];
  injected_latency_ms: number;
}

function groupKilled(group: Group, chaos: ChaosState): boolean {
  return group.members.some(
    (m) => chaos.killed_providers.includes(m) || chaos.killed_tools.includes(m)
  );
}

function deriveEdges({ chaos, hover }: { chaos: ChaosState; hover: string | null }) {
  return GROUP_EDGES.map((e) => {
    const fromKilled = groupKilled(GROUPS[e.from], chaos);
    const toKilled = groupKilled(GROUPS[e.to], chaos);
    const killed = fromKilled || toKilled;
    let flow: Edge["flow"] = e.flow;
    if (chaos.killed_providers.includes("tf-primary") && e.to === "tf-verify") flow = "high";
    if (chaos.killed_providers.includes("tf-verify") && e.to === "tf-tertiary") flow = "high";
    if (killed) flow = "killed";
    const highlighted = hover === e.from || hover === e.to;
    return { ...e, killed, flow, highlighted };
  });
}

interface ServerLayerProps {
  gx: number;
  gz: number;
  halfX: number;
  halfZ: number;
  lift: number;
  h: number;
  stripeColor: string;
  killed: boolean;
  label?: string;
  withLed?: boolean;
}

function ServerLayer({
  gx,
  gz,
  halfX,
  halfZ,
  lift,
  h,
  stripeColor,
  killed,
  label,
  withLed = true,
}: ServerLayerProps) {
  const fbl = iso(gx - halfX, gz + halfZ, lift);
  const fbr = iso(gx + halfX, gz + halfZ, lift);
  const bbr = iso(gx + halfX, gz - halfZ, lift);
  const ftl = iso(gx - halfX, gz + halfZ, lift + h);
  const ftr = iso(gx + halfX, gz + halfZ, lift + h);
  const btr = iso(gx + halfX, gz - halfZ, lift + h);
  const btl = iso(gx - halfX, gz - halfZ, lift + h);
  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  const topColor = killed ? "#2a1419" : "#1c1f2a";
  const frontColor = killed ? "#1d0d10" : "#14171f";
  const rightColor = killed ? "#160a0c" : "#0e1118";
  const cStripe = killed ? "#f87171" : stripeColor;

  const ledX = ftr.x - 12;
  const ledY = ftr.y + 12;
  const labelCenter = iso(gx, gz, lift + h);

  return (
    <g>
      <path d={path([bbr, btr, ftr, fbr])} fill={rightColor} stroke="#06070a" strokeWidth="1" />
      <path d={path([fbl, ftl, ftr, fbr])} fill={frontColor} stroke="#06070a" strokeWidth="1" />
      <path d={path([btl, btr, ftr, ftl])} fill={topColor} stroke="#06070a" strokeWidth="1" />
      <line
        x1={ftl.x}
        y1={ftl.y}
        x2={ftr.x}
        y2={ftr.y}
        stroke={cStripe}
        strokeWidth="2.5"
        opacity={killed ? 1 : 0.85}
        style={{ filter: `drop-shadow(0 0 4px ${cStripe})` }}
      />
      {[1, 2, 3].map((i) => {
        const t = i / 4;
        const fx1 = fbl.x * (1 - t) + ftl.x * t;
        const fy1 = fbl.y * (1 - t) + ftl.y * t;
        const fx2 = fbr.x * (1 - t) + ftr.x * t;
        const fy2 = fbr.y * (1 - t) + ftr.y * t;
        return (
          <line key={i} x1={fx1} y1={fy1} x2={fx2} y2={fy2} stroke="#06070a" strokeWidth="0.5" opacity="0.6" />
        );
      })}
      {withLed && (
        <g>
          <circle cx={ledX} cy={ledY} r="4" fill={cStripe} opacity="0.32" filter="url(#boxBlur)" />
          <circle cx={ledX} cy={ledY} r="2" fill={cStripe} className={killed ? "pulse-soft" : "pulse-soft"} />
        </g>
      )}
      {label && (
        <text
          x={labelCenter.x}
          y={labelCenter.y + 2}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          fontWeight="700"
          letterSpacing="1.6"
          fill={killed ? "#f87171" : "#e5e7eb"}
          style={{ textTransform: "uppercase" }}
        >
          {label}
        </text>
      )}
      {killed && (
        <g>
          <line x1={fbl.x} y1={fbl.y} x2={btr.x} y2={btr.y} stroke="#f87171" strokeWidth="1.5" opacity="0.85" />
          <line x1={fbr.x} y1={fbr.y} x2={btl.x} y2={btl.y} stroke="#f87171" strokeWidth="1.5" opacity="0.85" />
        </g>
      )}
    </g>
  );
}

function ServerRack({ group, killed }: { group: Group; killed: boolean }) {
  return (
    <ServerLayer
      gx={group.gx}
      gz={group.gz}
      halfX={HALF_FOOT}
      halfZ={HALF_FOOT}
      lift={0}
      h={BOX_H}
      stripeColor={group.color}
      killed={killed}
    />
  );
}

function ServerStack({ group, chaos }: { group: Group; chaos: ChaosState }) {
  const count = group.items?.length ?? 3;
  const UNIT = count === 3 ? 18 : 22;
  const GAP = 3;
  return (
    <g>
      {(group.items ?? []).map((it, idx) => {
        const lift = idx * (UNIT + GAP);
        const killed =
          group.members.includes(it.id) &&
          (chaos.killed_providers.includes(it.id) || chaos.killed_tools.includes(it.id));
        return (
          <ServerLayer
            key={it.id}
            gx={group.gx}
            gz={group.gz}
            halfX={HALF_FOOT}
            halfZ={HALF_FOOT}
            lift={lift}
            h={UNIT}
            stripeColor={group.color}
            killed={killed || groupKilled(group, chaos)}
            label={it.label}
          />
        );
      })}
    </g>
  );
}

function ServerPair({ group, chaos }: { group: Group; chaos: ChaosState }) {
  const halfX = HALF_FOOT * 0.46;
  const sep = HALF_FOOT * 0.55;
  return (
    <g>
      {(group.items ?? []).map((it, idx) => {
        const dx = idx === 0 ? -sep : sep;
        const memKilled =
          chaos.killed_providers.includes(it.id) || chaos.killed_tools.includes(it.id);
        return (
          <ServerLayer
            key={it.id}
            gx={group.gx + dx}
            gz={group.gz}
            halfX={halfX}
            halfZ={HALF_FOOT}
            lift={0}
            h={BOX_H}
            stripeColor={group.color}
            killed={memKilled}
            label={it.label}
          />
        );
      })}
    </g>
  );
}

function CloudGroup({ group, killed }: { group: Group; killed: boolean }) {
  const c = killed ? "#f87171" : group.color;
  const center = iso(group.gx, group.gz, 36);
  const floor = iso(group.gx, group.gz);
  const cx = center.x;
  const cy = center.y;
  return (
    <g>
      <ellipse
        cx={floor.x}
        cy={floor.y + 4}
        rx={TILE * HALF_FOOT * ISO_COS * 2.4}
        ry={TILE * HALF_FOOT * ISO_SIN * 2.6}
        fill="black"
        opacity={killed ? 0.55 : 0.42}
      />
      {!killed && (
        <ellipse
          cx={floor.x}
          cy={floor.y + 2}
          rx={TILE * HALF_FOOT * ISO_COS * 2.5}
          ry={TILE * HALF_FOOT * ISO_SIN * 2.8}
          fill={`color-mix(in oklch, ${c} 60%, transparent)`}
          opacity="0.22"
          filter="url(#boxBlur)"
        />
      )}
      <g>
        <circle cx={cx - 32} cy={cy + 4} r={17} fill="#0e1118" stroke={c} strokeWidth="1.5" opacity="0.96" />
        <circle cx={cx - 6} cy={cy - 8} r={22} fill="#10131c" stroke={c} strokeWidth="1.5" opacity="0.96" />
        <circle cx={cx + 22} cy={cy - 2} r={20} fill="#0e1118" stroke={c} strokeWidth="1.5" opacity="0.96" />
        <ellipse cx={cx} cy={cy + 12} rx={54} ry={14} fill="#11141d" stroke={c} strokeWidth="1.5" opacity="0.96" />
      </g>
      {killed && (
        <g>
          <line x1={cx - 46} y1={cy - 14} x2={cx + 46} y2={cy + 22} stroke="#f87171" strokeWidth="2" opacity="0.85" />
          <line x1={cx + 46} y1={cy - 14} x2={cx - 46} y2={cy + 22} stroke="#f87171" strokeWidth="2" opacity="0.85" />
        </g>
      )}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="11"
        fontWeight="700"
        letterSpacing="1.8"
        fill={c}
        style={{ textTransform: "uppercase", textShadow: `0 0 6px ${c}` }}
      >
        {group.label}
      </text>
      <text
        x={cx}
        y={cy + 13}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="8"
        fontWeight="500"
        letterSpacing="1.4"
        fill={killed ? "#f87171" : "#6b7280"}
        style={{ textTransform: "uppercase" }}
      >
        {group.sub}
      </text>
    </g>
  );
}

function GroupLabel({ group, killed }: { group: Group; killed: boolean }) {
  if (group.render === "cloud") return null;
  const c = killed ? "#f87171" : group.color;
  const yOff =
    group.render === "stack"
      ? (group.items?.length ?? 1) * 21 + 14
      : BOX_H + 14;
  const top = iso(group.gx, group.gz, yOff);
  return (
    <g>
      <text
        x={top.x}
        y={top.y}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="12"
        fontWeight="700"
        letterSpacing="2.2"
        fill={c}
        style={{ textTransform: "uppercase", textShadow: `0 0 6px ${c}` }}
      >
        {group.label}
      </text>
      <text
        x={top.x}
        y={top.y + 13}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="8"
        fontWeight="500"
        letterSpacing="1.4"
        fill={killed ? "#f87171" : "#6b7280"}
        style={{ textTransform: "uppercase" }}
      >
        {group.sub}
      </text>
    </g>
  );
}

function GroupBase({ group, killed, focused }: { group: Group; killed: boolean; focused: boolean }) {
  if (group.render === "cloud") return null;
  const c = group.color;
  const base = iso(group.gx, group.gz);
  return (
    <g>
      <ellipse
        cx={base.x}
        cy={base.y + 5}
        rx={TILE * HALF_FOOT * ISO_COS * 2.2}
        ry={TILE * HALF_FOOT * ISO_SIN * 2.6}
        fill="black"
        opacity={focused ? 0.55 : 0.42}
      />
      {!killed && (
        <ellipse
          cx={base.x}
          cy={base.y + 2}
          rx={TILE * HALF_FOOT * ISO_COS * 2.3}
          ry={TILE * HALF_FOOT * ISO_SIN * 2.8}
          fill={`color-mix(in oklch, ${c} 60%, transparent)`}
          opacity={focused ? 0.45 : 0.24}
          filter="url(#boxBlur)"
        />
      )}
    </g>
  );
}

function GroupRenderEl({
  id,
  group,
  chaos,
  focused,
  dimmed,
  onHover,
}: {
  id: string;
  group: Group;
  chaos: ChaosState;
  focused: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
}) {
  const killed = groupKilled(group, chaos);
  const opacity = dimmed ? 0.32 : 1;
  return (
    <g
      style={{ cursor: "pointer", transition: "opacity 200ms" }}
      opacity={opacity}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <GroupBase group={group} killed={killed} focused={focused} />
      {group.render === "rack" && <ServerRack group={group} killed={killed} />}
      {group.render === "stack" && <ServerStack group={group} chaos={chaos} />}
      {group.render === "pair" && <ServerPair group={group} chaos={chaos} />}
      {group.render === "cloud" && <CloudGroup group={group} killed={killed} />}
      <GroupLabel group={group} killed={killed} />
    </g>
  );
}

function FloorGrid() {
  const lines = [] as React.ReactElement[];
  const minGx = -0.6;
  const maxGx = 5.8;
  const minGz = -0.6;
  const maxGz = 2.6;
  for (let gz = minGz; gz <= maxGz + 0.01; gz += 1) {
    const a = iso(minGx, gz);
    const b = iso(maxGx, gz);
    lines.push(
      <line key={`gz-${gz}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
    );
  }
  for (let gx = minGx; gx <= maxGx + 0.01; gx += 1) {
    const a = iso(gx, minGz);
    const b = iso(gx, maxGz);
    lines.push(
      <line key={`gx-${gx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
    );
  }
  return <g>{lines}</g>;
}

function GroupEdgeEl({
  edge,
  dimmed,
}: {
  edge: ReturnType<typeof deriveEdges>[number];
  dimmed: boolean;
}) {
  const a = GROUPS[edge.from];
  const b = GROUPS[edge.to];
  if (!a || !b) return null;
  const aLift = a.render === "cloud" ? 36 : a.render === "stack" ? (a.items?.length ?? 1) * 22 - 8 : 30;
  const bLift = b.render === "cloud" ? 36 : b.render === "stack" ? (b.items?.length ?? 1) * 22 - 8 : 30;
  const A = iso(a.gx, a.gz, aLift);
  const B = iso(b.gx, b.gz, bLift);
  const midGx = (a.gx + b.gx) / 2;
  const M = iso(midGx, a.gz, aLift);
  const N = iso(midGx, b.gz, bLift);
  const d = `M ${A.x.toFixed(1)} ${A.y.toFixed(1)} L ${M.x.toFixed(1)} ${M.y.toFixed(1)} L ${N.x.toFixed(1)} ${N.y.toFixed(1)} L ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;

  const toColor = GROUPS[edge.to].color;
  const baseColor = edge.killed ? "#f87171" : toColor;
  const flowColor = edge.killed ? "#f87171" : toColor;

  const dashCls =
    edge.killed ? "flow-killed" : edge.flow === "high" ? "flow-fast" : edge.flow === "med" ? "flow" : "flow-slow";

  const baseOpacity = dimmed ? 0.25 : edge.highlighted ? 0.9 : 0.55;
  const flowOpacity = edge.highlighted ? 1 : edge.flow === "low" ? 0.55 : edge.flow === "med" ? 0.78 : 0.95;
  const lineWidth = edge.highlighted ? 3 : edge.kind === "main" ? 2.6 : 2.2;

  return (
    <g opacity={dimmed ? 0.65 : 1} style={{ transition: "opacity 200ms" }}>
      <path
        d={d}
        stroke={baseColor}
        strokeWidth={edge.highlighted ? 9 : 6}
        opacity={edge.killed ? 0.45 : edge.highlighted ? 0.32 : 0.18}
        fill="none"
        filter="url(#edgeBlur)"
      />
      <path d={d} stroke={baseColor} strokeWidth="1.8" opacity={baseOpacity} fill="none" />
      <path
        d={d}
        stroke={flowColor}
        strokeWidth={lineWidth}
        fill="none"
        strokeDasharray="4 18"
        strokeLinecap="round"
        className={dashCls}
        opacity={flowOpacity}
      />
    </g>
  );
}

export function TopologyScene() {
  const chaos = useStore((s) => s.chaos);
  const [hover, setHover] = useState<string | null>(null);
  const edges = deriveEdges({ chaos, hover });

  const ordered = Object.entries(GROUPS).sort(
    ([, a], [, b]) => a.gx + a.gz - (b.gx + b.gz)
  );

  return (
    <svg viewBox="0 0 1900 380" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full" style={{ display: "block" }}>
      <defs>
        <filter id="boxBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="edgeBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.025)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1900" height="380" fill="url(#floorFade)" />
      <FloorGrid />

      <g>
        {edges.map((e) => (
          <GroupEdgeEl key={e.id} edge={e} dimmed={hover != null && !e.highlighted} />
        ))}
      </g>

      {ordered.map(([id, group]) => (
        <GroupRenderEl
          key={id}
          id={id}
          group={group}
          chaos={chaos}
          focused={hover === id}
          dimmed={hover != null && hover !== id}
          onHover={setHover}
        />
      ))}

      {chaos.killed_providers.length + chaos.killed_tools.length > 0 && (
        <ellipse
          cx={iso(2, 1).x}
          cy={iso(2, 1).y + 6}
          rx={TILE * 2.2}
          ry={TILE * 0.6}
          fill="none"
          stroke="#f87171"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
