import type { TraceEvent } from '@/types'
import clsx from 'clsx'
import { DollarSign, GitMerge, ShieldAlert } from 'lucide-react'
import { TRACE_KIND_META } from './claude-design/design-system'

const KIND_PALETTE: Record<string, string> = {
  plan: 'text-info border-info/40',
  tool_call: 'text-text border-border-strong',
  tool_result: 'text-text-dim border-border',
  tool_quarantine: 'text-warning border-warning/40',
  tool_substitute: 'text-accent border-accent/40',
  tool_unavailable: 'text-danger border-danger/40',
  tool_error: 'text-danger border-danger/40',
  provider_call: 'text-info border-info/40',
  provider_error: 'text-warning border-warning/40',
  provider_fallback: 'text-accent border-accent/40',
  provider_quarantine: 'text-warning border-warning/40',
  provider_restore: 'text-success border-success/40',
  provider_skip: 'text-warning border-warning/60',
  ensemble_verify: 'text-success border-success/40',
  ensemble_degraded: 'text-warning border-warning/40',
  chaos_inject: 'text-danger border-danger/40',
  budget_exceeded: 'text-danger border-danger/40 font-bold',
  default: 'text-text border-border',
}

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  provider_skip: DollarSign,
  ensemble_verify: GitMerge,
  ensemble_degraded: ShieldAlert,
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return `${value.toFixed(0)}ms`
}

export default function TraceLine({ event, index }: { event: TraceEvent; index: number }) {
  const palette = KIND_PALETTE[event.kind] ?? KIND_PALETTE.default
  const Icon = KIND_ICON[event.kind]
  const title =
    event.kind === 'provider_skip'
      ? `Cost-aware fallback: provider skipped under budget pressure. ${event.detail ?? ''}`
      : event.kind === 'ensemble_verify'
        ? `Cross-provider ensemble verify. ${event.detail ?? ''}`
        : event.kind === 'ensemble_degraded'
          ? `Ensemble degraded — only one provider family available. ${event.detail ?? ''}`
          : event.detail ?? ''
  const label = TRACE_KIND_META[event.kind]?.label ?? event.kind.replace(/_/g, ' ').toUpperCase()
  return (
    <div
      className={clsx('grid items-baseline gap-2 px-3 py-1.5 border-l-2 font-mono text-xs min-w-0', palette)}
      style={{ gridTemplateColumns: '32px 96px 72px minmax(0, 1fr) auto' }}
      title={title}
    >
      <span className="text-text-dim text-right tabular-nums truncate">{String(index).padStart(3, '0')}</span>
      <span className="uppercase tracking-wider flex items-center gap-1.5 truncate">
        {Icon ? <Icon size={11} className="shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-text-dim truncate">{event.provider ?? ''}</span>
      <span className="text-text truncate min-w-0">{event.detail ?? ''}</span>
      {event.latency_ms !== undefined && event.latency_ms !== null ? (
        <span className="text-text-dim tabular-nums whitespace-nowrap">{fmt(event.latency_ms)}</span>
      ) : <span />}
    </div>
  )
}
