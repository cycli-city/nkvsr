import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// In development the UI calls same-origin `/api/*`, proxied to the FastAPI server (no CORS needed).
// In production set VITE_API_BASE_URL to the deployed backend origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
    },
  },
  preview: { port: 4173 },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})
