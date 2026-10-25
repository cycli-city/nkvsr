import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests drive a real browser against the real FastAPI app and the production Vite build.
 *
 * Data: the API is started on the *synthetic development snapshot* (clearly labelled, never Elexon data) so
 * the suite runs anywhere without network access. The tests assert structure and invariants (sort order,
 * cutoff eligibility, counts that agree across views), not specific wind numbers.
 *
 * E2E_PYTHON selects the interpreter that has the backend installed (default: python3).
 * PW_CHROMIUM_PATH (optional) points at an existing Chromium binary, for sandboxes whose preinstalled
 * browser build differs from the one this Playwright version downloads. CI leaves it unset.
 */
const PY = process.env.E2E_PYTHON ?? 'python3'
const API = 'http://127.0.0.1:8000'
const WEB = 'http://127.0.0.1:4173'
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath },
      },
    },
  ],
  webServer: [
    {
      command: `${PY} -m app.cli generate-synthetic-dev --data-dir ../data/dev && ${PY} -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000`,
      cwd: '../backend',
      env: { DATA_DIR: '../data/dev', APP_ENV: 'development', CORS_ORIGINS: WEB },
      url: `${API}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
