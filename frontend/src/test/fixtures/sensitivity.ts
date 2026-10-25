import type { CutoffSensitivity, SensitivityPoint } from '../../api/types'
import { analysis, provenance } from './common'

const point = (over: Partial<SensitivityPoint>): SensitivityPoint => ({
  cutoff_local: '09:20',
  is_selected: false,
  is_run_time: true,
  run_used_local: '07:30',
  n: 1488,
  coverage: 1,
  mae_mw: 2042,
  rmse_mw: 2509,
  bias_mw: 1748,
  wape: 0.181,
  median_forecast_age_h: 0,
  ...over,
})

/** Mirrors the shape (not the values' meaning) of the live response: eight regular runs plus the chosen cutoff. */
export const sensitivity = (over: Partial<CutoffSensitivity> = {}): CutoffSensitivity => ({
  analysis: analysis(),
  provenance: provenance(),
  selected_cutoff: '09:20',
  run_times_local: ['04:30', '07:30', '09:30', '22:30'],
  points: [
    point({ cutoff_local: '04:30', run_used_local: '04:30', mae_mw: 2020, bias_mw: 1671 }),
    point({ cutoff_local: '07:30', run_used_local: '07:30', mae_mw: 2042, bias_mw: 1748 }),
    point({
      cutoff_local: '09:20',
      is_selected: true,
      is_run_time: false,
      run_used_local: '07:30',
      median_forecast_age_h: 1.83,
    }),
    point({ cutoff_local: '09:30', run_used_local: '09:30', mae_mw: 2016, bias_mw: 1730 }),
    point({ cutoff_local: '22:30', run_used_local: '22:30', mae_mw: 1830, bias_mw: 1603 }),
  ],
  note: 'Each point repeats the whole analysis with only the decision cutoff moved.',
  ...over,
})
