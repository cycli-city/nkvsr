import { addDays, fmtDate } from './format'

export interface RangePreset {
  label: string
  from: string
  to: string
}

/** "Full period" plus consecutive 7-day blocks across the permitted window. */
export function rangePresets(min: string, max: string): RangePreset[] {
  const presets: RangePreset[] = [{ label: 'Full period', from: min, to: max }]
  let start = min
  while (start <= max && presets.length <= 5) {
    const candidate = addDays(start, 6)
    const end = candidate < max ? candidate : max
    presets.push({ label: `${fmtDate(start, 'short')} – ${fmtDate(end, 'short')}`, from: start, to: end })
    start = addDays(end, 1)
  }
  return presets
}
