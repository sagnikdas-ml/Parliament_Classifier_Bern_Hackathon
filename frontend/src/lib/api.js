// Client for the PoliNews FastAPI backend (`bash scripts/run_demo.sh`, port 8000). Vite proxies /api in dev.
// Every function returns live data or throws; views fall back to demo data (lib/mock.js) and say so on screen.
import { DEMO_AFFAIRS, demoSentence, splitSentences } from './mock.js'

const BASE = import.meta.env.VITE_API_BASE || ''
const FOCUS_TOPIC = 'focus:digitalisation:v1' // fixed DVS scope (parliament/digitalisation.py)
export const MODELS = { '8B': 'apertus-v1-5-8b', '70B': 'apertus-v1-5-70b' }

async function request(path, options = {}, timeoutMs = 120000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, { ...options, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`)
    return body
  } finally {
    clearTimeout(timer)
  }
}

/** Archive coverage, or null when the backend is down. (Read-only; does not start any job.) */
export async function getStatus() {
  try { return await request('/api/status', {}, 2500) } catch { return null }
}

const levelOf = (body) => (body === 'CHE' ? 'Federal' : /^[A-Z]{2}$/.test(body) ? 'Cantonal' : 'Municipal')

/** Digitalisation affairs + APS topics for one model: saved classifications joined by affair. Demo snapshot if none exist. */
export async function getRadar(model = '70B') {
  const m = MODELS[model]
  try {
    const [focus, aps] = await Promise.all([
      request(`/api/classifications?topic_id=${encodeURIComponent(FOCUS_TOPIC)}&limit=60&model=${m}`, {}, 8000),
      request(`/api/classifications?topic_id=aps&limit=200&model=${m}`, {}, 8000),
    ])
    const hits = (focus.results || []).filter((r) => r.status === 'relevant' && r.labels?.length)
    if (!hits.length) throw new Error('empty')
    const apsBy = Object.fromEntries((aps.results || []).map((r) => [r.affair_id, r.labels || []]))
    const affairs = await Promise.all(hits.slice(0, 24).map(async (r) => {
      const a = await request(`/api/affairs/${r.affair_id}?model=${m}`, {}, 15000)
      const titles = a.titles || {}
      const ev = r.labels[0].evidence || {}
      const text = (a.units || []).find((u) => u.id === ev.unit_id)?.text || ev.quote
      return {
        id: r.affair_id, number: a.number || String(r.affair_id), body: a.body_key, level: levelOf(a.body_key),
        lang: (r.language || 'de').toUpperCase(), langs: [(r.language || 'de').toUpperCase()], date: String(a.begin_date || '').slice(0, 10),
        title: titles[r.language] || titles.de || titles.fr || titles.it || '—', author: null, party: null, digital: null,
        aps: (apsBy[r.affair_id] || []).slice(0, 3).map((l) => ({ code: l.topic_id, chapter: l.chapter?.de || '', name: l.name, conf: null })),
        kind: 'archive text', quote: ev.quote, source: text,
      }
    }))
    return { live: true, affairs }
  } catch {
    return { live: false, affairs: DEMO_AFFAIRS }
  }
}

/**
 * Archive-run status (opt-in). NOTE: the backend's GET /api/jobs may itself create/restart the continuous APS
 * archive classification, so the UI only calls this when the user asks for it.
 */
export async function getArchiveRun() {
  const jobs = await request('/api/jobs', {}, 15000)
  const job = jobs.find((j) => j.kind === 'classify') || jobs[0]
  if (!job) return null
  return request(`/api/jobs/${job.id}`, {}, 15000)
}

/** Map a backend sentence result (parliament/factcheck.py) to what the cards render. */
export function normalizeSentence(r) {
  const affairs = (r.matched_affairs || []).map((a) => ({
    id: a.id, number: a.provenance?.number || String(a.id), title: a.titles?.de || a.titles?.fr || a.titles?.it || a.titles?.en || '—',
    authors: (a.provenance?.authors || []).map((x) => ({ name: x.name, party: null })),
    date: a.provenance?.record_start_date, body: null, url: a.provenance?.original_url || a.source_url,
  }))
  const claims = (r.claims || []).map((c) => ({
    text: c.text, verdict: c.verdict, explanation: c.explanation, correction: c.correction, needsReview: !!c.needs_review,
    evidence: (c.evidence || []).map((e) => ({ quote: e.quote, source: e.quote, affairId: e.affair_id, url: e.source_url, server: true })),
  }))
  return { index: r.index, text: r.text, scope: r.scope, claims, affairs, notice: r.review_notice, english: r.sentence_english,
           topics: (r.topics || []).map((t) => ({ name: t.name, chapter: t.chapter?.de })) }
}

/**
 * Analyse an article: POST /api/fact-checks (pinning the chosen model), then POST .../sentences/{i} one by one, reporting
 * each finished sentence through `onSentence`. If the backend is unusable the scripted demo streams instead.
 */
export async function analyseText({ text, language, model = '70B', useLive, onStart, onSentence, signal }) {
  if (useLive) {
    try {
      const run = await request('/api/fact-checks', { method: 'POST', body: JSON.stringify({ text, language: language.toLowerCase(), topic_ids: [], model: MODELS[model] }) }, 15000)
      onStart(run.sentences.map((s) => ({ text: s.text, start: s.start, end: s.end })), true)
      for (const s of run.sentences) {
        if (signal?.aborted) break
        try {
          const result = await request(`/api/fact-checks/${run.id}/sentences/${s.index}`, { method: 'POST' }, 180000)
          onSentence(s.index, normalizeSentence({ ...result, index: s.index }), null)
        } catch (err) {
          onSentence(s.index, null, err.message) // shown as an error; never silently replaced by demo data
        }
      }
      return { live: true }
    } catch (err) {
      if (!/Failed to fetch|NetworkError|HTTP 50\d|aborted/i.test(err.message)) throw err
    }
  }
  const sentences = splitSentences(text)
  let cursor = 0
  onStart(sentences.map((t) => { const start = text.indexOf(t, cursor); cursor = start + t.length; return { text: t, start, end: cursor } }), false)
  for (let i = 0; i < sentences.length; i++) {
    if (signal?.aborted) break
    await new Promise((r) => setTimeout(r, 900)) // gentle pacing so the feed visibly streams in
    onSentence(i, demoSentence(sentences[i], i), null)
  }
  return { live: false }
}
