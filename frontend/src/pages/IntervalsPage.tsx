import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useIntervals } from '../api/hooks'
import type { IntervalSort } from '../api/types'
import { EmptyState } from '../components/states/ErrorState'
import { QueryBoundary } from '../components/states/QueryBoundary'
import { IntervalsTable, Pagination } from '../components/tables/IntervalsTable'
import { Button, Card, SectionHeader, Skeleton } from '../components/ui/primitives'
import { fmtDate, fmtNumber } from '../lib/format'
import { parseIntervalQuery, STATUSES } from '../lib/intervalQuery'
import { useAnalysis } from '../state/useAnalysis'

const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  all: 'All intervals',
  matched: 'Matched only',
  missing_any: 'Any missing data',
  missing_forecast: 'Missing forecast',
  missing_actual: 'Missing actual',
  missing_both: 'Missing both',
}

const fieldCls =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm'
const labelCls = 'block text-xs font-medium text-slate-600'

export function IntervalsPage() {
  const { params, resetAnalysis } = useAnalysis()
  const [search, setSearch] = useSearchParams()
  const query = useMemo(() => parseIntervalQuery(search), [search])
  const result = useIntervals(params, query)
  const ids = { status: useId(), dir: useId(), min: useId(), q: useId() }

  const update = useCallback(
    (patch: Record<string, string | number | undefined>) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === '') next.delete(key)
            else next.set(key, String(value))
          }
          return next
        },
        { replace: true },
      ),
    [setSearch],
  )

  // Free-text search: `draft` holds what the user is typing; it is committed to the URL after a short
  // pause (so typing does not fire a request per keystroke). With no draft the URL is the source of truth.
  const [draft, setDraft] = useState<string | null>(null)
  const searchText = draft ?? query.q ?? ''
  useEffect(() => {
    if (draft === null) return
    const id = window.setTimeout(() => {
      update({ q: draft.trim() || undefined, page: undefined })
      setDraft(null)
    }, 300)
    return () => window.clearTimeout(id)
  }, [draft, update])

  const onSort = (sort: IntervalSort) =>
    update({
      sort_by: sort,
      sort_dir:
        query.sort_by === sort && query.sort_dir === 'asc'
          ? 'desc'
          : query.sort_by === sort
            ? 'asc'
            : sort === 'start_time'
              ? 'asc'
              : 'desc',
      page: undefined,
    })

  const filtered =
    query.status !== 'all' ||
    query.direction !== undefined ||
    query.min_abs_error !== undefined ||
    query.q !== undefined
  const clearFilters = () => {
    setDraft(null)
    update({
      status: undefined,
      direction: undefined,
      min_abs_error: undefined,
      q: undefined,
      page: undefined,
    })
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Delivery interval explorer"
        subtitle="Every half-hour behind the KPIs: the cutoff that applied, the forecast that was published before it, the actual, and the error. Gaps are listed, not hidden."
        actions={
          params && (
            <a
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              href={api.intervalsCsvUrl(params, query)}
              download
            >
              Export CSV ↓
            </a>
          )
        }
      />

      <Card className="p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label="Filter intervals"
        >
          <div>
            <label htmlFor={ids.status} className={labelCls}>
              Status
            </label>
            <select
              id={ids.status}
              className={fieldCls}
              value={query.status}
              onChange={(e) =>
                update({ status: e.target.value === 'all' ? undefined : e.target.value, page: undefined })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.dir} className={labelCls}>
              Direction of error
            </label>
            <select
              id={ids.dir}
              className={fieldCls}
              value={query.direction ?? ''}
              onChange={(e) => update({ direction: e.target.value || undefined, page: undefined })}
            >
              <option value="">Over and under</option>
              <option value="over">Over-forecast only (F &gt; A)</option>
              <option value="under">Under-forecast only (F &lt; A)</option>
            </select>
          </div>
          <div>
            <label htmlFor={ids.min} className={labelCls}>
              Minimum |error| (MW)
            </label>
            <input
              id={ids.min}
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              className={fieldCls}
              placeholder="e.g. 1000"
              value={query.min_abs_error ?? ''}
              onChange={(e) =>
                update({ min_abs_error: e.target.value === '' ? undefined : e.target.value, page: undefined })
              }
            />
          </div>
          <div>
            <label htmlFor={ids.q} className={labelCls}>
              Search date / time
            </label>
            <input
              id={ids.q}
              type="search"
              className={fieldCls}
              placeholder="e.g. 2026-01-15 08:30 or Sat"
              value={searchText}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" disabled={!filtered} onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </form>
      </Card>

      <QueryBoundary
        query={result}
        skeleton={<Skeleton className="h-96" />}
        onReset={resetAnalysis}
        isEmpty={(d) => d.total === 0}
        empty={
          <EmptyState title="No intervals match these filters">
            Try widening the filters{filtered ? '' : ' or the date range'}.{' '}
            {filtered && (
              <button type="button" className="font-medium text-teal-700 underline" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </EmptyState>
        }
        label="Loading intervals"
      >
        {(d) => (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong className="tabular-nums text-slate-900">{fmtNumber(d.total)}</strong> half-hours ·
              delivery {fmtDate(d.analysis.delivery_from, 'short')} –{' '}
              {fmtDate(d.analysis.delivery_to, 'short')} · cutoff {d.analysis.cutoff_local} UK time the day
              before · error = forecast − actual
            </p>
            <IntervalsTable
              rows={d.items}
              sortBy={query.sort_by}
              sortDir={query.sort_dir}
              onSort={onSort}
              caption={`Delivery intervals, ${d.total} rows, sorted by ${query.sort_by} ${query.sort_dir}`}
            />
            <Pagination
              page={d.page}
              totalPages={d.total_pages}
              total={d.total}
              pageSize={d.page_size}
              onPage={(p) => update({ page: p === 1 ? undefined : p })}
              onPageSize={(n) => update({ page_size: n === 50 ? undefined : n, page: undefined })}
            />
          </div>
        )}
      </QueryBoundary>
    </div>
  )
}
