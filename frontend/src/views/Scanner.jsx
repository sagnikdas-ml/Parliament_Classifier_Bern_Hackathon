import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, FileSearch, Quote, RotateCcw, ShieldCheck, ShieldX, X } from 'lucide-react'
import { analyseText, translateSentence } from '../lib/api.js'
import { Cursor, useTypewriter } from '../components/Typewriter.jsx'
import { Segmented, Switch, norm } from '../components/ui.jsx'
import CalmGraph from '../components/CalmGraph.jsx'
import { scannerBotContext } from '../lib/polibot.js'
import { useBotPublisher } from '../components/PoliBotProvider.jsx'

// verdict -> theme colour variable (muted sage / terracotta / ochre)
const COL = { supported: 'var(--ok)', contradicted: 'var(--bad)', unverified: 'var(--warn)', error: 'var(--warn)', not_factual: 'var(--muted)', neutral: 'var(--muted)' }
const TXT = { supported: 'text-ok', contradicted: 'text-bad', unverified: 'text-warn', error: 'text-warn', not_factual: 'text-muted', neutral: 'text-muted' }
const LABEL = { supported: 'Supported by the archive', contradicted: 'Contradicted by the archive', unverified: 'Unverified', not_factual: 'Opinion, not a factual claim', error: 'Not checked', neutral: 'Apolitical — excluded from fact-checking' }
const TRANSLATION_PRIORITY = ['EN', 'DE', 'FR', 'IT', 'RM']
const RANK = { contradicted: 4, unverified: 3, error: 3, supported: 2, not_factual: 1 }
const rgb = (v, a) => `rgb(${v} / ${a})`

/** Sentence verdict = the most serious claim verdict inside it ('neutral' for apolitical text, null while pending). */
function verdictOf(entry) {
  if (!entry) return null
  if (entry.state === 'error') return 'error'
  if (!entry.result) return 'error'
  const claims = entry.result.claims || []
  if (entry.result.scope === 'apolitical' && claims.every((c) => !['supported', 'contradicted'].includes(c.verdict))) return 'neutral'
  return claims.reduce((w, c) => (RANK[c.verdict] > RANK[w] ? c.verdict : w), 'not_factual')
}

function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => { const mq = window.matchMedia(q), f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f) }, [q])
  return m
}

