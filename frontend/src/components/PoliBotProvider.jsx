import { createContext, useContext, useMemo, useState } from 'react'
import PoliBot from './PoliBot.jsx'

const noop = () => {}
const Publishers = createContext({ scanner: noop, constellation: noop })
export const useBotPublisher = view => useContext(Publishers)[view]

// Keep bot updates outside App's navigation state so they do not interrupt page transitions.
export default function PoliBotProvider({ view, children }) {
  const [scanner, setScanner] = useState(null)
  const [constellation, setConstellation] = useState(null)
  const publishers = useMemo(() => ({ scanner: setScanner, constellation: setConstellation }), [])
  return <Publishers.Provider value={publishers}>
    {children}
    <PoliBot context={view === 'scanner' ? scanner : constellation} />
  </Publishers.Provider>
}
