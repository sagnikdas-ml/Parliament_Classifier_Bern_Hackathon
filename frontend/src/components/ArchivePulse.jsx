import { useEffect, useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { getArchiveRun } from '../lib/api.js'
import { BODY_NAMES } from '../lib/bodies.js'
import CalmGraph from './CalmGraph.jsx'

const mins = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)

/** Live status for the continuous APS archive classification run. */
export default function ArchivePulse() {
  const [state, setState] = useState({ phase: 'loading' })
  useEffect(() => {
    let alive = true
    const load = async () => { try { const run = await getArchiveRun(); if (alive) setState({ phase: 'done', run }) } catch (e) { if (alive) setState({ phase: 'error', message: e.message }) } }
    load(); const timer = setInterval(load, 6000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  const run = state.run
  const done = run ? (run.progress || []).filter((p) => p.status === 'done').reduce((s, p) => s + p.count, 0) : 0
  const q = run?.quality?.scores
  const topics = (run?.topic_graph?.nodes || run?.topic_distribution || []).slice(0, 8).map((t) => ({
    id: String(t.topic_id || t.id || t.name), label: t.name || t.topic_id || t.id,
    value: Number(t.count || t.affairs || 0).toLocaleString('en-CH'), meta: 'APS topic · affairs classified', kind: 'topic',
  }))
  const topicEdges = (run?.topic_graph?.edges || []).map((e) => ({ source: String(e.source), target: String(e.target), weight: e.weight }))
  const examples = run?.topic_examples || []
  return <div className="mt-8">
    <div className="flex items-center gap-2 text-[13px] text-muted">{state.phase === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />} Continuous archive classification</div>
    {state.phase === 'error' && <p className="mt-3 text-[13px] text-bad">Backend not reachable: {state.message}</p>}
    {state.phase === 'done' && !run && <p className="mt-3 text-[13px] text-muted">No archive run yet — import the archive first.</p>}
    {run && <div className="card mt-4 grid gap-6 p-6 md:grid-cols-2">
      <div><div className="label">Progress · {run.status}</div><div className="mt-1 font-serif text-[32px] leading-none text-ink">{done.toLocaleString('en-CH')}<span className="text-[18px] text-muted"> / {Number(run.total).toLocaleString('en-CH')}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full bg-accent transition-all duration-700" style={{ width: `${run.total ? (100 * done) / run.total : 0}%` }} /></div><div className="mt-2 text-[13px] text-muted">{run.live_cases_per_minute ? `${run.live_cases_per_minute.toFixed(1)} cases/min` : 'rate not measured yet'} · est. remaining {mins(run.live_estimated_remaining_seconds)}</div></div>
      <div><div className="label">Model-judge agreement</div>{q ? <><div className="mt-1 font-serif text-[32px] leading-none text-ink">{Math.round(100 * q.micro_f1)}%<span className="text-[15px] text-muted"> micro-F1</span></div><div className="mt-2 text-[13px] text-muted">{run.quality.reviewed} judged · exact topic match {Math.round(100 * q.exact_match)}%</div></> : <div className="mt-1 text-[14px] text-muted">No judged cases yet.</div>}<div className="mt-1 text-[12px] text-muted">Agreement with a second LLM (70B), not human-verified accuracy.</div></div>
      <div className="min-w-0 md:col-span-2">
        <div className="label text-[15px]">Topic relationships · highest volume first</div>
        <CalmGraph nodes={topics} edges={topicEdges} sourceLabel="APS archive classification" empty="Topics will appear as affairs receive classifications." large showTopicLinks={false} />
      </div>
      <div className="min-w-0 md:col-span-2">
        <div className="label text-[15px]">Four affairs · richest topic coverage</div>
        <p className="mt-1 text-[13px] text-muted">Examples from completed classifications. Each graph connects one affair to the APS topics assigned to it.</p>
        {examples.length ? <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {examples.map((affair) => {
            const nodes = (affair.labels || []).map((label) => ({
              id: String(label.topic_id), label: label.name || label.topic_id,
              meta: label.chapter ? `APS ${label.chapter.code || ''} · ${label.chapter.de || label.chapter.fr || ''}` : `APS topic · ${label.topic_id}`,
              kind: 'topic',
            }))
            const level = affair.body === 'CHE' ? 'Federal' : /^[A-Z]{2}$/.test(affair.body || '') ? 'Cantonal' : 'Municipal'
            return <article key={affair.affair_id} className="min-w-0 rounded-xl border border-line bg-surface/60 p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="meta font-medium text-accent">{affair.number || affair.affair_id}</span>
                <span className="meta">{affair.body_name || BODY_NAMES[affair.body] || affair.body}</span>
                <span className="meta">{level}{affair.language ? ` · ${affair.language.toUpperCase()}` : ''}</span>
                {affair.date && <span className="meta">{affair.date}</span>}
              </div>
              <h3 className="mt-2 line-clamp-2 font-serif text-[19px] font-medium leading-snug text-ink">{affair.title}</h3>
              <CalmGraph nodes={nodes} sourceLabel={`Affair ${affair.affair_id}`} empty="No topics assigned." large />
              {affair.url && <a className="mt-3 inline-block text-[12px] text-accent hover:underline" href={affair.url} target="_blank" rel="noreferrer">Open source record ↗</a>}
            </article>
          })}
        </div> : <p className="mt-3 text-[13px] text-muted">Completed affairs with topic labels will appear here.</p>}
      </div>
    </div>}
  </div>
}
