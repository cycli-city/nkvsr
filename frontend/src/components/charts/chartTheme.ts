import { fmtNumber, LONDON } from '../../lib/format'

/** Colour tokens used by every chart (mirrors the CSS theme; checked for contrast on white). */
export const COLORS = {
  actual: '#0b1f3f',
  forecast: '#0d9488',
  hindsight: '#94a3b8',
  over: '#b45309',
  under: '#0f766e',
  bar: '#5f84bb',
  grid: '#e2e8f0',
  axis: '#64748b',
  axisLine: '#cbd5e1',
  cutoff: '#be123c',
} as const

export const AXIS_TICK = { fontSize: 11, fill: COLORS.axis } as const
export const MARGIN = { top: 8, right: 12, bottom: 4, left: 4 } as const

export const mwTick = (v: number): string => fmtNumber(v)

/**
 * Time-axis tick label that adapts to how many days are on screen (UK time). Up to about ten days the ticks fall more
 * than once a day, so the label includes the time: with the date alone the axis would read "9 Jan, 9 Jan, 10 Jan, 10 Jan".
 */
export const DATE_ONLY_TICKS_FROM_DAYS = 10
export function timeTick(spanDays: number): (ms: number) => string {
  const opts: Intl.DateTimeFormatOptions =
    spanDays <= 1.5
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : spanDays <= DATE_ONLY_TICKS_FROM_DAYS
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
        : { day: 'numeric', month: 'short' }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, ...opts })
  return (ms: number) => fmt.format(new Date(ms))
}

export interface LegendItem {
  label: string
  color: string
  /** `line` (solid), `dash` (dashed line), `box` (bar swatch), `dot` (filled marker), `ring` (hollow marker) */
  kind?: 'line' | 'dash' | 'box' | 'dot' | 'ring'
}

const TICK_STEPS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]

/** Round axis ticks from 0 up to just above `max` (so 14,000 MW gives 0, 2,000 ... 14,000, not 3,500s). */
export function niceTicks(max: number, target = 6): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0]
  const step = TICK_STEPS.find((s) => max / s <= target) ?? 10000
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return ticks
}

/**
 * Index of the data point a Recharts event refers to. Recharts 3 reports it as a *string* (its
 * `TooltipIndex` type is `string | null`), older versions as a number, so accept both.
 */
export function activeIndexOf(state: { activeTooltipIndex?: unknown }): number | undefined {
  const raw = state.activeTooltipIndex
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}
