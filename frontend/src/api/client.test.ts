import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, buildUrl, getJson, api } from './client'
import { shouldRetry } from './hooks'

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })),
  )

afterEach(() => vi.unstubAllGlobals())

describe('buildUrl', () => {
  it('drops empty, null and undefined values and encodes the rest', () => {
    expect(buildUrl('/api/x', { a: 1, b: '', c: undefined, d: null, e: 'x y', f: false })).toBe(
      '/api/x?a=1&e=x+y&f=false',
    )
  })
  it('has no trailing "?" without parameters', () => {
    expect(buildUrl('/api/x', {})).toBe('/api/x')
  })
})

describe('getJson', () => {
  it('returns parsed JSON on success', async () => {
    respond(200, { ok: true })
    await expect(getJson('/api/x')).resolves.toEqual({ ok: true })
  })

  it('maps the standard error envelope to ApiError with code, status and details', async () => {
    respond(503, { error: { code: 'data_unavailable', message: 'No data', details: { remedy: 'ingest' } } })
    const err = await getJson('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 503,
      code: 'data_unavailable',
      message: 'No data',
      details: { remedy: 'ingest' },
    })
  })

  it('still produces an ApiError when the error body is not our envelope', async () => {
    respond(502, '<html>Bad gateway</html>')
    const err = await getJson('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 502, code: 'http_error' })
  })

  it('maps a rejected fetch to NetworkError (not timed out)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const err: unknown = await getJson('/api/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NetworkError)
    expect((err as NetworkError).timedOut).toBe(false)
  })

  it('lets a caller-cancelled request propagate as an abort, not a NetworkError', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    const err: unknown = await getJson('/api/x', {}, controller.signal).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(NetworkError)
  })
})

describe('typed endpoints', () => {
  it('send the analysis selection as query parameters', async () => {
    const spy = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await api.summary({ basis: 'delivery_date', from: '2026-01-05', to: '2026-01-11', cutoff: '09:50' })
    expect(String(spy.mock.calls[0]?.[0])).toBe(
      '/api/summary?basis=delivery_date&from=2026-01-05&to=2026-01-11&cutoff=09%3A50',
    )
  })

  it('builds a CSV export URL without pagination parameters', () => {
    const url = api.intervalsCsvUrl(
      { basis: 'decision_date', from: '2026-01-01', to: '2026-01-31', cutoff: '09:20' },
      { page: 3, page_size: 100, sort_by: 'abs_error', sort_dir: 'desc', status: 'matched' },
    )
    expect(url).toContain('/api/intervals/export?')
    expect(url).toContain('sort_by=abs_error')
    expect(url).not.toContain('page=')
    expect(url).not.toContain('page_size')
  })
})

describe('shouldRetry', () => {
  it('retries transport failures and upstream 5xx a limited number of times', () => {
    expect(shouldRetry(0, new NetworkError('x'))).toBe(true)
    expect(shouldRetry(2, new NetworkError('x'))).toBe(false)
    expect(shouldRetry(0, new ApiError(503, 'data_unavailable', 'x'))).toBe(true)
  })
  it('never retries deterministic client errors', () => {
    expect(shouldRetry(0, new ApiError(422, 'invalid_request', 'x'))).toBe(false)
    expect(shouldRetry(0, new ApiError(404, 'not_found', 'x'))).toBe(false)
    expect(shouldRetry(0, new Error('boom'))).toBe(false)
  })
})
