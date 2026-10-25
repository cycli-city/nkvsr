import type { IntervalQuery, IntervalSort } from '../api/types'

export const SORTS: IntervalSort[] = [
  'start_time',
  'forecast',
  'actual',
  'error',
  'abs_error',
  'publish_time',
  'forecast_age',
]
export const STATUSES = [
  'all',
  'matched',
  'missing_any',
  'missing_forecast',
  'missing_actual',
  'missing_both',
] as const
export const PAGE_SIZES = [25, 50, 100, 250]

/** Pure parser (exported for tests): page-owned URL params -> a validated API query. */
export function parseIntervalQuery(search: URLSearchParams): IntervalQuery {
  const sort = search.get('sort_by') as IntervalSort | null
  const status = search.get('status') as IntervalQuery['status'] | null
  const direction = search.get('direction')
  const minAbs = Number(search.get('min_abs_error'))
  const pageSize = Number(search.get('page_size'))
  const page = Number(search.get('page'))
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    page_size: PAGE_SIZES.includes(pageSize) ? pageSize : 50,
    sort_by: sort && SORTS.includes(sort) ? sort : 'start_time',
    sort_dir: search.get('sort_dir') === 'desc' ? 'desc' : 'asc',
    status: status && (STATUSES as readonly string[]).includes(status) ? status : 'all',
    direction: direction === 'over' || direction === 'under' ? direction : undefined,
    min_abs_error: search.get('min_abs_error') && Number.isFinite(minAbs) && minAbs >= 0 ? minAbs : undefined,
    q: search.get('q')?.trim() || undefined,
  }
}
