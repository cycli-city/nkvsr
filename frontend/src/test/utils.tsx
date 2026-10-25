import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { App } from '../App'
import * as fx from './fixtures'

type Handler = unknown | ((url: URL) => { status?: number; body: unknown })
export type Routes = Record<string, Handler>

/** The happy-path API: every endpoint answers with the typed fixtures. Override per test. */
export const defaultRoutes = (): Routes => ({
  '/api/metadata': fx.metadata(),
  '/api/summary': fx.summary(),
  '/api/timeseries': fx.timeseries(),
  '/api/accuracy': fx.accuracy(),
  '/api/decision-brief': fx.brief(),
  '/api/intervals': fx.intervals(),
  '/api/forecast-vintages': fx.vintages(),
  '/api/cutoff-sensitivity': fx.sensitivity(),
})

/** Replace global fetch with an in-memory router; returns the spy so tests can inspect requests. */
export function mockApi(overrides: Routes = {}) {
  const routes = { ...defaultRoutes(), ...overrides }
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const handler = routes[url.pathname]
    if (handler === undefined) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: 'Not Found', details: null } }),
        { status: 404 },
      )
    }
    const result =
      typeof handler === 'function'
        ? (handler as (u: URL) => { status?: number; body: unknown })(url)
        : { body: handler }
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

export const apiError =
  (status: number, code: string, message: string, details: unknown = null) =>
  () => ({
    status,
    body: { error: { code, message, details } },
  })

export function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Query-string of every request made to `pathname`, as plain objects. */
export const requestsTo = (spy: ReturnType<typeof mockApi>, pathname: string) =>
  spy.mock.calls
    .map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname === pathname)
    .map((u) => Object.fromEntries(u.searchParams))

/** Find text inside the Executive summary KPIs only. */
export async function kpi(text: string) {
  return (await inSummary()).findByText(text)
}

/** Scope queries to the Executive summary KPIs (numbers like "975 MW" legitimately recur elsewhere). */
export async function inSummary() {
  return within(await screen.findByRole('region', { name: 'Executive summary' }))
}
