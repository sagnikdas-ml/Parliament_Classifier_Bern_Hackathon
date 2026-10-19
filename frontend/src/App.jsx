import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getStatus } from './lib/api.js'
import Backdrop from './components/Backdrop.jsx'
import Dock from './components/Dock.jsx'
import Constellation from './views/Constellation.jsx'
import Scanner from './views/Scanner.jsx'
import { Segmented } from './components/ui.jsx'

const LANGUAGES = ['DE', 'FR', 'IT', 'RM', 'EN']
function initialLanguage() {
  try { const saved = localStorage.getItem('polinews.language')?.toUpperCase(); return LANGUAGES.includes(saved) ? saved : 'EN' } catch { return 'EN' }
}

export default function App() {
  // #map opens the archive map; #scan runs a supplied story on entry.
  const [view, setView] = useState(window.location.hash.startsWith('#map') ? 'constellation' : 'scanner')
  const [theme, setTheme] = useState(() => localStorage.getItem('polinews-theme') || 'paper')
  const [language, setLanguage] = useState(initialLanguage)
  const [status, setStatus] = useState(null)

  const changeLanguage = (next) => {
    setLanguage(next)
    window.dispatchEvent(new CustomEvent('polinews-language-changed', { detail: next }))
  }

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('polinews-theme', theme) }, [theme])
  useEffect(() => { try { localStorage.setItem('polinews.language', language.toLowerCase()) } catch {} }, [language])
  useEffect(() => {
    let alive = true
    const poll = () => getStatus().then((s) => alive && setStatus(s))
    poll(); const t = setInterval(poll, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  useEffect(() => {
    const onKey = (e) => {
      if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) return
      if (e.key === '1') setView('constellation')
      if (e.key === '2') setView('scanner')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const backendReady = !!status

  return (
    <div className="relative min-h-full">
      <Backdrop theme={theme} dim={view === 'scanner'} />
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between bg-gradient-to-b from-bg from-60% via-bg/80 to-transparent px-8 pb-12 pt-6">
        <div className="font-serif text-[22px] font-semibold tracking-tight text-ink">ParlaRadar</div>
        <div className="pointer-events-auto flex items-center gap-3 text-[12px] text-muted">
          <Segmented id="header-language" label="Output language" value={language} onChange={changeLanguage} options={LANGUAGES} />
          <span className={`h-2 w-2 rounded-full ${status ? 'bg-ok' : 'bg-warn'}`} />
          {status ? `${Number(status.affairs).toLocaleString('en-CH')} affairs` : 'Archive offline'}
        </div>
        <a href="/legacy" className="pointer-events-auto absolute right-8 top-14 text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-ink">Full workspace</a>
      </header>
      <main className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {view === 'constellation' ? <Constellation backendReady={backendReady} /> : <Scanner language={language} setLanguage={setLanguage} autoRun={window.location.hash === '#scan'} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Dock view={view} setView={setView} theme={theme} setTheme={setTheme} />
    </div>
  )
}
