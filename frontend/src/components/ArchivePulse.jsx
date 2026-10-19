import { useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { getArchiveRun } from '../lib/api.js'

const mins = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

/** Opt-in view of the backend's archive-wide APS classification run. Not polled automatically: the backend may start the
 *  run when asked for its jobs, so the user decides when to look. */
export default function ArchivePulse() {
  const [state, setState] = useState({ phase: 'idle' })
  const load = async () => {
    setState({ phase: 'loading' })
    try { setState({ phase: 'done', run: await getArchiveRun() }) } catch (e) { setState({ phase: 'error', message: e.message }) }
  }
  const run = state.run
  const done = run ? (run.progress || []).filter((p) => p.status === 'done').reduce((s, p) => s + p.count, 0) : 0
  const q = run?.quality?.scores
  const topics = (run?.topic_distribution || []).slice(0, 5)
  const max = Math.max(1, ...topics.map((t) => t.count || t.affairs || 0))
  return (
    <div className="mt-8">
      <button onClick={load} disabled={state.phase === 'loading'} className="btn-quiet !py-2 text-[13px]">
        {state.phase === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />} Archive run status
      </button>
      <span className="ml-3 text-[12px] text-muted">Looking this up may start the backend's archive classification job.</span>

      {state.phase === 'error' && <p className="mt-3 text-[13px] text-bad">Backend not reachable: {state.message}. This panel needs the live backend.</p>}
      {state.phase === 'done' && !run && <p className="mt-3 text-[13px] text-muted">No archive run yet — import the archive first (<span className="font-mono">python -m parliament bootstrap</span>).</p>}
      {run && (
        <div className="card mt-4 grid gap-6 p-6 md:grid-cols-[1fr_1fr_1.3fr]">
          <div>
            <div className="label">Progress · {run.status}</div>
            <div className="mt-1 font-serif text-[32px] leading-none text-ink">{done.toLocaleString('en-CH')}<span className="text-[18px] text-muted"> / {Number(run.total).toLocaleString('en-CH')}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${run.total ? (100 * done) / run.total : 0}%` }} /></div>
            <div className="mt-2 text-[13px] text-muted">{run.live_cases_per_minute ? `${run.live_cases_per_minute.toFixed(1)} cases/min` : 'rate not measured yet'} · est. remaining {mins(run.live_estimated_remaining_seconds)}</div>
            <div className="mt-1 text-[12px] text-muted">Estimates extrapolate linearly from this run; they are not guarantees.</div>
          </div>
          <div>
            <div className="label">Model-judge agreement</div>
            {q ? (
              <>
                <div className="mt-1 font-serif text-[32px] leading-none text-ink">{Math.round(100 * q.micro_f1)}%<span className="text-[15px] text-muted"> micro-F1</span></div>
                <div className="mt-2 text-[13px] text-muted">{run.quality.reviewed} judged · exact topic match {Math.round(100 * q.exact_match)}%</div>
              </>
            ) : <div className="mt-1 text-[14px] text-muted">No judged cases yet.</div>}
            <div className="mt-1 text-[12px] text-muted">Agreement with a second LLM (70B), not human-verified accuracy.</div>
          </div>
          <div>
            <div className="label">Top APS topics so far</div>
            <div className="mt-2 space-y-1.5">
              {topics.length ? topics.map((t) => {
                const n = t.count || t.affairs || 0
                return (
                  <div key={t.topic_id || t.name} className="flex items-center gap-2 text-[13px]">
                    <span className="w-40 truncate text-ink">{t.name || t.topic_id}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk"><span className="block h-full rounded-full bg-aps/70" style={{ width: `${(100 * n) / max}%` }} /></span>
                    <span className="w-10 text-right font-mono text-[12px] text-muted">{n}</span>
                  </div>
                )
              }) : <div className="text-[14px] text-muted">Nothing classified yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
