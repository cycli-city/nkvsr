import type { ReactNode } from 'react'
import { useMetadata } from '../../api/hooks'
import { fmtDateTime } from '../../lib/format'
import { ErrorState } from './ErrorState'
import { LoadingState } from './QueryBoundary'
import { Card, Skeleton } from '../ui/primitives'

/** Shown when the API is healthy but no Elexon snapshot has been ingested (or it was refused/corrupt). */
export function NoDataState() {
  const { data } = useMetadata()
  if (!data) return null
  const r = data.refresh
  return (
    <Card className="mx-auto max-w-3xl p-6">
      <h2 className="text-lg font-semibold text-navy-900">No Elexon data is loaded yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {data.load_error ?? 'The service has not ingested a FUELHH / WINDFOR snapshot.'} WindScope never fills
        gaps with invented numbers, so there is nothing to chart until real data has been retrieved.
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Latest refresh attempt</dt>
          <dd className="text-slate-800">
            {r.status === 'never'
              ? 'None yet'
              : `${r.status === 'failed' ? 'Failed' : r.status} · ${fmtDateTime(r.last_attempt_at)}`}
          </dd>
        </div>
        {r.error && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Reason</dt>
            <dd className="break-words font-mono text-xs text-red-800">{r.error}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        <p className="font-semibold text-navy-900">For the operator</p>
        <p className="mt-1">
          Run <code className="rounded bg-white px-1 py-0.5 font-mono">python -m app.cli ingest</code> from a
          machine that can reach <code className="font-mono">data.elexon.co.uk</code>, or start the API with{' '}
          <code className="font-mono">AUTO_INGEST_ON_START=true</code>. See the README for details.
        </p>
      </div>
    </Card>
  )
}

/**
 * Nothing in the app can render meaningfully before `/api/metadata` has answered, so this gate owns the
 * "API unreachable / waking up / no data" states once, instead of every panel repeating them.
 */
export function MetadataGate({ children }: { children: ReactNode }) {
  const query = useMetadata()
  if (query.isPending) {
    return (
      <LoadingState
        label="Connecting to the WindScope API"
        skeleton={
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-96" />
          </div>
        }
      />
    )
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data.data_available) return <NoDataState />
  return <>{children}</>
}
