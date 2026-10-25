import type { ReactNode } from 'react'
import { API_BASE_URL, ApiError, NetworkError } from '../../api/client'
import { Button } from '../ui/primitives'

interface Described {
  title: string
  body: ReactNode
  tone: 'error' | 'warning'
}

function remedyOf(error: ApiError): string | null {
  const details = error.details as { remedy?: unknown } | null
  return details && typeof details.remedy === 'string' ? details.remedy : null
}

function describeError(error: unknown): Described {
  if (error instanceof ApiError) {
    if (error.code === 'data_unavailable') {
      const remedy = remedyOf(error)
      return {
        tone: 'warning',
        title: 'No dataset is loaded',
        body: (
          <>
            <p>{error.message}</p>
            {remedy && <p className="mt-2 font-mono text-xs text-slate-600">{remedy}</p>}
            <p className="mt-2">
              WindScope never substitutes made-up numbers when real Elexon data is missing, so there is
              nothing to chart until a snapshot has been ingested.
            </p>
          </>
        ),
      }
    }
    if (error.status === 422) {
      return {
        tone: 'warning',
        title: "That selection isn't valid",
        body: <p>{error.message}</p>,
      }
    }
    if (error.status === 404) {
      return { tone: 'warning', title: 'Nothing found', body: <p>{error.message}</p> }
    }
    return {
      tone: 'error',
      title: 'The API reported an error',
      body: (
        <p>
          {error.message}{' '}
          <span className="text-slate-500">
            (code: {error.code}, HTTP {error.status})
          </span>
        </p>
      ),
    }
  }
  if (error instanceof NetworkError) {
    return {
      tone: 'error',
      title: error.timedOut ? 'The API is taking too long to respond' : "Can't reach the API",
      body: (
        <>
          <p>{error.message}</p>
          <p className="mt-2 text-slate-600">
            {error.timedOut
              ? 'Free-tier hosting can take up to a minute to wake after inactivity - trying again usually works.'
              : `Requests go to ${API_BASE_URL || 'this site (same origin, /api)'}.`}
          </p>
        </>
      ),
    }
  }
  return {
    tone: 'error',
    title: 'Something unexpected went wrong',
    body: <p>{error instanceof Error ? error.message : String(error)}</p>,
  }
}

export function ErrorState({
  error,
  onRetry,
  onReset,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  /** Offered for invalid-selection errors, to get back to a known-good state. */
  onReset?: () => void
  compact?: boolean
}) {
  const { title, body, tone } = describeError(error)
  const isInvalidSelection = error instanceof ApiError && error.status === 422
  return (
    <div
      role="alert"
      className={`rounded-xl border p-5 text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-amber-200 bg-amber-50 text-amber-950'
      } ${compact ? 'p-3' : ''}`}
    >
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-1 leading-relaxed">{body}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {isInvalidSelection && onReset && (
          <Button variant="primary" onClick={onReset}>
            Reset selection
          </Button>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-slate-600">{children}</div>}
    </div>
  )
}
