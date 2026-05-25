import { useStore } from '@/store/store'
import {
  clearChaos,
  killProvider,
  killTool,
  restoreProvider,
  restoreTool,
  setLatency,
  triggerScenario,
  resetScenarios,
} from '@/lib/api'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect } from 'react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-dim">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function ChaosButton({
  active,
  onClick,
  variant = 'default',
  children,
}: {
  active?: boolean
  onClick: () => void
  variant?: 'default' | 'danger' | 'warning' | 'accent'
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-md border font-mono text-xs uppercase tracking-wider transition-colors',
        active && variant === 'danger' && 'border-danger bg-danger/20 text-danger',
        active && variant === 'warning' && 'border-warning bg-warning/20 text-warning',
        active && variant === 'accent' && 'border-accent bg-accent/20 text-accent',
        !active && 'border-border bg-bg-card text-text hover:border-border-strong'
      )}
    >
      {children}
    </button>
  )
}

export default function ChaosDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chaos = useStore((s) => s.chaos)
  const providers = useStore((s) => s.providers)
  const tools = useStore((s) => s.tools)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  const toggleProvider = (name: string) =>
    chaos.killed_providers.includes(name) ? restoreProvider(name) : killProvider(name)
  const toggleTool = (name: string) =>
    chaos.killed_tools.includes(name) ? restoreTool(name) : killTool(name)

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[460px] bg-bg-elevated border-l border-border shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-accent">chaos panel</div>
            <div className="text-text-strong text-sm mt-0.5">resilience under failure</div>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text-strong">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5 space-y-6">
          <Section title="scenarios (engine :8002)">
            <ChaosButton onClick={() => triggerScenario('01-crashloop')} variant="accent">
              trigger crashloop
            </ChaosButton>
            <ChaosButton onClick={() => triggerScenario('02-oom')} variant="accent">
              trigger oom
            </ChaosButton>
            <ChaosButton onClick={() => triggerScenario('03-dns')} variant="accent">
              trigger dns
            </ChaosButton>
            <ChaosButton onClick={() => resetScenarios()}>reset all</ChaosButton>
          </Section>

          <Section title="providers - kill to force fallback chain">
            {providers.map((p) => (
              <ChaosButton
                key={p}
                active={chaos.killed_providers.includes(p)}
                onClick={() => toggleProvider(p)}
                variant="danger"
              >
                {chaos.killed_providers.includes(p) ? `restore ${p}` : `kill ${p}`}
              </ChaosButton>
            ))}
          </Section>

          <Section title="tools - quarantine forces substitution">
            {tools.map((t) => (
              <ChaosButton
                key={t}
                active={chaos.killed_tools.includes(t)}
                onClick={() => toggleTool(t)}
                variant="warning"
              >
                {chaos.killed_tools.includes(t) ? `restore ${t}` : `quarantine ${t}`}
              </ChaosButton>
            ))}
          </Section>

          <Section title="latency injection">
            <ChaosButton onClick={() => setLatency(5000)} variant="warning"
              active={chaos.injected_latency_ms === 5000}>
              inject 5s
            </ChaosButton>
            <ChaosButton onClick={() => setLatency(12000)} variant="warning"
              active={chaos.injected_latency_ms === 12000}>
              inject 12s (brownout)
            </ChaosButton>
            <ChaosButton onClick={() => setLatency(0)}>clear latency</ChaosButton>
          </Section>

          <Section title="reset">
            <ChaosButton onClick={() => clearChaos()}>clear all chaos</ChaosButton>
          </Section>
        </div>
      </div>
    </div>
  )
}
