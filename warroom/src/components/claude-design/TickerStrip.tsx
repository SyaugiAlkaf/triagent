import { useMemo } from "react";
import { useStore } from "@/store/store";
import type { TraceEvent } from "@/types";

function tickerColor(kind: string): string {
  switch (kind) {
    case "chaos_inject":
    case "tool_unavailable":
    case "budget_exceeded":
      return "var(--color-danger)";
    case "tool_quarantine":
    case "provider_error":
    case "provider_skip":
      return "var(--color-warning)";
    case "provider_fallback":
    case "tool_substitute":
      return "var(--color-accent)";
    case "provider_restore":
      return "var(--color-success)";
    case "plan":
    case "tool_call":
    case "provider_call":
      return "var(--color-text-mid)";
    default:
      return "var(--color-text)";
  }
}

interface TickerItem {
  id: string;
  color: string;
  kind: string;
  msg: string;
}

export function TickerStrip() {
  const traceEvents = useStore((s) => s.traceEvents) as TraceEvent[];
  const chaos = useStore((s) => s.chaos);

  const items = useMemo<TickerItem[]>(() => {
    const arr: TickerItem[] = [];
    const recent = traceEvents.slice(-20);
    recent.forEach((e, i) => {
      arr.push({
        id: `e${i}`,
        color: tickerColor(e.kind),
        kind: (e.kind || "").toUpperCase(),
        msg: (e.detail || "").slice(0, 80),
      });
    });
    chaos.killed_providers.forEach((p) =>
      arr.push({
        id: `kp-${p}`,
        color: "var(--color-danger)",
        kind: "CHAOS",
        msg: `provider ${p} kill-switch armed`,
      })
    );
    chaos.killed_tools.forEach((t) =>
      arr.push({
        id: `kt-${t}`,
        color: "var(--color-warning)",
        kind: "CHAOS",
        msg: `tool ${t} quarantined`,
      })
    );
    if (chaos.injected_latency_ms > 0)
      arr.push({
        id: "lat",
        color: "var(--color-warning)",
        kind: "INJECT",
        msg: `network latency +${chaos.injected_latency_ms}ms across mesh`,
      });
    if (arr.length < 8) {
      arr.push(
        {
          id: "b1",
          color: "var(--color-text-mid)",
          kind: "METRIC",
          msg: "cluster.cpu.utilization 38% · target 70%",
        },
        {
          id: "b2",
          color: "var(--color-success)",
          kind: "HEALTH",
          msg: "all api endpoints 200 OK",
        },
        {
          id: "b3",
          color: "var(--color-accent)",
          kind: "AGENT",
          msg: "planner cycle complete · ensemble verify across 2 TF-routed models",
        },
        {
          id: "b4",
          color: "var(--color-text-mid)",
          kind: "NET",
          msg: "gateway.truefoundry.ai RTT median 312ms · p99 1.4s",
        }
      );
    }
    return arr;
  }, [traceEvents, chaos]);

  const TickerItems = ({ keyPrefix }: { keyPrefix: string }) => (
    <>
      {items.map((it) => (
        <div
          key={`${keyPrefix}-${it.id}`}
          className="flex items-center gap-1.5 px-3.5 border-r border-border whitespace-nowrap"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: it.color }}
          />
          <span
            className="font-mono text-[10.5px] tracking-[0.12em] font-bold"
            style={{ color: it.color }}
          >
            {it.kind}
          </span>
          <span className="font-mono text-[11.5px] text-text">{it.msg}</span>
        </div>
      ))}
    </>
  );

  return (
    <div
      className="relative h-7 rounded-md overflow-hidden"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="absolute top-0 left-0 bottom-0 z-10 px-2.5 flex items-center gap-1.5"
        style={{
          background: "var(--color-bg-elevated)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <span
          className="inline-flex w-1.5 h-1.5 rounded-full triagent-pulse-dot"
          style={{ background: "var(--color-accent)" }}
        />
        <span className="font-mono text-[10.5px] tracking-[0.14em] font-bold text-text-strong">
          FEED
        </span>
        <span className="font-mono text-[10.5px] text-text-dim tabular-nums">
          · {traceEvents.length}
        </span>
      </div>
      <div
        className="absolute top-0 bottom-0 right-0 w-14 z-10 pointer-events-none"
        style={{
          background: "linear-gradient(270deg, var(--color-bg-elevated), transparent)",
        }}
      />
      <div className="absolute top-0 left-[100px] right-0 bottom-0 overflow-hidden">
        <div
          className="triagent-marquee inline-flex h-full items-center"
          style={{ willChange: "transform" }}
        >
          <TickerItems keyPrefix="a" />
          <TickerItems keyPrefix="b" />
        </div>
      </div>
    </div>
  );
}
