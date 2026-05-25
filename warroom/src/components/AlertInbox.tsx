import { useStore } from '@/store/store'
import { startInvestigation } from '@/lib/api'
import clsx from 'clsx'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useState } from 'react'

function relTime(ts: number | null | undefined) {
  if (!ts) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function AlertInbox() {
  const alerts = useStore((s) => s.alerts)
  const activeSlug = useStore((s) => s.activeIncidentSlug)
  const setActiveIncident = useStore((s) => s.setActiveIncident)
  const resetTrace = useStore((s) => s.resetTrace)
  const investigation = useStore((s) => s.investigation)
  const [pending, setPending] = useState<string | null>(null)

  const handleInvestigate = async (slug: string) => {
    setActiveIncident(slug)
    resetTrace()
    setPending(slug)
    try {
      await startInvestigation(slug)
    } catch (err) {
      console.error('investigate failed', err)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-elevated border-r border-border">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-text-dim">alert inbox</div>
        <div className="font-mono text-xs text-accent">{alerts.length}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {alerts.length === 0 && (
          <div className="px-3 py-12 text-center text-text-dim text-sm">
            no active alerts. trigger one from the scenario engine on :8002.
          </div>
        )}
        {alerts.map((alert) => {
          const isActive = alert.slug === activeSlug
          const investigating =
            pending === alert.slug ||
            (investigation && investigation.scenario_slug === alert.slug && investigation.status === 'running')
          return (
            <div
              key={alert.slug}
              onClick={() => setActiveIncident(alert.slug)}
              className={clsx(
                'rounded-md border p-3 cursor-pointer transition-colors',
                isActive
                  ? 'border-accent/60 bg-accent/5'
                  : 'border-border bg-bg-card hover:border-border-strong'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-danger shrink-0" />
                  <div className="font-mono text-xs font-medium text-text-strong leading-tight">
                    {alert.name}
                  </div>
                </div>
                {alert.severity && (
                  <span
                    className={clsx(
                      'shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] tracking-wider',
                      alert.severity === 'P1'
                        ? 'bg-danger/15 text-danger border border-danger/40'
                        : 'bg-warning/15 text-warning border border-warning/40'
                    )}
                  >
                    {alert.severity}
                  </span>
                )}
              </div>
              {alert.summary && (
                <div className="mt-2 text-xs text-text leading-relaxed">{alert.summary}</div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="font-mono text-[10px] text-text-dim">
                  ns: {alert.namespace} · {relTime(alert.triggered_at)}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInvestigate(alert.slug)
                  }}
                  disabled={!!investigating}
                  className={clsx(
                    'px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors',
                    'border',
                    investigating
                      ? 'border-border bg-bg text-text-dim cursor-wait'
                      : 'border-accent bg-accent text-white hover:bg-accent/90'
                  )}
                >
                  {investigating ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> running
                    </span>
                  ) : (
                    'investigate'
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
