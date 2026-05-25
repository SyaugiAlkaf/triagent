import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export function EvalModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('triagent:open-eval-modal', onOpen as EventListener)
    return () => window.removeEventListener('triagent:open-eval-modal', onOpen as EventListener)
  }, [])

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[78vw] max-w-[1100px] max-h-[88vh] overflow-auto bg-bg-elevated border border-border-strong rounded-2xl p-6"
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 text-text-dim hover:text-text"
          aria-label="close"
        >
          <X size={20} />
        </button>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim mb-1">
          CHAOS EVAL · 120 RUNS
        </div>
        <div className="text-text-strong text-xl font-semibold">
          baseline collapses · triagent holds
        </div>
        <div className="text-text-dim text-xs mt-1 font-mono">
          3 scenarios × 4 chaos modes × 2 systems × 5 replicas
        </div>

        <img
          src="/chaos_eval.png"
          alt="Chaos resilience: baseline vs triagent across four chaos modes"
          className="mt-5 w-full rounded-lg border border-border bg-bg-card"
        />

        <table className="mt-5 w-full text-sm font-mono">
          <thead>
            <tr className="text-text-dim text-left">
              <th className="py-2 font-normal uppercase tracking-widest text-[10px]">system</th>
              <th className="font-normal uppercase tracking-widest text-[10px]">no chaos</th>
              <th className="font-normal uppercase tracking-widest text-[10px]">provider kill</th>
              <th className="font-normal uppercase tracking-widest text-[10px]">tool kill</th>
              <th className="font-normal uppercase tracking-widest text-[10px]">combined</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-2 text-text-dim">baseline</td>
              <td className="text-center text-text">100%</td>
              <td className="text-center text-danger">0%</td>
              <td className="text-center text-danger">0%</td>
              <td className="text-center text-danger">0%</td>
            </tr>
            <tr className="border-t border-border">
              <td className="py-2 text-accent font-semibold">triagent</td>
              <td className="text-center text-success">100%</td>
              <td className="text-center text-success">100%</td>
              <td className="text-center text-success">100%</td>
              <td className="text-center text-success">100%</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 text-text-dim text-xs leading-relaxed">
          Method: identical agent code path. Baseline = single-provider gateway,
          no fallback chain. Triagent = full resilience layer (brownout-aware
          fallback + MCP tool quarantine + latency-aware routing + cross-provider
          ensemble verify + cost-aware reorder).
        </div>
      </div>
    </div>
  )
}

export default EvalModal
