import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, FileSearch, Quote, RotateCcw, ShieldCheck, ShieldX, X } from 'lucide-react'
import { analyseText } from '../lib/api.js'
import { DEMO_ARTICLE } from '../lib/mock.js'
import { Cursor, useTypewriter } from '../components/Typewriter.jsx'
import { Segmented, Switch, norm } from '../components/ui.jsx'

// verdict -> theme colour variable (muted sage / terracotta / ochre)
const COL = { supported: 'var(--ok)', contradicted: 'var(--bad)', unverified: 'var(--warn)', error: 'var(--warn)', not_factual: 'var(--muted)' }
const TXT = { supported: 'text-ok', contradicted: 'text-bad', unverified: 'text-warn', error: 'text-warn', not_factual: 'text-muted' }
const LABEL = { supported: 'Supported by the archive', contradicted: 'Contradicted by the archive', unverified: 'Unverified', not_factual: 'Opinion, not a factual claim', error: 'Not checked' }
const LANGS = ['DE', 'FR', 'IT', 'RM', 'EN']
const RANK = { contradicted: 4, unverified: 3, error: 3, supported: 2, not_factual: 1 }
const rgb = (v, a) => `rgb(${v} / ${a})`

/** Sentence verdict = the most serious claim verdict inside it ('neutral' for apolitical text, null while pending). */
function verdictOf(entry) {
  if (!entry) return null
  if (entry.state === 'error') return 'error'
  const claims = entry.result.claims || []
  if (entry.result.scope === 'apolitical' && claims.every((c) => !['supported', 'contradicted'].includes(c.verdict))) return 'neutral'
  return claims.reduce((w, c) => (RANK[c.verdict] > RANK[w] ? c.verdict : w), 'not_factual')
}

function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => { const mq = window.matchMedia(q), f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q])
  return m
}

// ---------------------------------------------------------------------------------------------- inline sentence
const Sentence = forwardRef(function Sentence({ text, entry, scanning, selected, onPick }, ref) {
  const v = verdictOf(entry), col = COL[v]
  return (
    <motion.span ref={ref} onClick={col ? onPick : undefined} role={col ? 'button' : undefined} tabIndex={col ? 0 : undefined}
      onKeyDown={col ? (e) => (e.key === 'Enter' || e.key === ' ') && onPick(e) : undefined}
      className={`box-decoration-clone rounded-[3px] px-0.5 ${col ? 'cursor-pointer' : ''}`}
      // text stays readable while pending (soft dimming only); the verdict draws a calm underline and a faint wash
      animate={{ opacity: entry ? 1 : scanning ? 0.5 : 1, backgroundColor: col ? rgb(col, selected ? 0.2 : 0.1) : 'rgba(0,0,0,0)' }}
      transition={{ duration: 0.9 }}
      style={col ? { boxShadow: `inset 0 -2px 0 ${rgb(col, 0.75)}` } : undefined}
      whileHover={col ? { backgroundColor: rgb(col, 0.2) } : undefined}>
      {text}
    </motion.span>
  )
})

