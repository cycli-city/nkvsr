import type { AnalysisEcho, Provenance } from '../../api/types'
export const provenance = (over: Partial<Provenance> = {}): Provenance => ({
  provenance: 'elexon_live',
  is_synthetic: false,
  source_name: 'Elexon BMRS (test)',
  retrieved_at: '2026-10-25T14:00:00Z',
  unit: 'MW',
  attribution: 'Contains BMRS data © Elexon Limited copyright and database right 2026.',
  ...over,
})

export const analysis = (over: Partial<AnalysisEcho> = {}): AnalysisEcho => ({
  basis: 'decision_date',
  decision_from: '2026-01-01',
  decision_to: '2026-01-31',
  delivery_from: '2026-01-02',
  delivery_to: '2026-02-01',
  n_delivery_days: 31,
  cutoff_local: '09:20',
  cutoff_timezone: 'Europe/London',
  cutoff_rule:
    'latest WINDFOR forecast published at or before 09:20 Europe/London on the day before delivery',
  forecast_basis: 'decision_time',
  forecast_block_minutes: 30,
  forecast_alignment: 'hold',
  forecast_alignment_note: null,
  error_convention: 'forecast_minus_actual',
  unit: 'MW',
  ...over,
})
