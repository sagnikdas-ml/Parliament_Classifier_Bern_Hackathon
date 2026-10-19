import { motion } from 'framer-motion'

/** Quiet segmented control (language, model, filters). */
export function Segmented({ value, onChange, options, label, id }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface p-1">
      {options.map((o) => {
        const val = o.value ?? o, text = o.label ?? o, on = value === val
        return (
          <button key={val} role="radio" aria-checked={on} onClick={() => onChange(val)} title={o.title}
            className={`relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-300 ${on ? 'text-bg' : 'text-muted hover:text-ink'}`}>
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 260, damping: 30 }} />}
            <span className="relative">{text}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 rounded-full border transition-colors duration-300 ${on ? 'border-warn/60 bg-warn/25' : 'border-line bg-sunk'}`}>
      <motion.span layout transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className={`absolute top-0.5 rounded-full ${on ? 'right-0.5 bg-warn' : 'left-0.5 bg-muted/70'}`} style={{ height: 18, width: 18 }} />
    </button>
  )
}

export const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
/** True iff `quote` is a verbatim (whitespace-normalised) substring of `source`. */
export const verifyQuote = (quote, source) => !!quote && norm(source).includes(norm(quote))