// ---------------------------------------------------------------------------------------------- margin note
function Dossier({ claim, affair }) {
  const ev = claim.evidence?.[0]
  const { shown, done } = useTypewriter(ev?.quote || '', { speed: 12, start: !!ev })
  if (!ev) return null
  const ok = ev.server ? true : norm(ev.source).includes(norm(ev.quote))
  const author = affair?.authors?.length ? affair.authors.map((x) => (x.party ? `${x.name} (${x.party})` : x.name)).join(', ') : 'not listed in the record'
  return (
    <div className="mt-4 space-y-3">
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
        <dt className="text-muted">Source ID</dt><dd className="font-mono text-[13px] font-medium text-ink">OpenParlData {ev.affairId}</dd>
        {affair && <><dt className="text-muted">Affair</dt><dd className="font-serif text-[15px] leading-snug text-ink">{affair.number} — {affair.title}</dd></>}
        <dt className="text-muted">Author</dt><dd className="text-ink">{author}</dd>
        {affair?.date && <><dt className="text-muted">Record</dt><dd className="text-ink">{affair.date}</dd></>}
      </dl>
      <div className="rounded-xl border border-line bg-sunk p-4">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] text-muted"><Quote size={12} /> Verbatim archive quotation (original language)</div>
        <p className="font-mono text-[13px] leading-relaxed text-ink">{shown}{!done && <Cursor />}</p>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mt-3 flex items-center gap-1.5 text-[13px] ${ok ? 'text-ok' : 'text-bad'}`}>
            {ok ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
            {ok ? (ev.server ? 'Verified by the backend: exact passage of the source' : 'Verified: a verbatim passage of the source') : 'Rejected: not found in the source'}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function Marginalia({ entry, index, onClose, review, setReview }) {
  const r = entry.result
  return (
    <div className="card relative p-6">
      <div className="flex items-center">
        <span className="text-[13px] text-muted">Sentence {index + 1}</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:text-ink"><X size={17} /></button>
      </div>
      {(r.claims || []).map((c, i) => {
        const affair = c.evidence?.[0] && r.affairs.find((a) => a.id === c.evidence[0].affairId)
        return (
          <div key={i} className={i ? 'mt-6 border-t border-line pt-5' : 'mt-2'}>
            <div className={`flex items-center gap-2 text-[16px] font-medium ${TXT[c.verdict] || 'text-ink'}`}>
              {c.verdict === 'supported' ? <Check size={17} /> : c.verdict === 'contradicted' ? <X size={17} /> : <CircleAlert size={17} />}
              {LABEL[c.verdict]}
            </div>
            <p className="mt-2 font-serif text-[16px] italic leading-snug text-muted">{c.explanation}</p>
            <Dossier claim={c} affair={affair} />
            {c.correction && (
              <div className="mt-4 rounded-xl border border-ok/30 bg-ok/10 p-3.5">
                <div className="text-[12px] font-medium text-ok">Suggested correction</div>
                <p className="mt-1 font-serif text-[16px] leading-snug text-ink">{c.correction}</p>
              </div>
            )}
          </div>
        )
      })}
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <div>
          <div className="text-[14px] font-medium text-ink">Human review</div>
          <div className="text-[12px] text-muted">{review ? 'Marked for an editor' : 'Machine output, not yet reviewed'}</div>
        </div>
        <Switch on={review} onChange={setReview} label="Mark for human review" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------- view
/** Fact-check view: paste a story, a soft scan line reads it, verdicts appear inline, notes open in the margin. */
export default function Scanner({ backendReady, autoRun = false }) {
  const [text, setText] = useState(DEMO_ARTICLE)
  const [language, setLanguage] = useState('EN')
  const [model, setModel] = useState('70B')
  const [forceDemo, setForceDemo] = useState(false)
  const [phase, setPhase] = useState('edit') // edit | scanning | done
  const [scanText, setScanText] = useState('')
  const [sentences, setSentences] = useState([])
  const [entries, setEntries] = useState({})
  const [live, setLive] = useState(false)
  const [selected, setSelected] = useState(null)
  const [reviews, setReviews] = useState({})
  const [beam, setBeam] = useState({ y: 0, h: 0 })
  const wrap = useRef(null), spans = useRef({}), abort = useRef(null)
  const wide = useMedia('(min-width: 1340px)')
  const doneCount = Object.keys(entries).length, total = sentences.length

  const run = useCallback(async () => {
    abort.current = new AbortController()
    setScanText(text); setSentences([]); setEntries({}); setSelected(null); setReviews({}); setPhase('scanning')
    try {
      await analyseText({
        text, language, model, useLive: backendReady && !forceDemo, signal: abort.current.signal,
        onStart: (list, isLive) => { setSentences(list); setLive(isLive) },
        onSentence: (i, result, error) => setEntries((e) => ({ ...e, [i]: { state: error ? 'error' : 'done', result, error } })),
      })
    } finally { setPhase('done') }
  }, [text, language, model, backendReady, forceDemo])

  useEffect(() => { if (autoRun) run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // the scan line follows the real line boxes: it rests at the bottom of the sentence currently being read
  useLayoutEffect(() => {
    if (phase === 'edit' || !wrap.current) return
    const box = wrap.current.getBoundingClientRect()
    const el = spans.current[Math.min(doneCount, total - 1)]
    const rects = el ? el.getClientRects() : []
    setBeam({ y: phase === 'done' ? box.height + 24 : rects.length ? rects[rects.length - 1].bottom - box.top : 0, h: box.height })
  }, [phase, doneCount, total, sentences])

  const pick = (i) => (e) => {
    e.stopPropagation()
    const box = wrap.current.getBoundingClientRect(), rects = spans.current[i].getClientRects(), last = rects[rects.length - 1]
    setSelected({ index: i })
  }
  useEffect(() => { const esc = (e) => e.key === 'Escape' && setSelected(null); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [])

  const pieces = useMemo(() => {
    const out = []; let pos = 0
    sentences.forEach((s, i) => { if (s.start > pos) out.push({ gap: scanText.slice(pos, s.start), k: `g${i}` }); out.push({ i, s }); pos = s.end })
    if (pos < scanText.length) out.push({ gap: scanText.slice(pos), k: 'tail' })
    return out
  }, [sentences, scanText])

  const verdicts = Object.values(entries).map(verdictOf)
  const count = (v) => verdicts.filter((x) => x === v).length
  const reviewCount = Object.values(reviews).filter(Boolean).length
  const scanning = phase === 'scanning'
  const sel = selected && entries[selected.index]
  const noteProps = sel && { entry: sel, index: selected.index, onClose: () => setSelected(null), review: !!reviews[selected.index], setReview: () => setReviews((r) => ({ ...r, [selected.index]: !r[selected.index] })) }
  
  return (
    <section className="flex min-h-screen flex-col items-center px-6 pb-40 pt-32" onClick={() => setSelected(null)}>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-9 text-center">
        <div className="label text-accent">Fact-check</div>
        <h1 className="mt-3 font-serif text-[clamp(32px,4vw,56px)] font-medium leading-[1.1] tracking-tight text-ink">
          Paste the story. <em className="text-accent">We read the record.</em>
        </h1>
      </motion.div>

      <motion.div animate={{ x: selected && wide ? -220 : 0 }} transition={{ type: 'spring', stiffness: 150, damping: 26 }} className="relative w-full max-w-[860px]" onClick={(e) => e.stopPropagation()}>
      <div className="mb-4 flex min-h-[40px] w-full items-center justify-between text-[14px]">
        {phase === 'edit' ? <span className="text-muted">Up to 40 sentences. Each is checked separately.</span> : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-muted">{scanning ? `Reading ${doneCount} of ${total}…` : 'Done'}</span>
            <span className="text-ok">{count('supported')} supported</span>
            <span className="text-bad">{count('contradicted')} contradicted</span>
            <span className="text-warn">{count('unverified') + count('error')} unverified</span>
            <span className="text-muted">{reviewCount} marked for review</span>
          </div>
        )}
        {phase !== 'edit' && (
          <button onClick={() => { abort.current?.abort(); setPhase('edit'); setSelected(null) }} className="btn-quiet !px-4 !py-1.5 text-[13px]"><RotateCcw size={13} /> {scanning ? 'Stop' : 'New check'}</button>
        )}
      </div>

        <div className="card px-12 py-10">
          {phase === 'edit' ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} spellCheck={false} placeholder="Paste a news article here…"
              className="w-full resize-none bg-transparent font-serif text-[21px] leading-[1.75] text-ink outline-none" />
          ) : (
            <div ref={wrap} className="relative whitespace-pre-wrap font-serif text-[21px] leading-[1.75] text-ink">
              {pieces.map((p) => p.gap !== undefined
                ? <span key={p.k}>{p.gap}</span>
                : <Sentence key={p.i} ref={(el) => { spans.current[p.i] = el }} text={p.s.text} entry={entries[p.i]} scanning={scanning} selected={selected?.index === p.i} onPick={pick(p.i)} />)}

              {/* soft scan line */}
              <motion.div className="pointer-events-none absolute -inset-x-10 top-0 z-10" initial={false} animate={{ y: beam.y, opacity: scanning ? 1 : 0 }}
                transition={{ y: { duration: scanning ? (live ? 5 : 0.9) : 1, ease: 'easeInOut' }, opacity: { duration: 0.8 } }}>
                <div className="absolute bottom-0 h-20 w-full bg-gradient-to-t from-accent/12 to-transparent" />
                <div className="h-px w-full bg-accent/70" />
              </motion.div>

            </div>
          )}
        </div>

        {phase === 'edit' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-7 flex flex-col items-center gap-5">
            <button onClick={run} disabled={!text.trim()} className="btn-primary !px-8 !py-3.5 text-[15px]"><FileSearch size={18} /> Check this story</button>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2"><span className="label">Language</span><Segmented id="scan-lang" label="Language" value={language} onChange={setLanguage} options={LANGS} /></div>
              <div className="flex items-center gap-2"><span className="label">Model</span>
                <Segmented id="scan-model" label="Model" value={model} onChange={setModel}
                  options={[{ value: '8B', label: 'Apertus 8B', title: 'Faster, lighter' }, { value: '70B', label: 'Apertus 70B', title: 'Default' }]} /></div>
            </div>
            {backendReady && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" checked={forceDemo} onChange={(e) => setForceDemo(e.target.checked)} className="accent-[rgb(var(--accent))]" /> Use demo data instead (saves Apertus credits)
              </label>
            )}
            <p className="max-w-md text-center text-[13px] text-muted">No archive match never means a claim is false: it stays unverified. This is machine output, so publish only after human review.</p>
          </motion.div>
        )}
        {phase !== 'edit' && !scanning && (
          <p className="mt-6 text-center text-[13px] text-muted">{live ? 'Live archive' : 'Demo data: real records, illustrative verdicts'} · click an underlined sentence · Esc to close</p>
        )}
      </motion.div>

      {/* margin note: fixed to the viewport and rendered OUTSIDE the transformed canvas (a transform would trap `fixed`) */}
      <AnimatePresence>
        {selected && sel && wide && (
          <motion.aside key="note" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.45, ease: 'easeOut' }}
            className="fixed right-8 top-28 z-30 w-[400px] overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(100vh - 220px)' }} onClick={(e) => e.stopPropagation()}>
            <Marginalia {...noteProps} />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && sel && !wide && (
          <motion.div key="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed inset-x-3 bottom-24 z-50 max-h-[62vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <Marginalia {...noteProps} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
