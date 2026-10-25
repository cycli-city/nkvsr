import type { IntervalRow, Intervals } from '../../api/types'
import { analysis, provenance } from './common'

export const row = (over: Partial<IntervalRow> = {}): IntervalRow => ({
  start_time: '2026-01-15T08:30:00Z',
  delivery_date: '2026-01-15',
  local_label: '2026-01-15 08:30',
  settlement_period: 18,
  decision_cutoff_time: '2026-01-14T09:20:00Z',
  forecast_publish_time: '2026-01-14T08:30:00Z',
  forecast_mw: 5307,
  actual_mw: 4985,
  error_mw: 322,
  abs_error_mw: 322,
  forecast_age_h: 0.83,
  lead_time_h: 24,
  latest_forecast_mw: 5420,
  latest_publish_time: '2026-01-15T06:30:00Z',
  match_status: 'matched',
  ...over,
})

export const intervals = (items: IntervalRow[] = [row()], over: Partial<Intervals> = {}): Intervals => ({
  analysis: analysis(),
  provenance: provenance(),
  total: items.length,
  page: 1,
  page_size: 50,
  total_pages: 1,
  items,
  ...over,
})
