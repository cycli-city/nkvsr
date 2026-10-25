import type { Accuracy } from '../../api/types'
import { distribution, summary } from './summary'
import { analysis, provenance } from './common'
import { row } from './intervals'

const group = {
  expected: 48,
  n: 48,
  coverage: 1,
  mae_mw: 900,
  rmse_mw: 1100,
  bias_mw: 50,
  wape: 0.15,
  mean_forecast_mw: 6000,
  mean_actual_mw: 5950,
}

export const accuracy = (over: Partial<Accuracy> = {}): Accuracy => ({
  analysis: analysis(),
  provenance: provenance(),
  coverage: summary().coverage,
  metrics: summary().metrics,
  daily: [
    { ...group, delivery_date: '2026-01-02', decision_date: '2026-01-01' },
    { ...group, delivery_date: '2026-01-03', decision_date: '2026-01-02' },
  ],
  by_slot: ['00:00', '00:30'].map((slot, i) => ({ ...group, slot, settlement_period: i + 1 })),
  by_daypart: [
    { ...group, daypart: 'day', definition: '07:00-23:00 local time' },
    { ...group, daypart: 'night', definition: '23:00-07:00 local time' },
  ],
  histogram: {
    bin_width_mw: 250,
    bins: [
      { lower_mw: -250, upper_mw: 0, count: 10 },
      { lower_mw: 0, upper_mw: 250, count: 12 },
    ],
  },
  error_distribution: distribution,
  largest_errors: [row()],
  ...over,
})
