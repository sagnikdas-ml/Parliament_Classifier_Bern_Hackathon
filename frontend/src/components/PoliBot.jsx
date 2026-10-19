import { useCallback, useEffect, useRef, useState } from 'react'
import { polibotRequest } from '../lib/polibot.js'
import './PoliBot.css'

function Robot() {
  return <svg className="pb-robot" viewBox="0 0 64 68" fill="none" aria-hidden="true">
    <path d="M32 6v8" stroke="currentColor" strokeWidth="3" /><circle cx="32" cy="6" r="4" fill="currentColor" />
    <rect x="10" y="15" width="44" height="35" rx="13" fill="rgb(var(--sunk))" stroke="currentColor" strokeWidth="2" />
    <rect x="16" y="22" width="32" height="17" rx="7" fill="rgb(var(--accent))" />
    <g className="pb-eyes" fill="rgb(var(--surface))"><rect x="23" y="27" width="4" height="7" rx="2" /><rect x="37" y="27" width="4" height="7" rx="2" /></g>
    <path d="M27 44h10M7 28v9m50-9v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M23 53h18l4 9H19l4-9Z" fill="rgb(var(--line))" />
  </svg>
}
function SourceLink({ source }) {
  try { if (!['https:', 'http:'].includes(new URL(source.url).protocol)) return null } catch { return null }
  return <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>Original source ↗</a>
}

