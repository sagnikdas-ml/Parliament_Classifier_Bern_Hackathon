import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Fingerprint, Pin, ShieldCheck, ShieldX, Terminal } from 'lucide-react'
import { getRadar } from '../lib/api.js'
import { mapBotContext } from '../lib/polibot.js'
import { useBotPublisher } from '../components/PoliBotProvider.jsx'
import { BODY_NAMES } from '../lib/bodies.js'
import ArchivePulse from '../components/ArchivePulse.jsx'
import { Cursor, useTypewriter } from '../components/Typewriter.jsx'
import { Segmented, verifyQuote } from '../components/ui.jsx'

/** Dossier-style evidence: header lines, then the verbatim quote typed out gently, then a verification result. */
function Evidence({ a }) {
  const head = `record   ${BODY_NAMES[a.body] || a.body} · ${a.date}\nsource   ${a.kind}${a.author ? ` · ${a.author}${a.party ? ` (${a.party})` : ''}` : ''}\nquote    `
  const { shown, done } = useTypewriter(head + a.quote, { speed: 16 })
  const ok = verifyQuote(a.quote, a.source)
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
      <div className="mt-4 rounded-xl border border-line bg-sunk p-4 font-mono text-[13px] leading-relaxed">
        <span className="whitespace-pre-wrap text-muted">{shown.slice(0, head.length)}</span>
        <span className="whitespace-pre-wrap text-ok">{shown.length > head.length ? shown.slice(head.length) : ''}</span>
        {!done && <Cursor color="rgb(var(--ok))" />}
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`mt-3 flex items-center gap-2 font-sans text-[13px] ${ok ? 'text-ok' : 'text-bad'}`}>
            {ok ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
            {ok ? 'Verified: a verbatim passage of the source text' : 'Rejected: this quote is not in the source text'}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

/** The expanded multi-parent node: the affair, with gentle curves to its ad-hoc tag and 1–3 APS parent topics. */
function NodeOverlay({ a, pinned, onPin }) {
  const [reveal, setReveal] = useState(false)
  const [W, setW] = useState(560)
  const graph = useRef(null)
  useEffect(() => { if (graph.current) setW(graph.current.offsetWidth) }, [])
  const rows = [{ kind: 'digital', label: 'Digitalisation', sub: 'ad-hoc topic · DVS watch-list', conf: a.digital },
                ...a.aps.slice(0, 3).map((t) => ({ kind: 'aps', label: t.name, sub: `APS ${t.code}${t.chapter ? ` · ${t.chapter}` : ''}`, conf: t.conf }))]
  const STEP = 78, H = rows.length * STEP + 8, mid = H / 2, TX = Math.round(W * 0.38), TW = W - TX - 6
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
      className="card absolute -inset-x-6 -top-5 z-40 p-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="meta">{BODY_NAMES[a.body] || a.bodyName || a.body}</span>
        <span className="meta">{a.level} · {(a.langs?.length ? a.langs : [a.lang]).join(' / ')}</span>
        <span className="meta">{a.author || 'Author not listed'}{a.party ? ` · ${a.party}` : ''}</span>
        {a.date && <span className="meta">{a.date}</span>}
        <button onClick={onPin} className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors duration-300 ${pinned ? 'border-accent/60 text-accent' : 'border-line text-muted hover:text-ink'}`}>
          <Pin size={12} /> {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
      <h3 className="mt-3 font-serif text-[26px] font-medium leading-snug text-ink">{a.title}</h3>

      <div ref={graph} className="relative mt-6" style={{ height: H }}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {rows.map((r, i) => {
            const y = 34 + i * STEP, c = r.kind === 'digital' ? 'var(--accent)' : 'var(--aps)'
            const d = `M 52 ${mid} C ${W * 0.2} ${mid}, ${W * 0.26} ${y}, ${TX} ${y}`
            return (
              <g key={i}>
                <motion.path d={d} fill="none" stroke={`rgb(${c})`} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + i * 0.14, duration: 0.8, ease: 'easeOut' }} />
                <circle r="2.6" fill={`rgb(${c})`} fillOpacity="0.8"><animateMotion dur={`${3.4 + i * 0.5}s`} repeatCount="indefinite" path={d} /></circle>
              </g>
            )
          })}
        </svg>
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <span className="absolute inset-0 animate-pulseRing rounded-full border border-accent/40" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-surface"><Fingerprint size={20} className="text-accent" strokeWidth={1.4} /></div>
        </div>
        {rows.map((r, i) => {
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.14, duration: 0.5 }}
              className="absolute -translate-y-1/2" style={{ top: 34 + i * STEP, left: TX, maxWidth: TW }}>
              <div className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 ${r.kind === 'digital' ? 'border-accent/45 bg-accent/10' : 'border-aps/35 bg-aps/10'}`}>
                <span className="truncate font-serif text-[16px] font-medium text-ink">{r.label}</span>
                {r.conf != null && <span className={`font-mono text-[12px] ${r.kind === 'digital' ? 'text-accent' : 'text-aps'}`}>{r.conf.toFixed(2)}</span>}
              </div>
              <div className="mt-1.5 truncate pl-1 text-[12px] text-muted">{r.sub}</div>
            </motion.div>
          )
        })}
      </div>

      <button onClick={() => setReveal((v) => !v)} className="btn-quiet mt-5 !py-2 text-[13px] !text-ok"><Terminal size={14} /> {reveal ? 'Hide evidence' : 'Reveal evidence'}</button>
      <AnimatePresence>{reveal && <Evidence a={a} />}</AnimatePresence>
    </motion.div>
  )
}

