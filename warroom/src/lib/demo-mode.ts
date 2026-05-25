import type { WSEvent, TraceEvent, Result, ChaosState } from '@/types'
import { useStore } from '@/store/store'

const FALLBACK_CHAIN = ['tf-primary', 'tf-verify', 'tf-tertiary', 'ollama', 'mock']

function nextAvailableProvider(current: string, killed: string[]): string | null {
  const idx = FALLBACK_CHAIN.indexOf(current)
  if (idx === -1) return null
  for (let i = idx + 1; i < FALLBACK_CHAIN.length; i++) {
    if (!killed.includes(FALLBACK_CHAIN[i])) return FALLBACK_CHAIN[i]
  }
  return null
}

function rewriteStepsForChaos(steps: ScriptedStep[], chaos: ChaosState): ScriptedStep[] {
  if (chaos.killed_providers.length === 0 && chaos.killed_tools.length === 0) return steps
  const result: ScriptedStep[] = []
  let extra = 0
  const reroute: Record<string, string> = {}

  for (const step of steps) {
    const ev = step.event
    const at = step.delayMs + extra
    const prov = ev.provider ?? null

    if ((ev.kind === 'llm.call' || ev.kind === 'llm.ok') && prov && chaos.killed_providers.includes(prov)) {
      const next = reroute[prov] ?? nextAvailableProvider(prov, chaos.killed_providers)
      if (next) reroute[prov] = next
      result.push({ delayMs: at, event: { kind: 'llm.error', provider: prov, detail: `${prov} killed by chaos` } })
      extra += 90
      if (next) {
        result.push({ delayMs: at + 90, event: { kind: 'provider_fallback', provider: next, detail: `rerouted from ${prov}` } })
        extra += 100
        result.push({ delayMs: at + 190, event: { ...ev, provider: next, detail: `${next} fallback · ${ev.detail ?? ''}`.trim() } })
        extra += 60
      }
      continue
    }

    if (prov && reroute[prov]) {
      result.push({ delayMs: at, event: { ...ev, provider: reroute[prov] } })
      continue
    }

    if (ev.kind === 'tool.call' && typeof ev.detail === 'string' && ev.detail.startsWith('kubectl') && chaos.killed_tools.includes('kubectl')) {
      result.push({ delayMs: at, event: { kind: 'tool.error', detail: `kubectl quarantined · exit=137` } })
      extra += 100
      result.push({ delayMs: at + 100, event: { kind: 'resilient.move', detail: `prometheus substituted for kubectl` } })
      extra += 120
      result.push({ delayMs: at + 220, event: { kind: 'prometheus.query', detail: ev.detail.replace(/^kubectl\s+/, '') } })
      extra += 60
      continue
    }

    result.push({ delayMs: at, event: ev })
  }
  return result
}

export function isDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search)
    if (q.get('demo') === '1') return true
    if (q.get('demo') === '0') return false
  }
  return import.meta.env.VITE_DEMO_MODE === 'true'
}

const PROVIDERS = ['tf-primary', 'tf-verify', 'tf-tertiary', 'ollama', 'mock']
const TOOLS = ['kubectl', 'prometheus', 'loki']

const ALERTS = [
  {
    slug: 'crashloop-backoff',
    id: 'demo-crashloop',
    name: 'CrashLoopBackOff · missing DATABASE_URL',
    namespace: 'triagent-demo',
    severity: 'P1',
    summary: 'Pod is restarting in a loop; container exits non-zero on start.',
    triggered_at: Date.now() / 1000 - 12,
  },
  {
    slug: 'oom-cascade',
    id: 'demo-oom',
    name: 'OOMKilled cascade · memory-leak in worker',
    namespace: 'triagent-oom',
    severity: 'P1',
    summary: 'Worker pod OOMKilled; replacement pod also OOMKilled within 30s.',
    triggered_at: Date.now() / 1000 - 6,
  },
  {
    slug: 'dns-chaos',
    id: 'demo-dns',
    name: 'CoreDNS misconfig · chaos-amplified',
    namespace: 'triagent-dns',
    severity: 'P2',
    summary: 'Cluster DNS resolution failing; CoreDNS panic spike on Prometheus.',
    triggered_at: Date.now() / 1000 - 2,
  },
]

interface ScriptedStep {
  delayMs: number
  event: TraceEvent
}

interface ScriptedScenario {
  result: Omit<Result, 'scenario_id' | 'namespace'>
  steps: ScriptedStep[]
}

