import type { Metadata } from '../../api/types'
import { provenance } from './common'

export const metadata = (over: Partial<Metadata> = {}): Metadata => ({
  app_version: '0.1.0',
  data_available: true,
  load_error: null,
  refresh: {
    status: 'ok',
    last_attempt_at: '2026-10-25T14:00:00Z',
    last_success_at: '2026-10-25T14:00:00Z',
    error: null,
  },
  provenance: provenance(),
  sources: [
    {
      code: 'FUELHH',
      endpoint: 'https://example.test/FUELHH',
      documentation_url: 'https://example.test/docs/FUELHH',
      query_parameters: { fuelType: 'WIND' },
    },
    {
      code: 'WINDFOR',
      endpoint: 'https://example.test/WINDFOR',
      documentation_url: 'https://example.test/docs/WINDFOR',
      query_parameters: {},
    },
  ],
  analysis_month: '2026-01',
  bases: [
    {
      id: 'decision_date',
      label: 'Decisions made in January 2026',
      description: 'Decisions on 1-31 Jan.',
      date_type: 'decision',
      min_date: '2026-01-01',
      max_date: '2026-01-31',
      default_from: '2026-01-01',
      default_to: '2026-01-31',
    },
    {
      id: 'delivery_date',
      label: 'Deliveries in January 2026',
      description: 'Delivery on 1-31 Jan.',
      date_type: 'delivery',
      min_date: '2026-01-01',
      max_date: '2026-01-31',
      default_from: '2026-01-01',
      default_to: '2026-01-31',
    },
  ],
  default_basis: 'decision_date',
  default_cutoff: '09:20',
  cutoff_presets: [
    { value: '09:20', label: 'EPEX SPOT GB gate closure', note: 'default' },
    { value: '09:50', label: 'N2EX gate closure', note: 'indicative' },
  ],
  thresholds: {
    coverage_sufficient: 0.98,
    coverage_partial: 0.9,
    stale_forecast_hours: 36,
    max_range_days: 62,
  },
  delivery_coverage_from: '2026-01-01',
  delivery_coverage_to: '2026-02-01',
  actuals_rows: 100,
  forecasts_rows: 1000,
  quality: {},
  warnings: [],
  sign_convention: 'error = forecast - actual; positive = over-forecast',
  forecast_alignment: 'hold',
  unit: 'MW',
  ...over,
})
