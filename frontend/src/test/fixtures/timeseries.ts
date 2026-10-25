import type { TimeSeries } from '../../api/types'
import { analysis, provenance } from './common'

export const timeseries = (): TimeSeries => ({
  analysis: analysis(),
  provenance: provenance(),
  points: ['2026-01-15T08:00:00Z', '2026-01-15T08:30:00Z', '2026-01-15T09:00:00Z'].map((t, i) => ({
    start_time: t,
    delivery_date: '2026-01-15',
    settlement_period: 17 + i,
    actual_mw: 5000 + i * 10,
    forecast_mw: 5300 + i * 10,
    forecast_publish_time: '2026-01-14T08:30:00Z',
    latest_forecast_mw: 5400,
    latest_publish_time: '2026-01-15T06:30:00Z',
    error_mw: 300,
    match_status: 'matched' as const,
  })),
})
