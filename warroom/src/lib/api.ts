import { isDemoMode, playDemoScenario, demoChaos } from '@/lib/demo-mode'

const API = '/api'

async function ok<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export async function startInvestigation(slug: string) {
  if (isDemoMode()) {
    const id = playDemoScenario(slug)
    return { id, status: 'running', phase: 'investigate' }
  }
  const r = await fetch(`${API}/investigations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: slug, wait_seconds: 35 }),
  })
  return ok<{ id: string; status: string; phase: string }>(r)
}

export async function killProvider(name: string) {
  if (isDemoMode()) { demoChaos('kill_provider', name); return {} }
  return ok(await fetch(`${API}/chaos/kill_provider/${name}`, { method: 'POST' }))
}
export async function restoreProvider(name: string) {
  if (isDemoMode()) { demoChaos('restore_provider', name); return {} }
  return ok(await fetch(`${API}/chaos/restore_provider/${name}`, { method: 'POST' }))
}
export async function killTool(name: string) {
  if (isDemoMode()) { demoChaos('kill_tool', name); return {} }
  return ok(await fetch(`${API}/chaos/kill_tool/${name}`, { method: 'POST' }))
}
export async function restoreTool(name: string) {
  if (isDemoMode()) { demoChaos('restore_tool', name); return {} }
  return ok(await fetch(`${API}/chaos/restore_tool/${name}`, { method: 'POST' }))
}
export async function setLatency(ms: number) {
  if (isDemoMode()) { demoChaos('set_latency', undefined, ms); return {} }
  return ok(await fetch(`${API}/chaos/set_latency?ms=${ms}`, { method: 'POST' }))
}
export async function clearChaos() {
  if (isDemoMode()) { demoChaos('clear'); return {} }
  return ok(await fetch(`${API}/chaos/clear`, { method: 'POST' }))
}

export async function replayInvestigation(
  id: string,
  chaos_override: Record<string, unknown>,
  from_step: number,
) {
  if (isDemoMode()) {
    return { id: `${id}-cf`, status: 'running', phase: 'investigate', counterfactual_of: id }
  }
  const r = await fetch(`${API}/investigations/${id}/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chaos_override, from_step }),
  })
  return ok<{ id: string; status: string; phase: string; counterfactual_of: string }>(r)
}

export async function listIncidents(): Promise<Array<{
  slug: string
  id: string
  name: string
  namespace: string
  expected_root_cause?: string
  alert_summary?: string
  latest_investigation_id?: string
  latest_status?: string
}>> {
  if (isDemoMode()) return []
  return ok(await fetch(`${API}/incidents`))
}

const ENGINE = '/engine'
export async function triggerScenario(slug: string) {
  if (isDemoMode()) return { ok: true, slug }
  return ok(await fetch(`${ENGINE}/scenarios/trigger/${slug}`, { method: 'POST' }))
}
export async function resetScenarios() {
  if (isDemoMode()) return { ok: true }
  return ok(await fetch(`${ENGINE}/scenarios/reset`, { method: 'POST' }))
}
