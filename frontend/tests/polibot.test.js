import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scannerBotContext, mapBotContext, polibotRequest } from '../src/lib/polibot.js'

const entry = id => ({ state: 'done', result: { claims: [{ evidence: [{ affairId: id }] }], affairs: [{ id, title: `Record ${id}` }] } })
test('scanner context uses completed server sentence IDs and the selected model', () => {
  const context = scannerBotContext({ runId: 'a'.repeat(32), entries: { 0: entry(10), 1: { state: 'error' }, 2: entry(20) }, model: '70B' })
  assert.equal(context.ready, true)
  assert.deepEqual(context.body.sentence_indices, [0, 2])
  assert.equal(context.body.model, 'apertus-v1-5-70b')
  assert.deepEqual(context.documents.map(document => document.id), [10, 20])
  assert.equal('claims' in context.body, false, 'the backend must reload canonical evidence')
})
test('pinned sentence scopes the briefing; an unchecked story cannot enable the bot', () => {
  const entries = { 0: entry(10), 1: entry(20) }
  const context = scannerBotContext({ runId: 'a'.repeat(32), entries, model: '8B', activeIndex: 1 })
  assert.deepEqual(context.body.sentence_indices, [1])
  assert.deepEqual(context.documents.map(document => document.id), [20])
  assert.equal(scannerBotContext({ runId: null, entries: {}, model: '70B' }).ready, false)
})
test('map includes a pinned record beyond the first ten and respects bounded context', () => {
  const affairs = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, title: `Record ${i + 1}` }))
  const context = mapBotContext({ affairs, model: '8B', pinned: 22 })
  assert.equal(context.body.affair_ids.length, 10)
  assert.equal(context.body.affair_ids[0], 22)
  assert.equal(context.selectedDocumentId, 22)
  assert.equal(context.body.topic_id, 'focus:digitalisation:v1')
  assert.equal(context.body.model, 'apertus-v1-5-8b')
})
test('client forwards cancellation and JSON context without browser credentials', async () => {
  const original = globalThis.fetch, controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/polibot/chat')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.equal(options.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(options.body), { question: 'Explain this record' })
    return Response.json({ answer: 'An answer' })
  }
  try { assert.deepEqual(await polibotRequest('chat', { question: 'Explain this record' }, { signal: controller.signal }), { answer: 'An answer' }) }
  finally { globalThis.fetch = original }
})
test('client preserves provider errors and supports audio blobs', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ detail: 'Generate a fresh briefing' }, { status: 409 })
    await assert.rejects(polibotRequest('chat', {}), /Generate a fresh briefing/)
    globalThis.fetch = async () => new Response('audio-data', { headers: { 'Content-Type': 'audio/mpeg' } })
    const blob = await polibotRequest('speech', {}, { audio: true })
    assert.equal(blob.type, 'audio/mpeg')
    assert.equal(await blob.text(), 'audio-data')
    await assert.rejects(polibotRequest('unknown', {}), /Unknown PoliBot action/)
  } finally { globalThis.fetch = original }
})
