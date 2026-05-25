const API = '/api'

async function ok<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export async function startInvestigation(slug: string) {
  const r = await fetch(`${API}/investigations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: slug, wait_seconds: 35 }),
  })
  return ok<{ id: string; status: string; phase: string }>(r)
}

export async function killProvider(name: string) {
  return ok(await fetch(`${API}/chaos/kill_provider/${name}`, { method: 'POST' }))
}
export async function restoreProvider(name: string) {
  return ok(await fetch(`${API}/chaos/restore_provider/${name}`, { method: 'POST' }))
}
export async function killTool(name: string) {
  return ok(await fetch(`${API}/chaos/kill_tool/${name}`, { method: 'POST' }))
}
export async function restoreTool(name: string) {
  return ok(await fetch(`${API}/chaos/restore_tool/${name}`, { method: 'POST' }))
}
export async function setLatency(ms: number) {
  return ok(await fetch(`${API}/chaos/set_latency?ms=${ms}`, { method: 'POST' }))
}
export async function clearChaos() {
  return ok(await fetch(`${API}/chaos/clear`, { method: 'POST' }))
}

export async function replayInvestigation(
  id: string,
  chaos_override: Record<string, unknown>,
  from_step: number,
) {
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
  return ok(await fetch(`${API}/incidents`))
}

const ENGINE = '/engine'
export async function triggerScenario(slug: string) {
  return ok(await fetch(`${ENGINE}/scenarios/trigger/${slug}`, { method: 'POST' }))
}
export async function resetScenarios() {
  return ok(await fetch(`${ENGINE}/scenarios/reset`, { method: 'POST' }))
}
