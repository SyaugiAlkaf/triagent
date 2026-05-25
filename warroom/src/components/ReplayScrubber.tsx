import { useState } from 'react'
import { useStore } from '@/store/store'
import { Rewind, Sparkles, Zap } from 'lucide-react'
import { replayInvestigation } from '@/lib/api'

export function ReplayScrubber() {
  const trace = useStore((s) => s.traceEvents)
  const inv = useStore((s) => s.investigation)
  const replayIndex = useStore((s) => s.replayIndex)
  const setReplayIndex = useStore((s) => s.setReplayIndex)
  const [whatIf, setWhatIf] = useState(false)
  const [committing, setCommitting] = useState(false)

  const status = inv?.status ?? 'idle'
  if (status !== 'done' && status !== 'failed') return null
  if (trace.length === 0) return null

  const total = trace.length
  const index = replayIndex ?? total

  const commitCounterfactual = async (override: Record<string, unknown>) => {
    if (!inv?.id) return
    setCommitting(true)
    try {
      await replayInvestigation(inv.id, override, index)
      setWhatIf(false)
    } catch (err) {
      console.error('replay failed', err)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="border-t border-border bg-bg-elevated px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim flex items-center gap-1.5">
          <Rewind size={12} /> REPLAY
        </span>
        <input
          type="range"
          min={1}
          max={total}
          value={index}
          onChange={(e) => setReplayIndex(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="font-mono text-xs text-text-dim tabular-nums">
          {index} / {total}
        </span>
        <button
          onClick={() => setReplayIndex(null)}
          className="font-mono text-[10px] uppercase tracking-widest text-text-dim hover:text-accent border border-border rounded px-2 py-1"
        >
          live
        </button>
        <button
          onClick={() => setWhatIf((v) => !v)}
          className={
            'font-mono text-[10px] uppercase tracking-widest border rounded px-2 py-1 inline-flex items-center gap-1 ' +
            (whatIf
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border text-text-dim hover:text-accent')
          }
        >
          <Sparkles size={11} /> WHAT IF
        </button>
      </div>

      {whatIf && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-dim">
            inject at step {index} →
          </span>
          {[
            { label: 'Kill Groq', override: { killed_providers: ['groq'] } },
            { label: 'Kill Ollama', override: { killed_providers: ['ollama'] } },
            { label: 'Kill kubectl', override: { killed_tools: ['kubectl'] } },
            { label: 'Inject 12s', override: { injected_latency_ms: 12000 } },
          ].map((c) => (
            <button
              key={c.label}
              disabled={committing}
              onClick={() => commitCounterfactual(c.override)}
              className="font-mono text-[10px] uppercase tracking-widest border border-border rounded px-2 py-1 text-text hover:border-accent hover:text-accent inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Zap size={11} /> {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReplayScrubber
