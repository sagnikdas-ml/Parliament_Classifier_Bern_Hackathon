import { useEffect, useRef } from 'react'

/** A quiet background: a few slow, faint stars that join into constellations. Colour follows the theme, motion is very
 *  slow, and it renders a single still frame when the user prefers reduced motion. */
export default function Backdrop({ theme, dim = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext('2d')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf, stars = []
    const rgb = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().replace(/ /g, ',')
    let col = rgb()
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = Array.from({ length: Math.round((w * h) / 42000) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.05, r: Math.random() * 1 + 0.6 }))
    }
    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        if (!still) { s.x += s.vx; s.y += s.vy; if (s.x < 0) s.x = w; if (s.x > w) s.x = 0; if (s.y < 0) s.y = h; if (s.y > h) s.y = 0 }
        ctx.fillStyle = `rgba(${col},.32)`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill()
      }
      for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y, d = Math.hypot(dx, dy)
        if (d < 170) { ctx.strokeStyle = `rgba(${col},${0.12 * (1 - d / 170)})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(stars[j].x, stars[j].y); ctx.stroke() }
      }
      if (!still) raf = requestAnimationFrame(frame)
    }
    resize(); frame()
    const onResize = () => { resize(); if (still) frame() }
    window.addEventListener('resize', onResize)
    const t = setTimeout(() => { col = rgb(); if (still) frame() }, 60) // pick up the theme colour after it switches
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener('resize', onResize) }
  }, [theme])
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full transition-opacity duration-700" style={{ opacity: dim ? 0.35 : 1 }} />
}
