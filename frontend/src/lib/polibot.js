const BASE = import.meta.env?.VITE_API_BASE || ''
const modelId = model => model === '8B' ? 'apertus-v1-5-8b' : 'apertus-v1-5-70b'

export function scannerBotContext({ runId, entries, model, activeIndex }) {
  const indices = Object.keys(entries).map(Number).filter(index => entries[index]?.result)
  const selected = activeIndex != null && indices.includes(activeIndex) ? [activeIndex] : indices
  const documents = new Map()
  for (const index of selected) {
    const result = entries[index].result
    for (const claim of result.claims || []) for (const evidence of claim.evidence || []) {
      const id = evidence.affairId
      if (!Number.isInteger(id)) continue
      const affair = result.affairs?.find(item => item.id === id)
      documents.set(id, { id, title: affair?.title || `Affair ${id}` })
    }
  }
  return {
    key: `story:${runId || 'new'}:${model}:${selected.join(',')}`,
    label: activeIndex != null ? `Sentence ${activeIndex + 1}` : 'Current story',
    ready: !!runId && !!selected.length,
    body: { fact_check_id: runId, sentence_indices: selected, model: modelId(model) },
    documents: [...documents.values()].slice(0, 10),
  }
}

export function mapBotContext({ affairs, model, pinned }) {
  const chosen = affairs.find(affair => affair.id === pinned)
  const records = [...new Map([...(chosen ? [chosen] : []), ...affairs].map(record => [record.id, record])).values()].slice(0, 10)
  return {
    key: `map:${model}:${records.map(record => record.id).join(',')}`,
    label: 'Policy map · digitalisation', ready: !!records.length,
    selectedDocumentId: chosen?.id || null,
    body: { affair_ids: records.map(record => record.id), topic_id: 'focus:digitalisation:v1', model: modelId(model) },
    documents: records.map(record => ({ id: record.id, title: record.title })),
  }
}

export async function polibotRequest(action, body, { signal, audio = false } = {}) {
  if (!['status', 'summary', 'chat', 'speech'].includes(action)) throw new Error('Unknown PoliBot action')
  const response = await fetch(`${BASE}/api/polibot/${action}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    let detail
    try { detail = (await response.json()).detail } catch {}
    throw new Error(typeof detail === 'string' ? detail : `PoliBot request failed (${response.status}). Please retry.`)
  }
  return audio ? response.blob() : response.json()
}
