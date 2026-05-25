import { useStore } from '@/store/store'
import TraceLine from './TraceLine'
import { VerdictCard } from './claude-design/VerdictCard'
import { ReplayModal } from './claude-design/ReplayModal'
import { PROVIDER_META } from './claude-design/design-system'
import clsx from 'clsx'
import { Loader2, Cpu, Footprints, FileText, Terminal, Coins } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { TraceEvent } from '@/types'

const THINKING_PHRASES = [
  'fetching pod state from k8s',
  'asking tf-primary for first hypothesis',
  'cross-checking via tf-verify (Gemini)',
  'weighing ensemble confidence',
  'walking the trace through verify_node',
  'composing remediation',
]

function AgentThinking() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % THINKING_PHRASES.length), 1800)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="relative inline-flex items-center justify-center w-5 h-5 flex-shrink-0">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'var(--color-accent)',
            opacity: 0.18,
            animation: 'pulse-soft 1.8s ease-in-out infinite',
          }}
        />
        <Cpu size={11} className="text-accent relative" />
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
          className="font-mono text-[12px] tracking-[0.04em] text-text-mid"
        >
          {THINKING_PHRASES[idx]}
          <span className="ml-1.5 inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full pulse-dot" style={{ background: 'var(--color-accent)' }} />
            <span className="w-1 h-1 rounded-full pulse-dot" style={{ background: 'var(--color-accent)', animationDelay: '0.3s' }} />
            <span className="w-1 h-1 rounded-full pulse-dot" style={{ background: 'var(--color-accent)', animationDelay: '0.6s' }} />
          </span>
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className="grid items-center gap-2"
          style={{ gridTemplateColumns: '56px 16px 84px 1fr' }}
        >
          <div className="h-3 rounded shimmer-block" style={{ width: 44 }} />
          <div className="w-2 h-2 rounded-full shimmer-block" />
          <div className="h-3 rounded shimmer-block" style={{ width: 60 }} />
          <div className="h-3 rounded shimmer-block" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
        </motion.div>
      ))}
    </div>
  )
}

type Tab = 'verdict' | 'trace' | 'cost'