export default function PoliBot({ context }) {
  const [open, setOpen] = useState(false)
  const [documentId, setDocumentId] = useState('')
  const [summary, setSummary] = useState(null)
  const [activeRequest, setActiveRequest] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [voice, setVoice] = useState(false)
  const [speechAvailable, setSpeechAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [status, setStatus] = useState('Check a story or select a policy-map record to begin.')
  const generation = useRef(0), controller = useRef(null), audio = useRef(null), audioUrl = useRef(null)
  const launcher = useRef(null), firstAction = useRef(null), transcript = useRef(null), input = useRef(null)

  const dispose = useCallback(() => {
    generation.current++
    controller.current?.abort(); controller.current = null
    if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); audio.current = null }
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = null }
  }, [])
  const stop = useCallback((message) => {
    dispose(); setBusy(false); setSpeaking(false)
    if (message) setStatus(message)
  }, [dispose])
  const clearBriefing = useCallback(() => {
    stop(); setSummary(null); setActiveRequest(null); setMessages([]); setQuestion('')
    setStatus('Generate a briefing to ask follow-up questions about its documents.')
  }, [stop])

  useEffect(() => {
    const abort = new AbortController()
    polibotRequest('status', undefined, { signal: abort.signal }).then(data => setSpeechAvailable(data.speech_available)).catch(() => {})
    return () => abort.abort()
  }, [])
  useEffect(() => () => dispose(), [dispose])
  useEffect(() => {
    clearBriefing()
    setDocumentId(context?.selectedDocumentId ? String(context.selectedDocumentId) : '')
  }, [context?.key, context?.selectedDocumentId, clearBriefing])
  useEffect(() => { if (open) firstAction.current?.focus() }, [open])
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight }, [messages])

  const close = () => { stop(); setOpen(false); launcher.current?.focus() }
  async function generate(action) {
    if (!context?.ready) return
    if (action === 'document' && !documentId) { setStatus('Select a document, or pin a policy-map record first.'); return }
    clearBriefing()
    const token = generation.current, abort = new AbortController(); controller.current = abort
    setBusy(true); setStatus('Reading the current records…')
    const request = { ...context.body, action, ...(action === 'document' ? { document_id: Number(documentId) } : {}) }
    try {
      const data = await polibotRequest('summary', request, { signal: abort.signal })
      if (token !== generation.current) return
      setSummary(data); setActiveRequest({ ...request, briefing_hash: data.briefing_hash }); setSpeechAvailable(data.speech_available)
      setStatus('Briefing ready. Ask about the document or its wider context.')
      if (!voice) return
      if (!data.speech_available) { setStatus('Text briefing ready. Speech is not configured on this server.'); return }
      setStatus('Preparing optional speech…')
      const blob = await polibotRequest('speech', { ...request, briefing_hash: data.briefing_hash }, { signal: abort.signal, audio: true })
      if (token !== generation.current) return
      audioUrl.current = URL.createObjectURL(blob); const player = new Audio(audioUrl.current); audio.current = player
      player.onended = () => { if (token === generation.current) stop('Finished speaking.') }
      player.onerror = () => { if (token === generation.current) stop('Audio could not be played. The text remains available.') }
      await player.play()
      if (token === generation.current) { setSpeaking(true); setStatus('Speaking in English…') }
    } catch (error) {
      if (token === generation.current && error.name !== 'AbortError') stop(error.message)
    } finally { if (token === generation.current) setBusy(false) }
  }
  async function ask(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text || !activeRequest || busy) return
    stop()
    const token = generation.current, abort = new AbortController(); controller.current = abort
    const history = messages.filter(message => !message.error).slice(-6).map(({ role, text }) => ({ role, text }))
    setMessages(previous => [...previous, { role: 'user', text }]); setQuestion(''); setBusy(true)
    setStatus('Reading document passages and reasoning about your question…')
    try {
      const data = await polibotRequest('chat', { context: activeRequest, question: text, history }, { signal: abort.signal })
      if (token !== generation.current) return
      setActiveRequest(previous => ({ ...previous, briefing_hash: data.briefing_hash || previous.briefing_hash }))
      setMessages(previous => [...previous, { role: 'assistant', text: data.answer, sources: data.sources }])
      setStatus(data.answer_kind === 'background' ? 'General background — not verification of a specific event.' : 'Answer ready. Review any cited records before publication.')
    } catch (error) {
      if (token === generation.current && error.name !== 'AbortError') {
        setMessages(previous => [...previous, { role: 'assistant', text: error.message, error: true }]); setStatus('Question could not be answered. You can retry.')
      }
    } finally { if (token === generation.current) { setBusy(false); requestAnimationFrame(() => input.current?.focus()) } }
  }

  return <section id="polibot-react" data-speaking={speaking} aria-label="PoliBot evidence assistant" onClick={event => event.stopPropagation()}>
    {open && <div id="polibotPanel" className="pb-panel" role="region" aria-labelledby="polibotHeading" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <div className="pb-head"><div><h2 id="polibotHeading">PoliBot</h2><span>Document assistant · English</span></div><button type="button" onClick={close} aria-label="Close PoliBot">×</button></div>
      <p className="pb-context">{context?.label || 'Choose a story or a policy-map record'}</p>
      <div className="pb-actions"><button id="polibotSummarize" ref={firstAction} type="button" disabled={!context?.ready || busy} onClick={() => generate('summary')}>Summarize Results</button><button id="polibotExplain" type="button" disabled={!context?.ready || busy} onClick={() => generate('document')}>Explain Document</button></div>
      <label htmlFor="polibotDocument">Document to explain</label><select id="polibotDocument" value={documentId} disabled={busy} onChange={event => { clearBriefing(); setDocumentId(event.target.value) }}><option value="">Select a cited record</option>{context?.documents?.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select>
      <p id="polibotStatus" role="status" aria-live="polite">{status}</p>
      {summary && <div id="polibotOutput" className="pb-output" tabIndex={0} aria-label="PoliBot briefing"><p>{summary.text}</p>{summary.sources?.map(source => <article key={source.id}><strong>{source.title}</strong>{source.quote && <blockquote>{source.quote}</blockquote>}<SourceLink source={source} /></article>)}</div>}
      <div className="pb-chat"><h3>Ask about this briefing</h3><div id="polibotMessages" ref={transcript} role="log" aria-live="polite" aria-label="Questions and answers">{messages.map((message, i) => <div key={i} className={`pb-message ${message.role}`}><strong>{message.role === 'user' ? 'You' : 'PoliBot'}</strong><p>{message.text}</p>{message.sources?.map(source => <SourceLink key={source.id} source={source} />)}</div>)}</div>
        <form onSubmit={ask}><label htmlFor="polibotQuestion">Your question</label><div className="pb-chat-row"><input ref={input} id="polibotQuestion" value={question} onChange={event => setQuestion(event.target.value)} disabled={!activeRequest || busy} maxLength={1000} required autoComplete="off" placeholder={activeRequest ? 'Ask about this document…' : 'Generate a briefing first'} /><button id="polibotSend" disabled={!activeRequest || busy} type="submit">Ask</button></div></form>
        <p className="pb-note">Answers use document excerpts. General background is labeled; check citations.</p>
      </div>
      <div className="pb-speech"><label><input id="polibotVoice" type="checkbox" checked={voice} onChange={event => { setVoice(event.target.checked); if (!event.target.checked) stop('Speech disabled. Text remains available.') }} /> Read briefings aloud</label><button id="polibotStop" type="button" disabled={!busy && !speaking} onClick={() => stop('Stopped. Text remains available.')}>Stop Speaking</button></div>
      <p className="pb-note">{speechAvailable ? 'Optional narration sends briefing text to ElevenLabs.' : 'Speech is not configured. Text features work normally.'}</p>
    </div>}
    <button id="polibotLauncher" ref={launcher} className="pb-launcher" type="button" aria-controls="polibotPanel" aria-expanded={open} aria-label={open ? 'Close PoliBot' : 'Open PoliBot'} onClick={() => open ? close() : setOpen(true)}><Robot /><span>PoliBot</span></button>
  </section>
}
