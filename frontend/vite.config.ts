import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { CSP_SAME_ORIGIN, PERMISSIONS_POLICY } from './csp'

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
  // The browser tests run against `vite preview`, so give it the production security headers: a CSP that
  // blocks something the app needs then fails the end-to-end suite instead of failing in front of a user.
  preview: {
    port: 4173,
    headers: {
      'Content-Security-Policy': CSP_SAME_ORIGIN,
      'Permissions-Policy': PERMISSIONS_POLICY,
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    testTimeout: 15_000, // whole-app flows render code-split pages; leave headroom on slow runners
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})
