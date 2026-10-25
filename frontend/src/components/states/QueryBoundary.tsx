import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Spinner } from '../ui/primitives'
import { EmptyState, ErrorState } from './ErrorState'

/** Seconds since mount; used to explain slow cold starts while a request is pending. */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return seconds
}

export const COLD_START_HINT_AFTER_S = 6

export function LoadingState({ skeleton, label = 'Loading' }: { skeleton: ReactNode; label?: string }) {
  const elapsed = useElapsedSeconds()
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {label}…
      </span>
      {skeleton}
      {elapsed >= COLD_START_HINT_AFTER_S && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600" data-testid="cold-start-hint">
          <Spinner />
          Still waiting for the API. Free-tier hosting can take up to a minute to wake after inactivity.
        </p>
      )}
    </div>
  )
}

interface Props<T> {
  query: UseQueryResult<T, Error>
  skeleton: ReactNode
  children: (data: T) => ReactNode
  /** When it returns true the `empty` node is shown instead of `children`. */
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  onReset?: () => void
  label?: string
}

/**
 * One place that turns a query's lifecycle into UI: skeleton while pending, a described error with
 * retry, a quiet "updating" state while refetching, and a graceful stale-data notice if a refresh fails.
 */
export function QueryBoundary<T>({ query, skeleton, children, isEmpty, empty, onReset, label }: Props<T>) {
  if (query.isPending) return <LoadingState skeleton={skeleton} label={label} />
  if (query.isError && query.data === undefined) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} onReset={onReset} />
  }
  const data = query.data as T
  if (isEmpty?.(data)) return <>{empty ?? <EmptyState title="Nothing to show" />}</>
  return (
    <div
      aria-busy={query.isFetching}
      className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
    >
      {query.isError && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Couldn&apos;t refresh this view; showing the last result.{' '}
          <button type="button" className="font-medium underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {children(data)}
    </div>
  )
}