function readHistory() {
  try { const value = JSON.parse(localStorage.getItem('polinews.calm-history.v1') || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
const mergeTranslation = (entry, translated) => ({
  ...entry,
  result: {
    ...entry.result,
    scope_explanation: translated.scope_explanation || entry.result.scope_explanation,
    review_notice: translated.review_notice || entry.result.review_notice,
    claims: (entry.result.claims || []).map((claim, i) => ({
      ...claim,
      explanation: translated.claims?.[i]?.explanation ?? claim.explanation,
      correction: translated.claims?.[i]?.correction ?? claim.correction,
    })),
  },
})

// ---------------------------------------------------------------------------------------------- inline sentence
const Sentence = forwardRef(function Sentence({ text, entry, scanning, selected, onPick, onHover }, ref) {
  const v = verdictOf(entry), col = COL[v]
  return (
    <motion.span ref={ref} onClick={col ? onPick : undefined} onMouseEnter={col ? () => onHover(true) : undefined} onMouseLeave={col ? () => onHover(false) : undefined} role={col ? 'button' : undefined} tabIndex={col ? 0 : undefined}
      onKeyDown={col ? (e) => (e.key === 'Enter' || e.key === ' ') && onPick(e) : undefined}
      className={`box-decoration-clone rounded-[3px] px-0.5 ${col ? 'cursor-pointer' : ''}`}
      // Keep the sentence surface clear; verdicts use an underline only.
      animate={{ opacity: entry ? 1 : scanning ? 0.5 : 1 }}
      transition={{ duration: 0.9 }}
      style={col ? { boxShadow: `inset 0 -${selected ? 3 : 2}px 0 ${rgb(col, 0.9)}` } : undefined}>
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
        {affair && <><dt className="text-muted">Source</dt><dd className="font-serif text-[15px] leading-snug text-ink">{affair.url ? <a href={affair.url} target="_blank" rel="noreferrer" className="hover:underline">{affair.title} ↗</a> : affair.title}</dd></>}
        <dt className="text-muted">Author</dt><dd className="text-ink">{author}</dd>
        {affair?.date && <><dt className="text-muted">Record date</dt><dd className="text-ink">{affair.date}</dd></>}
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

function EvidenceGraph({ claim, result }) {
  const affairs = [...new Map((claim.evidence || []).map((e) => result.affairs.find((a) => a.id === e.affairId)).filter(Boolean).map((a) => [a.id, a])).values()]
  const nodes = [], edges = []
  for (const affair of affairs) {
    const affairKey = `affair:${affair.id}`
    nodes.push({ id: affairKey, label: affair.title, meta: 'Parliamentary record', kind: 'affair' })
    for (const author of affair.authors || []) {
      const id = `person:${affair.id}:${author.name}`
      if (!nodes.some((n) => n.id === id)) nodes.push({ id, label: author.name, meta: author.party || 'Speaker', kind: 'person' })
      edges.push({ source: affairKey, target: id })
    }
    for (const topic of result.topics || []) {
      if (topic.affairId !== affair.id) continue
      const id = `topic:${topic.topicId || topic.name}`
      if (!nodes.some((n) => n.id === id)) nodes.push({ id, label: topic.name, meta: topic.chapter ? `APS · ${topic.chapter}` : topic.scheme || 'Parliamentary topic', kind: 'topic' })
      edges.push({ source: affairKey, target: id })
    }
  }
  if (!nodes.length) return null
  return <div className="mt-4 border-t border-line pt-3"><div className="label">Evidence relationships</div><CalmGraph nodes={nodes} edges={edges} sourceLabel="Checked claim" empty="No linked archive records." showTopicLinks={false} /></div>
}

function Marginalia({ entry, index, onClose, review, setReview, onReplace, onEdit }) {
  const r = entry.result
  return (
    <div className="card relative p-6">
      <div className="flex items-center">
        <span className="text-[13px] text-muted">Sentence {index + 1}</span>
        {r && <span className={`ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] ${r.scope === 'apolitical' ? 'text-muted' : 'text-accent'}`}>{r.scope === 'swiss_parliament' ? 'Swiss parliament' : r.scope === 'other_political' ? 'Other political' : r.scope === 'apolitical' ? 'Apolitical' : 'Scope uncertain'}</span>}
        <button onClick={onClose} aria-label="Close" className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:text-ink"><X size={17} /></button>
      </div>
      {r?.scope_explanation && r.scope !== 'apolitical' && <p className="mt-2 text-[13px] text-muted">{r.scope_explanation}</p>}
      {!r && <div className="mt-4"><div className="font-medium text-warn">Could not check this sentence</div><p className="mt-2 text-[14px] text-muted">{entry.error || 'The backend did not return a complete result. Retry this story from the full workspace.'}</p></div>}
      {entry.translationState && <p className="mt-2 text-[12px] text-muted">{entry.translationState === 'pending' ? 'Output-language translation is being prepared; showing the checked language for now.' : 'Translation unavailable; showing the checked language.'}</p>}
      {r?.scope === 'apolitical' && <div className="mt-4 rounded-xl border border-line p-4"><div className="font-medium text-muted">Apolitical sentence</div><p className="mt-1 text-[14px] text-muted">{r.scope_explanation || 'This sentence is outside political scope and is excluded from fact-checking.'}</p></div>}
      {(r?.claims || []).map((c, i) => {
        const affair = c.evidence?.[0] && r.affairs.find((a) => a.id === c.evidence[0].affairId)
        return (
          <div key={i} className={i ? 'mt-6 border-t border-line pt-5' : 'mt-2'}>
            <div className={`flex items-center gap-2 text-[16px] font-medium ${TXT[c.verdict] || 'text-ink'}`}>
              {c.verdict === 'supported' ? <Check size={17} /> : c.verdict === 'contradicted' ? <X size={17} /> : <CircleAlert size={17} />}
              {LABEL[c.verdict]}
            </div>
            <p className="mt-2 font-serif text-[16px] italic leading-snug text-muted">{c.explanation}</p>
            <EvidenceGraph claim={c} result={r} />
            <Dossier claim={c} affair={affair} />
            {r.topics?.length > 0 && <div className="mt-3"><div className="text-[12px] font-medium text-muted">Parliamentary topics</div><div className="mt-1 flex flex-wrap gap-1.5">{r.topics.map((t, topicIndex) => <span key={`${t.topic_id || t.name}-${topicIndex}`} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink">{t.name}{t.chapter?.de ? ` · ${t.chapter.de}` : t.chapter ? ` · ${t.chapter}` : ''}</span>)}</div></div>}
            {c.correction && (
              <div className="mt-4 rounded-xl border border-ok/30 bg-ok/10 p-3.5">
                <div className="text-[12px] font-medium text-ok">Suggested correction</div>
                <p className="mt-1 font-serif text-[16px] leading-snug text-ink">{c.correction}</p>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => onReplace(index, c.text, c.correction)} className="btn-primary !px-3 !py-1.5 text-[12px]">Replace claim</button><button onClick={() => onEdit(index, c.text, c.correction)} className="btn-quiet !px-3 !py-1.5 text-[12px]">Review &amp; edit</button></div>
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
export default function Scanner({ language, setLanguage, autoRun = false }) {
  const onBotContext = useBotPublisher('scanner')
  const [text, setText] = useState('')
  const [checkedLanguage, setCheckedLanguage] = useState('EN')
  const [model, setModel] = useState('70B')
  const [phase, setPhase] = useState('edit') // edit | scanning | done
  const [scanText, setScanText] = useState('')
  const [sentences, setSentences] = useState([])
  const [entries, setEntries] = useState({})
  const [live, setLive] = useState(false)
  const [selected, setSelected] = useState(null)
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [reviews, setReviews] = useState({})
  const [runId, setRunId] = useState(null)
  const [runError, setRunError] = useState('')
  const [history, setHistory] = useState(readHistory)
  const [hiddenApolitical, setHiddenApolitical] = useState(false)
  const [beam, setBeam] = useState({ y: 0, h: 0 })
  const wrap = useRef(null), spans = useRef({}), abort = useRef(null), runIdRef = useRef(null)
  const translationQueue = useRef([]), translationPending = useRef(new Map()), translationBusy = useRef(false), translationCache = useRef({})
  const hoverTimer = useRef(null)
  const wide = useMedia('(min-width: 1340px)')
  const doneCount = Object.keys(entries).length, total = sentences.length

  const drainTranslations = useCallback(async () => {
    if (translationBusy.current) return
    translationBusy.current = true
    while (translationQueue.current.length) {
      const task = translationQueue.current.shift()
      try {
        const translated = await translateSentence(task.runId, task.index, task.language)
        const indexKey = String(task.index)
        if (runIdRef.current === task.runId) translationCache.current[indexKey] = { ...(translationCache.current[indexKey] || {}), [task.language]: translated }
        setEntries((current) => {
          if (runIdRef.current !== task.runId) return current
          const item = current[indexKey]
          return item?.result ? { ...current, [indexKey]: { ...item, translations: { ...(item.translations || {}), [task.language]: translated } } } : current
        })
        const old = readHistory()
        const updated = old.map((item) => item.id !== task.runId ? item : { ...item, entries: { ...item.entries, [indexKey]: { ...item.entries?.[indexKey], translations: { ...(item.entries?.[indexKey]?.translations || {}), [task.language]: translated } } } })
        try { localStorage.setItem('polinews.calm-history.v1', JSON.stringify(updated)) } catch {}
        setHistory(updated)
      } catch (error) {
        console.warn(`Could not translate sentence ${task.index + 1}: ${error.message}`)
        setEntries((current) => runIdRef.current === task.runId && current[String(task.index)] ? { ...current, [String(task.index)]: { ...current[String(task.index)], translationErrors: { ...(current[String(task.index)].translationErrors || {}), [task.language]: true } } } : current)
      }
      finally { translationPending.current.delete(`${task.runId}:${task.index}:${task.language}`) }
    }
    translationBusy.current = false
  }, [])
  const enqueueTranslation = useCallback((id, index, language) => {
    const key = `${id}:${index}:${language}`
    if (translationPending.current.has(key)) return
    translationPending.current.set(key, true)
    translationQueue.current.push({ runId: id, index, language })
    void drainTranslations()
  }, [drainTranslations])
  const queueTranslations = useCallback((id, index, sourceLanguage) => {
    for (const language of TRANSLATION_PRIORITY.map((x) => x.toLowerCase())) {
      if (language !== sourceLanguage.toLowerCase()) enqueueTranslation(id, index, language)
    }
  }, [enqueueTranslation])

  const run = useCallback(async () => {
    abort.current = new AbortController()
    setScanText(text); setSentences([]); setEntries({}); setSelected(null); setReviews({}); setRunError(''); runIdRef.current = null; setRunId(null); setPhase('scanning'); translationCache.current = {}
    setCheckedLanguage(language)
    const completedEntries = {}
    try {
      const runResult = await analyseText({
        text, language, model, signal: abort.current.signal,
        onRun: (id) => { runIdRef.current = id; setRunId(id); try { localStorage.setItem('polinews.last-run', id) } catch {} },
        onStart: (list, isLive) => { setSentences(list); setLive(isLive) },
        onSentence: (i, result, error) => {
          const entry = { state: error ? 'error' : 'done', result, error }
          completedEntries[i] = entry
          setEntries((e) => ({ ...e, [i]: entry }))
          if (result && runIdRef.current) queueTranslations(runIdRef.current, i, language)
        },
      })
      const savedEntries = Object.fromEntries(Object.entries(completedEntries).map(([key, entry]) => [key, { ...entry, translations: translationCache.current[key] || {} }]))
      const saved = { id: runResult.runId, date: new Date().toISOString(), text, language, model, sentences: runResult.sentences, entries: savedEntries, reviews: {} }
      setHistory((old) => {
        const next = [saved, ...old.filter((item) => item.id !== saved.id)].slice(0, 12)
        try { localStorage.setItem('polinews.calm-history.v1', JSON.stringify(next)) } catch {}
        return next
      })
    } catch (error) {
      setPhase('edit')
      setRunError(error.message)
    }
    finally { if (abort.current && !abort.current.signal.aborted) setPhase((p) => p === 'scanning' ? 'done' : p) }
  }, [text, language, model, queueTranslations])

  const reviseClaim = (index, original, correction) => {
    const s = sentences[index]
    if (!s) return
    const sourceSentence = scanText.slice(s.start, s.end)
    const claimStart = sourceSentence.indexOf(original)
    const revisedSentence = claimStart >= 0 ? sourceSentence.slice(0, claimStart) + correction + sourceSentence.slice(claimStart + original.length) : sourceSentence
    const updated = scanText.slice(0, s.start) + revisedSentence + scanText.slice(s.end)
    setText(updated); setPhase('edit'); setSelected(null)
  }
  const restoreHistory = (item) => {
    setText(item.text); setScanText(item.text); setSentences(item.sentences || []); setEntries(item.entries || {}); setReviews(item.reviews || {}); setLanguage(item.language || 'EN'); setCheckedLanguage(item.language || 'EN'); setModel(item.model || '70B'); runIdRef.current = item.id; setRunId(item.id); setPhase('done'); setSelected(null); setHiddenApolitical(false)
  }
  const toggleReview = (index) => {
    const updatedReviews = { ...reviews, [index]: !reviews[index] }
    setReviews(updatedReviews)
    if (runId) {
      const updated = readHistory().map((item) => item.id === runId ? { ...item, reviews: updatedReviews } : item)
      try { localStorage.setItem('polinews.calm-history.v1', JSON.stringify(updated)) } catch {}
      setHistory(updated)
    }
  }
  const localized = (entry, index) => {
    if (!entry || language.toLowerCase() === checkedLanguage.toLowerCase()) return entry
    const translated = entry.translations?.[language.toLowerCase()]
    if (translated) return mergeTranslation(entry, translated)
    const key = `${runId}:${index}:${language.toLowerCase()}`
    return { ...entry, translationState: translationPending.current.has(key) ? 'pending' : entry.translationErrors?.[language.toLowerCase()] ? 'unavailable' : 'pending' }
  }

  useEffect(() => {
    const onLanguage = (event) => {
      const next = String(event.detail || '').toLowerCase()
      if (!runId || next === checkedLanguage.toLowerCase()) return
      Object.entries(entries).forEach(([key, entry]) => {
        if (entry.result && !entry.translations?.[next]) enqueueTranslation(runId, Number(key), next)
      })
    }
    window.addEventListener('polinews-language-changed', onLanguage)
    return () => window.removeEventListener('polinews-language-changed', onLanguage)
  }, [runId, checkedLanguage, entries, enqueueTranslation])

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
    clearTimeout(hoverTimer.current); setHoveredIndex(null)
    setSelected({ index: i })
  }
  const hoverSentence = (index, active) => {
    clearTimeout(hoverTimer.current)
    if (active) setHoveredIndex(index)
    else hoverTimer.current = setTimeout(() => setHoveredIndex((current) => current === index ? null : current), 500)
  }
  const holdDetails = () => clearTimeout(hoverTimer.current)
  const activeIndex = selected?.index ?? hoveredIndex
  useEffect(() => {
    onBotContext?.(scannerBotContext({ runId: phase === 'edit' ? null : runId, entries: phase === 'edit' ? {} : entries, model, activeIndex: selected?.index }))
  }, [runId, entries, model, phase, selected?.index, onBotContext])
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
  const apoliticalCount = verdicts.filter((v) => v === 'neutral').length
  const scanning = phase === 'scanning'
  const sel = activeIndex != null && localized(entries[activeIndex], activeIndex)
  const noteProps = sel && { entry: sel, index: activeIndex, onClose: () => { setSelected(null); setHoveredIndex(null) }, review: !!reviews[activeIndex], setReview: () => toggleReview(activeIndex), onReplace: reviseClaim, onEdit: reviseClaim }
  
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
                : verdictOf(entries[p.i]) === 'neutral' && hiddenApolitical
                  ? <button key={p.i} onClick={() => setHiddenApolitical(false)} className="rounded-full border border-line px-2 py-1 text-[12px] text-muted">Show apolitical sentence {p.i + 1}</button>
                  : <Sentence key={p.i} ref={(el) => { spans.current[p.i] = el }} text={p.s.text} entry={localized(entries[p.i], p.i)} scanning={scanning} selected={activeIndex === p.i} onPick={pick(p.i)} onHover={(active) => hoverSentence(p.i, active)} />)}

              {/* soft scan line */}
              <motion.div className="pointer-events-none absolute -inset-x-10 top-0 z-10" initial={false} animate={{ y: beam.y, opacity: scanning ? 1 : 0 }}
                transition={{ y: { duration: scanning ? (live ? 5 : 0.9) : 1, ease: 'easeInOut' }, opacity: { duration: 0.8 } }}>
                <div className="absolute bottom-0 h-20 w-full bg-gradient-to-t from-accent/12 to-transparent" />
                <div className="h-px w-full bg-accent/70" />
              </motion.div>

            </div>
          )}
        </div>
        {runError && <div role="alert" className="mt-4 rounded-xl border border-bad/35 px-4 py-3 text-[14px] text-bad">Fact-check unavailable: {runError}</div>}

        {phase === 'edit' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-7 flex flex-col items-center gap-5">
            <button onClick={run} disabled={!text.trim()} className="btn-primary !px-8 !py-3.5 text-[15px]"><FileSearch size={18} /> Check this story</button>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2"><span className="label">Model</span>
                <Segmented id="scan-model" label="Model" value={model} onChange={setModel}
                  options={[{ value: '8B', label: 'Apertus 8B', title: 'Faster, lighter' }, { value: '70B', label: 'Apertus 70B', title: 'Default' }]} /></div>
            </div>
            <p className="max-w-md text-center text-[13px] text-muted">No archive match means unverified, not false. Review the record before publication.</p>
          </motion.div>
        )}
        {phase === 'edit' && history.length > 0 && <div className="mt-7 w-full"><div className="mb-2 flex items-center justify-between text-[12px] font-medium uppercase tracking-wide text-muted"><span>Recent checks on this device</span><button onClick={() => { localStorage.removeItem('polinews.calm-history.v1'); setHistory([]) }} className="normal-case underline underline-offset-4">Clear</button></div><div className="flex flex-wrap gap-2">{history.slice(0, 4).map((item) => <button key={item.id} onClick={() => restoreHistory(item)} className="max-w-[250px] truncate rounded-full border border-line px-3 py-1.5 text-left text-[12px] text-muted hover:text-ink">{new Date(item.date).toLocaleDateString()} · {item.text.slice(0, 64)}</button>)}</div></div>}
        {phase !== 'edit' && !scanning && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[13px] text-muted"><span>Live archive results · hover for details, click to pin</span>{apoliticalCount > 0 && <button onClick={() => setHiddenApolitical((v) => !v)} className="underline underline-offset-4">{hiddenApolitical ? 'Show' : 'Hide'} {apoliticalCount} apolitical {apoliticalCount === 1 ? 'sentence' : 'sentences'}</button>}</div>
        )}
      </motion.div>

      {/* margin note: fixed to the viewport and rendered OUTSIDE the transformed canvas (a transform would trap `fixed`) */}
      <AnimatePresence>
        {activeIndex != null && sel && wide && (
          <motion.aside key="note" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.45, ease: 'easeOut' }}
            className="fixed right-8 top-28 z-30 w-[400px] overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(100vh - 220px)' }} onMouseEnter={holdDetails} onMouseLeave={() => activeIndex != null && hoverSentence(activeIndex, false)} onClick={(e) => e.stopPropagation()}>
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
