/** Colours are CSS variables (see src/index.css) so one switch flips Paper <-> Dusk. */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: { bg: c('bg'), surface: c('surface'), sunk: c('sunk'), ink: c('ink'), muted: c('muted'), line: c('line'),
                accent: c('accent'), ok: c('ok'), bad: c('bad'), warn: c('warn'), aps: c('aps') },
      keyframes: { pulseRing: { '0%': { transform: 'scale(.9)', opacity: 0.5 }, '100%': { transform: 'scale(2)', opacity: 0 } } },
      animation: { pulseRing: 'pulseRing 3.4s ease-out infinite' },
    },
  },
  plugins: [],
}