/** One affair in the typographic wall; the headline grows slightly with Apertus certainty. */
function Node({ a, active, dim, setHover, pinned, setPinned }) {
  const ref = useRef(null)
  const size = 26
  return (
    <motion.div ref={ref} className="relative mb-11 cursor-pointer" animate={{ opacity: dim ? 0.3 : 1 }} transition={{ duration: 0.45 }}
      onHoverStart={() => setHover(a.id)} onHoverEnd={() => setHover(null)}
      onClick={() => { setPinned(pinned ? null : a.id); if (!pinned) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60) }}>
      <div style={{ visibility: active ? 'hidden' : 'visible' }}>
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent opacity-80" />
          <span className="meta opacity-70">{a.bodyName || a.body} · {a.date}</span>
        </div>
        <h3 className="mt-2 font-serif font-medium leading-[1.25] text-ink" style={{ fontSize: size }}>{a.title}</h3>
      </div>
      <AnimatePresence>{active && <NodeOverlay a={a} pinned={pinned} onPin={() => setPinned(pinned ? null : a.id)} />}</AnimatePresence>
    </motion.div>
  )
}

function useColumns() {
  const calc = () => (window.innerWidth >= 1536 ? 3 : window.innerWidth >= 900 ? 2 : 1)
  const [n, setN] = useState(calc)
  useEffect(() => { const f = () => setN(calc()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return n
}

/** Policy map: saved digitalisation affairs as headlines; hover to inspect assigned APS topics. */
export default function Constellation({ backendReady }) {
  const onBotContext = useBotPublisher('constellation')
  const cols = useColumns()
  const [data, setData] = useState(null)
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)
  const [model, setModel] = useState('8B')

  useEffect(() => { setData(null); getRadar(model).then(setData) }, [model])
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && setPinned(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const rows = useMemo(() => (data?.affairs || []), [data])

  useEffect(() => { onBotContext?.(mapBotContext({ affairs: rows, model, pinned })) }, [rows, model, pinned, onBotContext])
  const activeId = pinned ?? hover
  const fed = rows.filter((a) => a.level === 'Federal').length
  const cantonal = rows.filter((a) => a.level === 'Cantonal').length

  return (
    <section className="min-h-screen px-[6vw] pb-40 pt-32">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
        <div className="label text-accent">Digital Administration Switzerland · policy map</div>
        <h1 className="mt-3 max-w-4xl font-serif text-[clamp(34px,4.6vw,64px)] font-medium leading-[1.08] tracking-tight text-ink">
          Every digital affair, <em className="text-accent">mapped.</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] text-muted">Saved OpenParlData classifications, linked to APS topics. Hover an affair to inspect its record; click to pin it.</p>
        {data?.live && <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 text-[14px] text-muted">
          <span><b className="font-medium text-ink">{data.total ?? rows.length}</b> saved affairs</span>
          <span><b className="font-medium text-ink">{fed}</b> federal · <b className="font-medium text-ink">{cantonal}</b> cantonal shown</span>
        </div>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {backendReady && <Segmented id="model" label="Model" value={model} onChange={setModel} options={[{ value: '8B', label: 'Apertus 8B' }, { value: '70B', label: 'Apertus 70B' }]} />}
          {data?.note && <span className="text-[12px] text-muted">{data.note}</span>}
        </div>
        <ArchivePulse />
      </motion.div>

      {/* explicit columns, not CSS multicol: multicol fragments the absolutely positioned expanded node */}
      <div className="mt-14 flex gap-x-16">
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="min-w-0 flex-1">
            {rows.map((a, i) => i % cols === c && (
              // the active item's wrapper must out-rank its siblings, otherwise the expanded node is painted under the next item
              <motion.div key={`${a.id}-${a.lang}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.6 }}
                className="relative" style={{ zIndex: activeId === a.id ? 50 : 1 }}>
                <Node a={a} active={activeId === a.id} dim={activeId != null && activeId !== a.id} setHover={setHover} pinned={pinned === a.id} setPinned={setPinned} />
              </motion.div>
            ))}
          </div>
        ))}
      </div>
      {data?.live && rows.length === 0 && <p className="mt-10 text-[15px] text-muted">{data.note || 'No saved digitalisation classifications for this model yet.'}</p>}
    </section>
  )
}
