export interface Alert {
  slug: string
  id?: string
  name: string
  namespace: string
  severity?: string
  summary?: string
  triggered_at?: number | null
}

export interface ChaosState {
  killed_providers: string[]
  killed_tools: string[]
  injected_latency_ms: number
  poison_json: boolean
}

export interface TraceEvent {
  kind: string
  provider?: string | null
  model?: string | null
  latency_ms?: number | null
  detail?: string
  timestamp?: number
  investigation_id?: string
}

export interface Result {
  scenario_id: string
  namespace: string
  failing_pod: string | null
  findings: string[]
  hypotheses: string
  root_cause: string
  confidence: number
  latency_ms: number
  tokens_spent: number
  token_budget: number
  cost_usd: number
  cost_by_provider: Record<string, number>
}

export interface InvestigationState {
  id: string
  scenario_slug: string
  scenario_id: string
  namespace: string
  status: 'queued' | 'running' | 'done' | 'failed'
  phase: string
  phase_detail: string
  started_at: number
  finished_at: number | null
  trace: TraceEvent[]
  error: string | null
  result: Result | null
  tokens_spent: number
  token_budget: number
  cost_usd: number
  cost_by_provider: Record<string, number>
}

export interface WSEvent {
  type: string
  ts: number
  payload: Record<string, unknown>
}

export type ProviderName = 'groq' | 'ollama' | 'mock' | string
export type ToolName = 'kubectl' | 'prometheus' | 'loki' | string

export interface ProviderHealth {
  name: ProviderName
  killed: boolean
}

export interface ToolHealth {
  name: ToolName
  killed: boolean
}
