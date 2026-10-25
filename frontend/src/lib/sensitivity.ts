import type { CutoffSensitivity, SensitivityPoint } from '../api/types'
import { fmtDuration, fmtMW, fmtSignedMW, fmtSignedPct } from './format'

/** Where a cutoff sits relative to the one the user chose: only earlier ones could have informed that decision. */
export type Availability = 'selected' | 'before' | 'after'

/** "HH:MM" strings of the same day compare correctly as text. */
export function availability(point: SensitivityPoint, selectedCutoff: string): Availability {
  if (point.is_selected) return 'selected'
  return point.cutoff_local < selectedCutoff ? 'before' : 'after'
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  selected: 'Your cutoff (used for every KPI)',
  before: 'Earlier than your cutoff',
  after: 'After your cutoff (hindsight)',
}

/** Plain-language reading of the numbers. Descriptive only: it never explains *why* a difference exists. */
export function readSensitivity(data: CutoffSensitivity): string[] {
  const selected = data.points.find((p) => p.is_selected)
  if (!selected || selected.mae_mw == null) return []
  const lines: string[] = []

  const age = selected.median_forecast_age_h
  lines.push(
    `At your ${selected.cutoff_local} cutoff the forecast came from the ${selected.run_used_local ?? '—'} run` +
      `${age != null ? `, a median ${fmtDuration(age)} old` : ''}: MAE ${fmtMW(selected.mae_mw)}.`,
  )

  const later = data.points.filter((p) => p.cutoff_local > selected.cutoff_local && p.mae_mw != null)
  const next = later[0]
  if (next?.mae_mw != null) {
    const delta = next.mae_mw - selected.mae_mw
    lines.push(
      `The next run (${next.cutoff_local}) came out after your cutoff, so it could not have informed the bid; had it been ` +
        `available, MAE would have been ${fmtMW(next.mae_mw)} (${fmtSignedMW(delta)}, ${fmtSignedPct(delta / selected.mae_mw)}).`,
    )
  }

  const last = later[later.length - 1]
  if (last?.mae_mw != null && last.bias_mw != null && selected.bias_mw != null && last !== next) {
    const delta = last.mae_mw - selected.mae_mw
    lines.push(
      `The last run of the day (${last.cutoff_local}) would have given MAE ${fmtMW(last.mae_mw)} (${fmtSignedPct(delta / selected.mae_mw)}), ` +
        `while the bias moves from ${fmtSignedMW(selected.bias_mw)} to ${fmtSignedMW(last.bias_mw)}.`,
    )
  }
  return lines
}