const SCENARIOS: Record<string, ScriptedScenario> = {
  'crashloop-backoff': {
    result: {
      failing_pod: 'demo-api-7d9c8f-zx4kp',
      findings: [
        'pod restarted 12 times in last 5m',
        'env var DATABASE_URL missing from container spec',
        'last log line: "panic: dial tcp: missing address"',
      ],
      hypotheses: 'Missing DATABASE_URL env causes connection panic on boot, container exits, k8s restarts pod, loop continues.',
      root_cause: 'Container spec is missing the DATABASE_URL environment variable. Add it to the deployment manifest.',
      confidence: 0.94,
      latency_ms: 1820,
      tokens_spent: 1840,
      token_budget: 10000,
      cost_usd: 0.00031,
      cost_by_provider: { 'tf-primary': 0.00022, 'tf-verify': 0.00009 },
    },
    steps: [
      { delayMs: 0, event: { kind: 'investigate.start', detail: 'scenario=crashloop-backoff' } },
      { delayMs: 220, event: { kind: 'llm.call', provider: 'tf-primary', model: 'claude-3.5-sonnet', detail: 'hypothesis generation' } },
      { delayMs: 540, event: { kind: 'tool.call', detail: 'kubectl get pods -n triagent-demo' } },
      { delayMs: 720, event: { kind: 'tool.ok', detail: 'pod=demo-api-7d9c8f-zx4kp · restarts=12' } },
      { delayMs: 900, event: { kind: 'tool.call', detail: 'kubectl describe pod demo-api-7d9c8f-zx4kp' } },
      { delayMs: 1120, event: { kind: 'tool.ok', detail: 'last exit=1 · reason=Error · env missing' } },
      { delayMs: 1320, event: { kind: 'llm.call', provider: 'tf-verify', model: 'gemini-2.0-flash', detail: 'cross-check hypothesis' } },
      { delayMs: 1560, event: { kind: 'llm.ok', provider: 'tf-verify', latency_ms: 220, detail: '256 tok' } },
      { delayMs: 1700, event: { kind: 'hypothesis', detail: 'missing DATABASE_URL env in container spec' } },
      { delayMs: 1820, event: { kind: 'verdict.ready', detail: 'confidence=0.94 · cost=$0.00031' } },
    ],
  },
  'oom-cascade': {
    result: {
      failing_pod: 'worker-deploy-66f4d-mzpqr',
      findings: [
        'worker pod OOMKilled at 04:12:18',
        'replacement pod OOMKilled 28s later',
        'heap usage climbed from 120Mi to 512Mi in 24s — leak signature',
      ],
      hypotheses: 'Worker process leaks memory under sustained load; pods OOMKill before request queue drains, replacements inherit the same workload + leak again.',
      root_cause: 'Memory leak in worker request handler. Recent commit removed Channel cleanup on goroutine exit. Either roll back or restore the deferred close.',
      confidence: 0.88,
      latency_ms: 2640,
      tokens_spent: 2110,
      token_budget: 10000,
      cost_usd: 0.00037,
      cost_by_provider: { 'tf-primary': 0.00024, 'tf-verify': 0.00013 },
    },
    steps: [
      { delayMs: 0, event: { kind: 'investigate.start', detail: 'scenario=oom-cascade' } },
      { delayMs: 240, event: { kind: 'llm.call', provider: 'tf-primary', model: 'claude-3.5-sonnet', detail: 'multi-step hypothesis' } },
      { delayMs: 620, event: { kind: 'tool.call', detail: 'kubectl get events -n triagent-oom' } },
      { delayMs: 880, event: { kind: 'tool.ok', detail: '2 OOMKilled events in last 60s' } },
      { delayMs: 1080, event: { kind: 'tool.call', detail: 'prometheus: container_memory_working_set_bytes' } },
      { delayMs: 1320, event: { kind: 'tool.ok', detail: 'heap 120Mi → 512Mi in 24s · leak' } },
      { delayMs: 1500, event: { kind: 'llm.call', provider: 'tf-verify', model: 'gemini-2.0-flash', detail: 'verify leak hypothesis' } },
      { delayMs: 1820, event: { kind: 'llm.ok', provider: 'tf-verify', latency_ms: 320, detail: '320 tok' } },
      { delayMs: 2100, event: { kind: 'tool.call', detail: 'git log --oneline -10 worker/' } },
      { delayMs: 2340, event: { kind: 'tool.ok', detail: 'recent: "refactor: drop channel cleanup"' } },
      { delayMs: 2500, event: { kind: 'hypothesis', detail: 'leaked goroutines hold channel references' } },
      { delayMs: 2640, event: { kind: 'verdict.ready', detail: 'confidence=0.88 · cost=$0.00037' } },
    ],
  },
  'dns-chaos': {
    result: {
      failing_pod: 'coredns-67c66f5dfd-h4t8m',
      findings: [
        'CoreDNS panic_count_total spiking',
        'kubectl quarantined (chaos): exit=137',
        'Prometheus substituted as evidence path',
        'Corefile reloaded at 04:11:54 with invalid forward stanza',
      ],
      hypotheses: 'CoreDNS Corefile was reloaded with an invalid forward stanza, causing the parse step to panic on every query.',
      root_cause: 'Invalid Corefile forward directive (likely a malformed upstream IP). Roll back the configmap to last known-good and reload CoreDNS.',
      confidence: 0.91,
      latency_ms: 2180,
      tokens_spent: 2320,
      token_budget: 10000,
      cost_usd: 0.00041,
      cost_by_provider: { 'tf-primary': 0.00018, 'ollama': 0.0, 'tf-verify': 0.00014, 'prometheus': 0.00009 },
    },
    steps: [
      { delayMs: 0, event: { kind: 'investigate.start', detail: 'scenario=dns-chaos' } },
      { delayMs: 240, event: { kind: 'llm.call', provider: 'tf-primary', model: 'claude-3.5-sonnet', detail: 'first hypothesis' } },
      { delayMs: 420, event: { kind: 'llm.error', provider: 'tf-primary', detail: 'upstream 503 · brownout detected' } },
      { delayMs: 510, event: { kind: 'provider_fallback', provider: 'ollama', detail: 'rerouted from tf-primary' } },
      { delayMs: 660, event: { kind: 'llm.call', provider: 'ollama', model: 'llama-3.1-8b', detail: 'local fallback' } },
      { delayMs: 920, event: { kind: 'llm.ok', provider: 'ollama', latency_ms: 256, detail: '256 tok' } },
      { delayMs: 1020, event: { kind: 'tool.call', detail: 'kubectl get pods -n triagent-dns' } },
      { delayMs: 1130, event: { kind: 'tool.error', detail: 'kubectl · exit=137 · poisoned by chaos' } },
      { delayMs: 1280, event: { kind: 'resilient.move', detail: 'prometheus substituted for kubectl evidence' } },
      { delayMs: 1410, event: { kind: 'prometheus.query', detail: 'coredns_panic_count_total' } },
      { delayMs: 1560, event: { kind: 'tool.ok', detail: '5 panics in last 60s' } },
      { delayMs: 1660, event: { kind: 'prometheus.query', detail: 'coredns_dns_request_count_total[5m]' } },
      { delayMs: 1820, event: { kind: 'tool.ok', detail: 'request rate dropped 92%' } },
      { delayMs: 1920, event: { kind: 'hypothesis', detail: 'Corefile reload introduced invalid forward stanza' } },
      { delayMs: 2080, event: { kind: 'llm.call', provider: 'tf-verify', model: 'gemini-2.0-flash', detail: 'cross-check' } },
      { delayMs: 2140, event: { kind: 'llm.ok', provider: 'tf-verify', latency_ms: 180, detail: '184 tok' } },
      { delayMs: 2180, event: { kind: 'verdict.ready', detail: 'confidence=0.91 · cost=$0.00041' } },
    ],
  },
}

