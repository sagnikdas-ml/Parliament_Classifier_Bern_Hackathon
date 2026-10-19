import { motion } from 'framer-motion'
import { Moon, Orbit, ScanSearch, Sun } from 'lucide-react'

const ITEMS = [
  { id: 'scanner', label: 'Fact-check', Icon: ScanSearch },
  { id: 'constellation', label: 'Policy map', Icon: Orbit },
]

/** Floating dock: the two views plus the theme switch. Keyboard shortcuts remain available. */
export default function Dock({ view, setView, theme, setTheme }) {
  return (
    <>
    <motion.nav initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}
      className="fixed bottom-7 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-line bg-surface/90 p-1.5 backdrop-blur-md"
      style={{ boxShadow: '0 18px 40px -20px rgb(var(--shadow) / .35)' }} aria-label="Views">
      {ITEMS.map(({ id, label, Icon }) => {
        const on = view === id
        return (
          <button key={id} onClick={() => setView(id)} aria-current={on ? 'page' : undefined}
            className="relative flex items-center gap-2 rounded-full px-5 py-2.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {on && <motion.span layoutId="dock-pill" className="absolute inset-0 rounded-full bg-accent/12" transition={{ type: 'spring', stiffness: 260, damping: 30 }} />}
            <Icon size={17} strokeWidth={1.7} className={`relative ${on ? 'text-accent' : 'text-muted'}`} />
            <span className={`relative text-[14px] font-medium ${on ? 'text-ink' : 'text-muted'}`}>{label}</span>
          </button>
        )
      })}
    </motion.nav>
    <button onClick={() => setTheme(theme === 'paper' ? 'dusk' : 'paper')} aria-label={`Switch to ${theme === 'paper' ? 'dusk' : 'paper'} theme`}
      className="fixed bottom-7 right-7 z-50 rounded-full border border-line bg-surface/90 p-3 text-muted shadow-lg backdrop-blur-md transition-colors duration-300 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-[400px]:bottom-24 max-[400px]:right-4">
      {theme === 'paper' ? <Moon size={17} strokeWidth={1.7} /> : <Sun size={17} strokeWidth={1.7} />}
    </button>
    </>
  )
}
