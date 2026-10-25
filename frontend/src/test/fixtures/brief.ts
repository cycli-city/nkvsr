import type { DecisionBrief } from '../../api/types'
import { provenance } from './common'

export const brief = (): DecisionBrief => ({
  provenance: provenance(),
  decision_date: '2026-01-31',
  delivery_date: '2026-02-01',
  cutoff_local: '09:20',
  cutoff_time: '2026-01-31T09:20:00Z',
  forecast_set: {
    n_intervals: 48,
    n_with_forecast: 48,
    distinct_publications: 2,
    first_publish_time: '2026-01-31T08:30:00Z',
    last_publish_time: '2026-01-31T09:00:00Z',
    mean_mw: 6608,
    peak_mw: 10774,
    peak_time: '2026-02-01T13:00:00Z',
    trough_mw: 2490,
    trough_time: '2026-02-01T23:00:00Z',
    energy_mwh: 158600,
  },
  hindsight: {
    n_matched: 48,
    mean_actual_mw: 6658,
    mae_mw: 866,
    bias_mw: -51,
    latest_mean_mw: 6765,
    note: 'n',
  },
  points: [
    {
      start_time: '2026-02-01T00:00:00Z',
      slot: '00:00',
      forecast_mw: 6000,
      forecast_publish_time: '2026-01-31T09:00:00Z',
      actual_mw: 6100,
      error_mw: -100,
    },
  ],
})
