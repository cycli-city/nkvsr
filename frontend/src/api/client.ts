import type {
  Accuracy,
  AnalysisParams,
  DecisionBrief,
  IntervalQuery,
  Intervals,
  Metadata,
  Summary,
  TimeSeries,
  Vintages,
} from './types'

/** Empty string => same-origin `/api/*` (Vite dev proxy or a reverse proxy in production). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** Hosted free tiers can need ~a minute to wake; anything longer is a genuine failure. */
export const REQUEST_TIMEOUT_MS = 60_000

/** The API answered with a non-2xx status and the standard `{error: {code, message, details}}` body. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** The API could not be reached at all (offline, DNS, CORS, timeout, server down). */
export class NetworkError extends Error {
  readonly timedOut: boolean

  constructor(message: string, timedOut = false) {
    super(message)
    this.name = 'NetworkError'
    this.timedOut = timedOut
  }
}

type QueryValue = string | number | boolean | undefined | null
type Query = Record<string, QueryValue>

export function buildUrl(path: string, query?: Query): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } }
    if (body.error) {
      return new ApiError(
        response.status,
        body.error.code ?? 'http_error',
        body.error.message ?? response.statusText,
        body.error.details,
      )
    }
  } catch {
    /* fall through: body was not our JSON envelope */
  }
  return new ApiError(response.status, 'http_error', `${response.status} ${response.statusText}`.trim())
}

export async function getJson<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      headers: { Accept: 'application/json' },
      signal: combined,
    })
  } catch (error) {
    if (signal?.aborted) throw error // a cancelled query: let react-query handle it
    const timedOut = timeout.aborted
    throw new NetworkError(
      timedOut
        ? `The API did not respond within ${REQUEST_TIMEOUT_MS / 1000} s.`
        : 'The API could not be reached. Check your connection or try again shortly.',
      timedOut,
    )
  }
  if (!response.ok) throw await parseError(response)
  return (await response.json()) as T
}

const analysisQuery = (p: AnalysisParams): Query => ({
  basis: p.basis,
  from: p.from,
  to: p.to,
  cutoff: p.cutoff,
})

export const api = {
  metadata: (signal?: AbortSignal) => getJson<Metadata>('/api/metadata', undefined, signal),
  summary: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<Summary>('/api/summary', analysisQuery(p), signal),
  timeseries: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<TimeSeries>('/api/timeseries', analysisQuery(p), signal),
  accuracy: (p: AnalysisParams, signal?: AbortSignal) =>
    getJson<Accuracy>('/api/accuracy', analysisQuery(p), signal),
  intervals: (p: AnalysisParams, q: IntervalQuery, signal?: AbortSignal) =>
    getJson<Intervals>('/api/intervals', { ...analysisQuery(p), ...q }, signal),
  intervalsCsvUrl: (p: AnalysisParams, q: IntervalQuery) =>
    buildUrl('/api/intervals/export', { ...analysisQuery(p), ...q, page: undefined, page_size: undefined }),
  vintages: (start: string, cutoff: string, signal?: AbortSignal) =>
    getJson<Vintages>('/api/forecast-vintages', { start, cutoff }, signal),
  decisionBrief: (decisionDate: string, cutoff: string, signal?: AbortSignal) =>
    getJson<DecisionBrief>('/api/decision-brief', { decision_date: decisionDate, cutoff }, signal),
}
