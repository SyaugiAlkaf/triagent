import { create } from 'zustand'
import type {
  Alert,
  ChaosState,
  InvestigationState,
  TraceEvent,
  WSEvent,
} from '@/types'

interface State {
  wsStatus: 'connecting' | 'open' | 'closed'
  alerts: Alert[]
  activeIncidentSlug: string | null
  investigation: InvestigationState | null
  traceEvents: TraceEvent[]
  lastResult: InvestigationState['result'] | null
  chaos: ChaosState
  providers: string[]
  tools: string[]
  replayIndex: number | null
  setWsStatus: (s: State['wsStatus']) => void
  setReplayIndex: (n: number | null) => void
  applyWsEvent: (ev: WSEvent) => void
  setActiveIncident: (slug: string | null) => void
  resetTrace: () => void
  setInvestigation: (inv: InvestigationState | null) => void
}

const defaultChaos: ChaosState = {
  killed_providers: [],
  killed_tools: [],
  injected_latency_ms: 0,
  poison_json: false,
}

export const useStore = create<State>((set, get) => ({
  wsStatus: 'connecting',
  alerts: [],
  activeIncidentSlug: null,
  investigation: null,
  traceEvents: [],
  lastResult: null,
  chaos: defaultChaos,
  providers: ['tf-primary', 'tf-verify', 'tf-tertiary', 'ollama', 'mock'],
  tools: ['kubectl', 'prometheus', 'loki'],
  replayIndex: null,

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setReplayIndex: (replayIndex) => set({ replayIndex }),

  applyWsEvent: (ev) => {
    const { type, payload } = ev as { type: string; payload: any }
    if (type === 'initial_state') {
      const chaos = (payload.chaos as ChaosState) ?? defaultChaos
      const tools = (payload.tools as string[]) ?? get().tools
      const fromBackend = (payload.providers as string[] | undefined)
      const providers = fromBackend && fromBackend.length > 0 ? fromBackend : get().providers
      const history = (payload.history as WSEvent[]) ?? []
      set({ chaos, tools, providers })
      for (const past of history) {
        get().applyWsEvent(past)
      }
    } else if (type === 'alert') {
      const next: Alert = {
        slug: payload.slug,
        id: payload.id,
        name: payload.name,
        namespace: payload.namespace,
        severity: payload.severity,
        summary: payload.summary,
        triggered_at: payload.triggered_at,
      }
      const existing = get().alerts.filter((a) => a.slug !== next.slug)
      set({ alerts: [next, ...existing] })
    } else if (type === 'alert_cleared') {
      set({ alerts: get().alerts.filter((a) => a.slug !== payload.slug) })
    } else if (type === 'chaos_state') {
      set({ chaos: payload as ChaosState })
    } else if (type === 'trace_event') {
      const inv = get().investigation
      const evt = payload as TraceEvent
      if (inv && payload.investigation_id && payload.investigation_id !== inv.id) {
        return
      }
      set({ traceEvents: [...get().traceEvents, evt] })
    } else if (type === 'investigation_state') {
      const inv = payload as InvestigationState
      set({
        investigation: inv,
        traceEvents: inv.trace ?? get().traceEvents,
      })
      if (inv.status === 'done' && inv.result) {
        set({ lastResult: inv.result })
      }
    }
  },

  setActiveIncident: (slug) => {
    set({ activeIncidentSlug: slug })
  },

  resetTrace: () => set({ traceEvents: [], investigation: null, lastResult: null }),

  setInvestigation: (inv) => set({ investigation: inv }),
}))