function rewriteCostForChaos(cost: Record<string, number>, chaos: ChaosState): Record<string, number> {
  if (chaos.killed_providers.length === 0) return cost
  const out: Record<string, number> = { ...cost }
  for (const killed of chaos.killed_providers) {
    const amount = out[killed] ?? 0
    if (amount === 0) continue
    const next = nextAvailableProvider(killed, chaos.killed_providers)
    if (next) out[next] = (out[next] ?? 0) + amount * 1.1
    out[killed] = 0
  }
  return out
}

type Listener = (ev: WSEvent) => void
const listeners = new Set<Listener>()

function emit(type: string, payload: Record<string, unknown>) {
  const ev: WSEvent = { type, ts: Date.now(), payload }
  for (const l of listeners) l(ev)
}

export function startDemoStream() {
  const store = useStore.getState()
  store.setWsStatus('open')
  emit('initial_state', {
    providers: PROVIDERS,
    tools: TOOLS,
    chaos: { killed_providers: [], killed_tools: [], injected_latency_ms: 0, poison_json: false },
    history: [],
  })
  for (const alert of ALERTS) {
    emit('alert', alert as unknown as Record<string, unknown>)
  }
}

export function subscribeDemo(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let activeTimers: ReturnType<typeof setTimeout>[] = []

function clearTimers() {
  activeTimers.forEach((t) => clearTimeout(t))
  activeTimers = []
}

export function playDemoScenario(slug: string): string {
  clearTimers()
  const scenario = SCENARIOS[slug]
  if (!scenario) throw new Error(`unknown demo scenario: ${slug}`)
  const investigationId = `demo-inv-${slug}-${Date.now()}`
  const startedAt = Date.now() / 1000
  const namespace = ALERTS.find((a) => a.slug === slug)?.namespace ?? 'demo'
  const liveChaos = useStore.getState().chaos
  const steps = rewriteStepsForChaos(scenario.steps, liveChaos)

  emit('investigation_state', {
    id: investigationId,
    scenario_slug: slug,
    scenario_id: slug,
    namespace,
    status: 'running',
    phase: 'investigate',
    phase_detail: 'agent investigating',
    started_at: startedAt,
    finished_at: null,
    trace: [],
    error: null,
    result: null,
    tokens_spent: 0,
    token_budget: 10000,
    cost_usd: 0,
    cost_by_provider: {},
  })

  for (const step of steps) {
    activeTimers.push(setTimeout(() => {
      emit('trace_event', { ...step.event, timestamp: Date.now() / 1000, investigation_id: investigationId } as unknown as Record<string, unknown>)
    }, step.delayMs))
  }

  const finalDelay = steps[steps.length - 1].delayMs + 320
  const chaosImpactCost = liveChaos.killed_providers.length * 0.00005 + liveChaos.killed_tools.length * 0.00003
  const reroutedCost = rewriteCostForChaos(scenario.result.cost_by_provider, liveChaos)
  const totalCost = Object.values(reroutedCost).reduce((a, b) => a + b, 0)
  const finalResult = {
    ...scenario.result,
    cost_usd: totalCost + chaosImpactCost,
    cost_by_provider: reroutedCost,
  }
  activeTimers.push(setTimeout(() => {
    emit('investigation_state', {
      id: investigationId,
      scenario_slug: slug,
      scenario_id: slug,
      namespace,
      status: 'done',
      phase: 'verdict',
      phase_detail: 'verdict ready',
      started_at: startedAt,
      finished_at: Date.now() / 1000,
      trace: steps.map((s) => ({ ...s.event, timestamp: startedAt + s.delayMs / 1000, investigation_id: investigationId })),
      error: null,
      result: { scenario_id: slug, namespace, ...finalResult } as Result,
      tokens_spent: finalResult.tokens_spent,
      token_budget: finalResult.token_budget,
      cost_usd: finalResult.cost_usd,
      cost_by_provider: finalResult.cost_by_provider,
    })
  }, finalDelay))

  return investigationId
}

export function demoChaos(action: 'kill_provider' | 'restore_provider' | 'kill_tool' | 'restore_tool' | 'set_latency' | 'clear', target?: string, value?: number) {
  const store = useStore.getState()
  const next = { ...store.chaos }
  let traceKind: string | null = null
  let traceDetail = ''
  let traceProvider: string | undefined

  if (action === 'kill_provider' && target) {
    next.killed_providers = Array.from(new Set([...next.killed_providers, target]))
    traceKind = 'chaos_inject'
    traceProvider = target
    traceDetail = `provider ${target} killed by operator`
  } else if (action === 'restore_provider' && target) {
    next.killed_providers = next.killed_providers.filter((p) => p !== target)
    traceKind = 'chaos_clear'
    traceProvider = target
    traceDetail = `provider ${target} restored`
  } else if (action === 'kill_tool' && target) {
    next.killed_tools = Array.from(new Set([...next.killed_tools, target]))
    traceKind = 'chaos_inject'
    traceDetail = `tool ${target} quarantined by operator`
  } else if (action === 'restore_tool' && target) {
    next.killed_tools = next.killed_tools.filter((t) => t !== target)
    traceKind = 'chaos_clear'
    traceDetail = `tool ${target} restored`
  } else if (action === 'set_latency' && typeof value === 'number') {
    next.injected_latency_ms = value
    traceKind = 'chaos_inject'
    traceDetail = `latency injected · +${value}ms`
  } else if (action === 'clear') {
    next.killed_providers = []
    next.killed_tools = []
    next.injected_latency_ms = 0
    next.poison_json = false
    traceKind = 'chaos_clear'
    traceDetail = 'all chaos cleared'
  }

  emit('chaos_state', next as unknown as Record<string, unknown>)

  if (traceKind) {
    const inv = useStore.getState().investigation
    emit('trace_event', {
      kind: traceKind,
      provider: traceProvider,
      detail: traceDetail,
      timestamp: Date.now() / 1000,
      investigation_id: inv?.id,
    } as unknown as Record<string, unknown>)
  }
}
