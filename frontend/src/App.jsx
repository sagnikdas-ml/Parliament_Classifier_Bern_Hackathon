import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getStatus } from './lib/api.js'
import Backdrop from './components/Backdrop.jsx'
import Dock from './components/Dock.jsx'
import Constellation from './views/Constellation.jsx'
import Scanner from './views/Scanner.jsx'

export default function App() {
  // demo deep links: #scanner opens the fact-check view, #scan also starts the analysis
  const [view, setView] = useState(window.location.hash.startsWith('#scan') ? 'scanner' : 'constellation')
  const [theme, setTheme] = useState(() => localStorage.getItem('polinews-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dusk' : 'paper'))
  const [status, setStatus] = useState(null)

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('polinews-theme', theme) }, [theme])
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

  // a near-empty archive would only burn Apertus calls to return "unverified": stay in demo mode below 1000 affairs
  const backendReady = !!status && status.affairs >= 1000

  return (
    <div className="relative min-h-full">
      <Backdrop theme={theme} dim={view === 'scanner'} />
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between bg-gradient-to-b from-bg from-60% via-bg/80 to-transparent px-8 pb-12 pt-6">
        <div>
          <div className="font-serif text-[22px] font-semibold tracking-tight text-ink">PoliNews</div>
          <div className="text-[12px] text-muted">News, checked against the parliamentary record</div>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className={`h-2 w-2 rounded-full ${status ? 'bg-ok' : 'bg-warn'}`} />
          {status ? `Archive online · ${Number(status.affairs).toLocaleString('en-CH')} affairs` : 'Archive offline · demo data'}
        </div>
      </header>
      <main className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {view === 'constellation' ? <Constellation backendReady={backendReady} /> : <Scanner backendReady={backendReady} autoRun={window.location.hash === '#scan'} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Dock view={view} setView={setView} theme={theme} setTheme={setTheme} />
    </div>
  )
}
