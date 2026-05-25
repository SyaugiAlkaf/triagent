import { useEffect, useRef, useState } from 'react'
import { HeroCockpit } from '@/components/claude-design/HeroCockpit'
import { AlertInbox } from '@/components/claude-design/AlertInbox'
import IncidentDetail from '@/components/IncidentDetail'
import { ChaosConsole } from '@/components/claude-design/ChaosConsole'
import { TickerStrip } from '@/components/claude-design/TickerStrip'
import { TopologyScene } from '@/components/claude-design/TopologyScene'
import { DesignSystemStyles } from '@/components/claude-design/design-system'
import EvalModal from '@/components/EvalModal'
import LoginScreen from '@/components/LoginScreen'
import { ensureSocket } from '@/lib/ws'
import { isDemoMode } from '@/lib/demo-mode'
import { useStore } from '@/store/store'
import { Toaster, toast } from 'sonner'

type AuthPhase = 'login' | 'dismissing' | 'authed'

function useChaosToasts() {
  const killedProviders = useStore((s) => s.chaos.killed_providers)
  const killedTools = useStore((s) => s.chaos.killed_tools)
  const trace = useStore((s) => s.traceEvents)
  const prevKilledP = useRef<string[]>([])
  const prevKilledT = useRef<string[]>([])
  const prevTraceLen = useRef(0)

  useEffect(() => {
    const added = killedProviders.filter((p) => !prevKilledP.current.includes(p))
    const removed = prevKilledP.current.filter((p) => !killedProviders.includes(p))
    added.forEach((p) => toast.error(`Provider killed: ${p}`, { description: 'Routing policy falling through to next available provider.' }))
    removed.forEach((p) => toast.success(`Provider restored: ${p}`))
    prevKilledP.current = killedProviders
  }, [killedProviders])

  useEffect(() => {
    const added = killedTools.filter((t) => !prevKilledT.current.includes(t))
    const removed = prevKilledT.current.filter((t) => !killedTools.includes(t))
    added.forEach((t) => toast.warning(`Tool quarantined: ${t}`, { description: 'Agent substituting an alternate observability path.' }))
    removed.forEach((t) => toast.success(`Tool restored: ${t}`))
    prevKilledT.current = killedTools
  }, [killedTools])

  useEffect(() => {
    if (trace.length <= prevTraceLen.current) {
      prevTraceLen.current = trace.length
      return
    }
    const fresh = trace.slice(prevTraceLen.current)
    prevTraceLen.current = trace.length
    fresh.forEach((ev) => {
      if (ev.kind === 'provider_fallback') {
        toast(`Fallback → ${ev.provider ?? '?'}`, { description: ev.detail ?? '' })
      } else if (ev.kind === 'budget_exceeded') {
        toast.error('Token budget tripped', { description: ev.detail ?? '' })
      } else if (ev.kind === 'ensemble_degraded') {
        toast.warning('Ensemble degraded to single-provider verify', { description: ev.detail ?? '' })
      } else if (ev.kind === 'provider_skip') {
        toast.warning(`Provider skip · ${ev.provider ?? ''}`, { description: ev.detail ?? '' })
      }
    })
  }, [trace])
}

function ChaosToastsBridge() {
  useChaosToasts()
  return null
}

export default function App() {
  const [chaosOpen, setChaosOpen] = useState(false)
  const [authPhase, setAuthPhase] = useState<AuthPhase>('login')

  useEffect(() => {
    ensureSocket()
  }, [])

  const onLogin = () => {
    setAuthPhase('dismissing')
    setTimeout(() => setAuthPhase('authed'), 800)
  }

  const demo = isDemoMode()

  return (
    <div className="min-h-screen w-screen flex flex-col bg-bg text-text lg:h-screen lg:overflow-hidden">
      <DesignSystemStyles />
      {demo && (
        <div
          className="px-3 py-1.5 text-[11px] tracking-[0.22em] font-mono uppercase flex items-center justify-center gap-3"
          style={{
            background: 'linear-gradient(90deg, rgba(162,89,255,0.18), rgba(162,89,255,0.06))',
            borderBottom: '1px solid rgba(162,89,255,0.35)',
            color: '#c8b3ff',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c8b3ff', boxShadow: '0 0 8px #c8b3ff' }} />
          demo mode · scripted scenarios · no backend
          <span className="opacity-50">·</span>
          <a href="https://github.com/triagent" target="_blank" rel="noreferrer" className="underline opacity-80 hover:opacity-100">github</a>
        </div>
      )}
      <div className="px-3 pt-3">
        <HeroCockpit onToggleChaos={() => setChaosOpen((o) => !o)} />
      </div>
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[340px_1fr] gap-3 px-3 pt-3 min-h-0 lg:overflow-hidden">
        <AlertInbox />
        <IncidentDetail />
      </main>
      <div className="px-3 pt-2">
        <TickerStrip />
      </div>
      <section
        className="relative mx-3 mb-3 mt-2 rounded-lg overflow-hidden border border-border hidden md:block"
        style={{ height: 'clamp(240px, 38vh, 372px)', background: 'var(--color-bg-elevated)' }}
      >
        <TopologyScene />
      </section>
      <ChaosConsole open={chaosOpen} onClose={() => setChaosOpen(false)} />
      <EvalModal />
      {authPhase !== 'authed' && (
        <LoginScreen
          onLogin={onLogin}
          dismissed={authPhase === 'dismissing'}
        />
      )}
      <ChaosToastsBridge />
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={24}
        duration={4500}
        toastOptions={{
          style: {
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-strong)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '11.5px',
            letterSpacing: '0.04em',
          },
        }}
      />
    </div>
  )
}
