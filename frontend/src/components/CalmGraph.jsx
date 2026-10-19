import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Fingerprint } from 'lucide-react'

/** Calm-style, data-backed relationship graph: a quiet source node, curved links and ranked record nodes. */
export default function CalmGraph({ nodes = [], edges = [], sourceLabel = 'Source', empty = 'No relationships in the available records.', large = false, showTopicLinks = true }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const rows = useMemo(() => nodes.slice(0, 12), [nodes])
  if (!rows.length) return <p className="mt-3 text-[13px] text-muted">{empty}</p>
  const step = large ? 82 : 66, height = rows.length * step + 24, mid = height / 2
  const sourceX = 24, targetX = large ? Math.max(220, Math.round(width * 0.3)) : Math.max(180, Math.round(width * 0.38))
  const targetWidth = Math.max(100, width - targetX - 8)
  const color = (kind) => kind === 'topic' ? 'var(--aps)' : kind === 'person' ? 'var(--ok)' : 'var(--accent)'
  return <div ref={ref} className="relative mt-4 overflow-hidden" style={{ height }} aria-label="Relationship graph">
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {rows.map((node, i) => {
        const y = 36 + i * step, stroke = color(node.kind)
        const d = `M ${sourceX + 24} ${mid} C ${width * .19} ${mid}, ${width * .22} ${y}, ${targetX} ${y}`
        return <g key={node.id}>
          <motion.path d={d} fill="none" stroke={`rgb(${stroke})`} strokeWidth="1.25" strokeLinecap="round" strokeOpacity=".55" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * .06, duration: .65, ease: 'easeOut' }} />
          <circle r="2.2" fill={`rgb(${stroke})`} fillOpacity=".8"><animateMotion dur={`${3.2 + i * .18}s`} repeatCount="indefinite" path={d} /></circle>
          {showTopicLinks && edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge, ei) => {
            const other = rows.find((x) => x.id === (edge.source === node.id ? edge.target : edge.source))
            if (!other || other.id < node.id) return null
            const j = rows.indexOf(other), oy = 36 + j * step
            const link = `M ${targetX + 4} ${y} C ${targetX + 46} ${y}, ${targetX + 46} ${oy}, ${targetX + 4} ${oy}`
            const weight = Number(edge.weight || 1)
            return <motion.path key={`${node.id}-${other.id}-${ei}`} d={link} fill="none" stroke={`rgb(${color('topic')})`} strokeWidth={Math.min(2.25, 0.8 + Math.log2(weight + 1) * 0.28)} strokeOpacity={Math.min(.48, .14 + Math.log2(weight + 1) * .07)} strokeDasharray="3 5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .8 }}><title>{`${weight} shared affairs`}</title></motion.path>
          })}
        </g>
      })}
    </svg>
    <div className="absolute left-0 top-1/2 -translate-y-1/2">
      <span className="absolute inset-0 animate-pulseRing rounded-full border border-accent/35" />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-accent/45 bg-surface" title={sourceLabel}><Fingerprint size={20} className="text-accent" strokeWidth={1.4} /></div>
    </div>
    {rows.map((node, i) => <motion.div key={node.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .18 + i * .06 }} className="absolute -translate-y-1/2" style={{ top: 36 + i * step, left: targetX, maxWidth: targetWidth }}>
      <div className={`flex items-center gap-2 rounded-lg border ${large ? 'px-3.5 py-2' : 'px-3 py-1.5'} ${node.kind === 'topic' ? 'border-aps/30 bg-aps/5' : node.kind === 'person' ? 'border-ok/30 bg-ok/5' : 'border-accent/30 bg-accent/5'}`} title={node.meta || node.label}>
        <span className={`whitespace-normal font-serif font-medium leading-snug text-ink ${large ? 'text-[17px]' : 'text-[14px]'}`}>{node.label}</span>
        {node.value != null && <span className={`shrink-0 font-mono text-muted ${large ? 'text-[13px]' : 'text-[11px]'}`}>{node.value}</span>}
      </div>
      {node.meta && <div className={`mt-0.5 truncate pl-1 text-muted ${large ? 'text-[13px]' : 'text-[11px]'}`}>{node.meta}</div>}
    </motion.div>)}
  </div>
}
