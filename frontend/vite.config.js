import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The FastAPI backend rejects cross-origin writes, so the dev server proxies /api and presents the backend's own origin.
const BACKEND = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: BACKEND, changeOrigin: true, configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', BACKEND)) } },
  },
})
