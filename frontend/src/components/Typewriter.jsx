import { useEffect, useState } from 'react'

/** Types `text` character by character (monospace dossier feel). Calls onDone once finished. */
export function useTypewriter(text, { speed = 12, start = true, onDone } = {}) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    if (!start || !text) return
    let i = 0
    const id = setInterval(() => {
      i += 2
      setN(Math.min(i, text.length))
      if (i >= text.length) { clearInterval(id); onDone?.() }
    }, speed)
    return () => clearInterval(id)
  }, [text, start, speed]) // eslint-disable-line react-hooks/exhaustive-deps
  return { shown: text.slice(0, n), done: n >= text.length }
}

export const Cursor = ({ color = 'rgb(var(--accent))' }) => <span className="ml-0.5 inline-block h-[1.05em] w-[0.45em] translate-y-[2px] opacity-60" style={{ background: color }} />
