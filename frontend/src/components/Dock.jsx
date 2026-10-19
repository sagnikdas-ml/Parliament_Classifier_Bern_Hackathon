import { motion } from 'framer-motion'
import { Moon, Orbit, ScanSearch, Sun } from 'lucide-react'

const ITEMS = [
  { id: 'constellation', label: 'Policy map', key: '1', Icon: Orbit },
  { id: 'scanner', label: 'Fact-check', key: '2', Icon: ScanSearch },
]

/** Floating dock: the two views plus the theme switch. Keys 1 / 2 also switch. */
export default function Dock({ view, setView, theme, setTheme }) {
  return (
    <motion.nav initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}
      className="fixed bottom-7 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface/90 p-1.5 backdrop-blur-md"
      style={{ boxShadow: '0 18px 40px -20px rgb(var(--shadow) / .35)' }} aria-label="Views">
      {ITEMS.map(({ id, label, key, Icon }) => {
        const on = view === id
        return (
          <button key={id} onClick={() => setView(id)} aria-current={on ? 'page' : undefined}
            className="relative flex items-center gap-2 rounded-full px-5 py-2.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {on && <motion.span layoutId="dock-pill" className="absolute inset-0 rounded-full bg-accent/12" transition={{ type: 'spring', stiffness: 260, damping: 30 }} />}
            <Icon size={17} strokeWidth={1.7} className={`relative ${on ? 'text-accent' : 'text-muted'}`} />
            <span className={`relative text-[14px] font-medium ${on ? 'text-ink' : 'text-muted'}`}>{label}</span>
            <span className="relative rounded border border-line px-1 font-mono text-[10px] text-muted">{key}</span>
          </button>
        )
      })}
      <span className="mx-1 h-6 w-px bg-line" />
      <button onClick={() => setTheme(theme === 'paper' ? 'dusk' : 'paper')} aria-label={`Switch to ${theme === 'paper' ? 'dusk' : 'paper'} theme`}
        className="rounded-full p-2.5 text-muted transition-colors duration-300 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {theme === 'paper' ? <Moon size={17} strokeWidth={1.7} /> : <Sun size={17} strokeWidth={1.7} />}
      </button>
    </motion.nav>
  )
}
