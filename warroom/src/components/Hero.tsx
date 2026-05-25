import { useStore } from '@/store/store'
import clsx from 'clsx'
import { Activity } from 'lucide-react'

function ProviderPill({ name }: { name: string }) {
  const killed = useStore((s) => s.chaos.killed_providers.includes(name))
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-mono uppercase tracking-wider',
        killed
          ? 'border-danger/60 bg-danger/10 text-danger'
          : 'border-border bg-bg-card text-text'
      )}
    >
      <span className={clsx('size-1.5 rounded-full', killed ? 'bg-danger' : 'bg-success pulse-soft')} />
      <span>{name}</span>
      {killed && <span className="text-danger/80">killed</span>}
    </div>
  )
}

function ToolPill({ name }: { name: string }) {
  const killed = useStore((s) => s.chaos.killed_tools.includes(name))
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-mono uppercase tracking-wider',
        killed
          ? 'border-warning/60 bg-warning/10 text-warning'
          : 'border-border bg-bg-card text-text'
      )}
    >
      <span className={clsx('size-1.5 rounded-full', killed ? 'bg-warning' : 'bg-info pulse-soft')} />
      <span>{name}</span>
      {killed && <span className="text-warning/80">quarantined</span>}
    </div>
  )
}

export default function Hero({ onOpenChaos }: { onOpenChaos: () => void }) {
  const wsStatus = useStore((s) => s.wsStatus)
  const providers = useStore((s) => s.providers)
  const tools = useStore((s) => s.tools)
  const latency = useStore((s) => s.chaos.injected_latency_ms)

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-elevated">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-accent" />
          <div>
            <div className="font-mono font-bold tracking-wider text-text-strong text-sm">TRIAGENT</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-text-dim">war room</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {providers.map((p) => <ProviderPill key={p} name={p} />)}
        </div>
        <div className="flex items-center gap-2">
          {tools.map((t) => <ToolPill key={t} name={t} />)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {latency > 0 && (
          <div className="px-3 py-1 rounded-md border border-warning/60 bg-warning/10 text-warning text-xs font-mono uppercase tracking-wider pulse-soft">
            latency +{latency}ms
          </div>
        )}
        <div
          className={clsx(
            'px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest',
            wsStatus === 'open' ? 'text-success' : 'text-text-dim'
          )}
        >
          ws: {wsStatus}
        </div>
        <button
          onClick={onOpenChaos}
          className="px-4 py-2 rounded-md border border-accent/60 bg-accent/10 hover:bg-accent/20 text-accent font-mono text-xs uppercase tracking-widest transition-colors"
        >
          chaos panel
        </button>
      </div>
    </header>
  )
}