export default function IncidentDetail() {
  const activeSlug = useStore((s) => s.activeIncidentSlug)
  const inv = useStore((s) => s.investigation)
  const trace = useStore((s) => s.traceEvents)
  const result = useStore((s) => s.lastResult)
  const traceRef = useRef<HTMLDivElement>(null)
  const [replayOpen, setReplayOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('trace')

  const status = inv?.status ?? 'idle'
  const phase = inv?.phase ?? 'queued'
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const hasVerdict = !!result && isDone
  const canReplay = isDone && trace.length > 0

  useEffect(() => {
    if (hasVerdict && tab === 'trace') setTab('verdict')
    if (!hasVerdict && tab === 'verdict') setTab('trace')
  }, [hasVerdict])

  useEffect(() => {
    setTab(hasVerdict ? 'verdict' : 'trace')
  }, [activeSlug])

  useEffect(() => {
    const onOpenReplay = () => setReplayOpen(true)
    window.addEventListener('triagent:open-replay-modal', onOpenReplay as EventListener)
    return () => window.removeEventListener('triagent:open-replay-modal', onOpenReplay as EventListener)
  }, [])

  useEffect(() => {
    if (tab === 'trace' && traceRef.current) {
      traceRef.current.scrollTop = traceRef.current.scrollHeight
    }
  }, [trace.length, tab])

  if (!activeSlug) {
    return (
      <div
        className="h-full rounded-lg flex items-center justify-center text-text-dim text-sm"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
        }}
      >
        select an alert on the left to begin
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col rounded-lg overflow-hidden"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0 gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
            scenario {inv?.scenario_id ?? activeSlug}
          </div>
          <div className="font-mono text-sm text-text-strong mt-0.5 truncate">
            {inv?.namespace ?? 'triagent-demo'} / {inv?.scenario_slug ?? activeSlug}
          </div>
        </div>
        <div
          className={clsx(
            'px-3 py-1 rounded-md border font-mono text-[10.5px] uppercase tracking-widest flex-shrink-0',
            isRunning && 'border-accent/60 bg-accent/10 text-accent pulse-soft',
            isDone && 'border-success/60 bg-success/10 text-success',
            status === 'failed' && 'border-danger/60 bg-danger/10 text-danger',
            status === 'idle' && 'border-border text-text-dim'
          )}
        >
          {isRunning && <Loader2 className="inline size-3 animate-spin mr-1" />}
          {phase}
        </div>
      </div>

      <TabBar
        tab={tab}
        onTab={setTab}
        hasVerdict={hasVerdict}
        traceCount={trace.length}
        canReplay={canReplay}
        hasCost={hasVerdict}
        onOpenReplay={() => setReplayOpen(true)}
      />

      <div className="flex-1 overflow-hidden relative min-h-0">
        <AnimatePresence mode="wait">
          {tab === 'verdict' && hasVerdict && (
            <motion.div
              key="verdict-pane"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto p-4"
            >
              <VerdictCard />
            </motion.div>
          )}
          {tab === 'cost' && hasVerdict && result && (
            <motion.div
              key="cost-pane"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto p-4"
            >
              <CostPane result={result} trace={trace} />
            </motion.div>
          )}
          {tab === 'trace' && (
            <motion.div
              key="trace-pane"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="absolute inset-0 flex flex-col"
            >
              <div
                ref={traceRef}
                data-trace-feed-scroll
                className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
              >
                {trace.length === 0 && isRunning && (
                  <>
                    <SkeletonRows count={4} />
                    <AgentThinking />
                  </>
                )}
                {trace.length === 0 && !isRunning && (
                  <div className="px-3 py-12 text-center text-text-dim font-mono text-xs">
                    waiting for trace events. trace_event broadcasts arrive on /ws as the agent runs.
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {trace.map((ev, i) => (
                    <motion.div
                      key={`${ev.timestamp ?? i}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
                    >
                      <TraceLine event={ev} index={i} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isRunning && trace.length > 0 && <AgentThinking />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ReplayModal open={replayOpen} onClose={() => setReplayOpen(false)} />
    </div>
  )
}

interface TabBarProps {
  tab: Tab
  onTab: (t: Tab) => void
  hasVerdict: boolean
  hasCost: boolean
  traceCount: number
  canReplay: boolean
  onOpenReplay: () => void
}

function TabBar({ tab, onTab, hasVerdict, hasCost, traceCount, canReplay, onOpenReplay }: TabBarProps) {
  return (
    <div
      className="flex items-center gap-1 px-3 pt-2 pb-2 border-b border-border flex-shrink-0"
      style={{ background: 'var(--color-bg-sunken)' }}
    >
      <TabButton
        active={tab === 'verdict'}
        disabled={!hasVerdict}
        onClick={() => hasVerdict && onTab('verdict')}
        label="VERDICT"
        icon={<FileText size={11} />}
        layoutId="scenario-tab-indicator"
        active2={tab === 'verdict'}
      />
      <TabButton
        active={tab === 'trace'}
        onClick={() => onTab('trace')}
        label="TRACE"
        icon={<Terminal size={11} />}
        count={traceCount}
        layoutId="scenario-tab-indicator"
        active2={tab === 'trace'}
      />
      <TabButton
        active={tab === 'cost'}
        disabled={!hasCost}
        onClick={() => hasCost && onTab('cost')}
        label="COST"
        icon={<Coins size={11} />}
        layoutId="scenario-tab-indicator"
        active2={tab === 'cost'}
      />
      <div className="flex-1" />
      {canReplay && (
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={onOpenReplay}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded font-mono text-[10.5px] tracking-[0.14em] font-bold"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid color-mix(in oklch, var(--color-accent) 45%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          <Footprints size={11} /> REPLAY
        </motion.button>
      )}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  active2: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
  count?: number
  layoutId: string
}

function TabButton({ active, disabled, onClick, label, icon, count, layoutId, active2 }: TabButtonProps) {
  const idTag = useMemo(() => `${layoutId}-${label}`, [layoutId, label])
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'relative inline-flex items-center gap-1.5 px-3 h-8 rounded font-mono text-[11px] tracking-[0.14em] font-bold transition-colors',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && !active && 'text-text-dim hover:text-text-strong',
        active && 'text-text-strong'
      )}
      style={{ outline: 'none' }}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded"
          style={{
            background: 'color-mix(in oklch, var(--color-accent) 14%, transparent)',
            border: '1px solid color-mix(in oklch, var(--color-accent) 55%, transparent)',
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        {icon}
        {label}
        {typeof count === 'number' && (
          <span
            className="ml-1 inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded text-[9.5px] tabular-nums"
            style={{
              background: 'var(--color-bg-sunken)',
              color: active2 ? 'var(--color-accent)' : 'var(--color-text-dim)',
              border: '1px solid var(--color-border)',
            }}
          >
            {count}
          </span>
        )}
      </span>
      <span className="sr-only">{idTag}</span>
    </button>
  )
}

/* ─────────────── COST PANE ──────────────────────────────────────────────── */

interface CostPaneProps {
  result: { cost_usd: number; cost_by_provider: Record<string, number>; tokens_spent: number; token_budget: number; latency_ms: number }
  trace: TraceEvent[]
}

function CostPane({ result, trace }: CostPaneProps) {
  const providerLatency = useMemo(() => {
    const buckets: Record<string, number[]> = {}
    for (const e of trace) {
      if (e.kind === 'provider_call' && e.provider && typeof e.latency_ms === 'number') {
        if (!buckets[e.provider]) buckets[e.provider] = []
        buckets[e.provider].push(e.latency_ms)
      }
    }
    return buckets
  }, [trace])

  const totalCost = result.cost_usd ?? 0
  const tokenBudget = result.token_budget || 20000
  const tokensSpent = result.tokens_spent || 0
  const tokenPct = Math.min(100, (tokensSpent / tokenBudget) * 100)
  const providerKeys = Object.keys(result.cost_by_provider ?? {})
  const sortedProviders = providerKeys.sort((a, b) => (result.cost_by_provider[b] ?? 0) - (result.cost_by_provider[a] ?? 0))
  const skips = trace.filter((e) => e.kind === 'provider_skip')

  return (
    <div className="space-y-4 max-w-full">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="TOTAL COST" value={`$${totalCost.toFixed(5)}`} hint={`${sortedProviders.length} providers billed`} accent="var(--color-success)" />
        <StatCard label="TOKENS" value={`${(tokensSpent / 1000).toFixed(2)}k`} hint={`/ ${(tokenBudget / 1000).toFixed(0)}k cap`} accent="var(--color-warning)" />
        <StatCard label="WALL TIME" value={`${(result.latency_ms / 1000).toFixed(2)}s`} hint="end-to-end" accent="var(--color-info)" />
      </div>

      <Section title="TOKEN BUDGET" right={`${tokenPct.toFixed(0)}%`}>
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: 'color-mix(in oklch, var(--color-text-dim) 16%, transparent)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${tokenPct}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background:
                tokenPct > 80
                  ? 'var(--color-danger)'
                  : tokenPct > 50
                    ? 'var(--color-warning)'
                    : 'var(--color-accent)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 font-mono text-[10px] text-text-dim tabular-nums">
          <span>{tokensSpent} tok spent</span>
          <span>{tokenBudget - tokensSpent} tok runway</span>
        </div>
      </Section>

      <Section title="COST BY PROVIDER">
        {sortedProviders.length === 0 ? (
          <div className="font-mono text-[11px] text-text-dim italic">no billed providers — full ensemble may be on free tier</div>
        ) : (
          <div className="space-y-2">
            {sortedProviders.map((p) => {
              const cost = result.cost_by_provider[p] ?? 0
              const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0
              const meta = PROVIDER_META[p]
              return (
                <div key={p} className="font-mono text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: meta?.color ?? 'var(--color-accent)' }} />
                      <span className="text-text-strong font-bold tracking-[0.12em]">{meta?.label ?? p.toUpperCase()}</span>
                      {meta?.sublabel && <span className="text-text-dim">· {meta.sublabel}</span>}
                    </span>
                    <span className="tabular-nums text-text-strong">${cost.toFixed(5)}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in oklch, var(--color-text-dim) 14%, transparent)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: meta?.color ?? 'var(--color-accent)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="EWMA LATENCY" right={`${Object.keys(providerLatency).length} providers seen`}>
        {Object.keys(providerLatency).length === 0 ? (
          <div className="font-mono text-[11px] text-text-dim italic">no provider_call events in trace yet</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(providerLatency).map(([p, samples]) => {
              const avg = samples.reduce((a, b) => a + b, 0) / samples.length
              const max = Math.max(...samples)
              const meta = PROVIDER_META[p]
              return (
                <div key={p} className="font-mono text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: meta?.color ?? 'var(--color-accent)' }} />
                      <span className="text-text-strong font-bold tracking-[0.12em]">{meta?.label ?? p.toUpperCase()}</span>
                      <span className="text-text-dim">· {samples.length} calls</span>
                    </span>
                    <span className="tabular-nums text-text-strong">{avg.toFixed(0)} ms avg</span>
                  </div>
                  <Sparkline samples={samples} max={max} color={meta?.color ?? 'var(--color-accent)'} />
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {skips.length > 0 && (
        <Section title="COST-AWARE SKIPS" right={`${skips.length} skipped`}>
          <ul className="space-y-1.5 font-mono text-[11px]">
            {skips.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-text leading-snug">
                <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--color-warning)' }} />
                <span>
                  <span className="text-warning font-bold mr-1">{s.provider ?? '?'}</span>
                  {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="rounded-md border border-border p-3" style={{ background: 'var(--color-bg-sunken)' }}>
      <div className="font-mono uppercase font-medium mb-1" style={{ color: accent, letterSpacing: '0.18em', fontSize: 9 }}>
        {label}
      </div>
      <div className="text-[18px] font-semibold text-text-strong tabular-nums leading-none">{value}</div>
      <div className="font-mono text-[10px] text-text-dim mt-1 tabular-nums">{hint}</div>
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3" style={{ background: 'var(--color-bg-sunken)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-mono uppercase font-medium text-text" style={{ letterSpacing: '0.14em', fontSize: 10.5 }}>
          {title}
        </span>
        {right && <span className="font-mono text-[10px] text-text-dim tabular-nums">{right}</span>}
      </div>
      {children}
    </div>
  )
}

function Sparkline({ samples, max, color }: { samples: number[]; max: number; color: string }) {
  const w = 240
  const h = 24
  if (samples.length === 0) return null
  const step = w / Math.max(1, samples.length - 1)
  const points = samples.map((s, i) => `${i * step},${h - (s / Math.max(1, max)) * h}`).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {samples.map((s, i) => (
        <circle key={i} cx={i * step} cy={h - (s / Math.max(1, max)) * h} r={1.6} fill={color} />
      ))}
    </svg>
  )
}
