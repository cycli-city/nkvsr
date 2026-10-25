/**
 * Number and time formatting. Every timestamp is shown in UK time (Europe/London) with the zone
 * abbreviation (GMT/BST), because the GB market is defined in local time. An unavailable value is always
 * "—", never "0" or "NaN".
 */
export const LONDON = 'Europe/London'
export const UNAVAILABLE = '—'
const MINUS = '−'

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function fmtNumber(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return UNAVAILABLE
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)
}

export function fmtMW(v: number | null | undefined, digits = 0): string {
  return isNum(v) ? `${fmtNumber(v, digits)} MW` : UNAVAILABLE
}

/** Signed value with a typographic minus: `+120 MW`, `−85 MW`. Zero has no sign. */
export function fmtSignedMW(v: number | null | undefined, digits = 0): string {
  if (!isNum(v)) return UNAVAILABLE
  const rounded = Number(v.toFixed(digits))
  if (rounded === 0) return `${fmtNumber(0, digits)} MW`
  return `${rounded > 0 ? '+' : MINUS}${fmtNumber(Math.abs(rounded), digits)} MW`
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(digits)}%` : UNAVAILABLE
}

/** Signed share with a typographic minus, to sit beside `fmtSignedMW`: `+1.3%`, `−10.4%`. Zero has no sign. */
export function fmtSignedPct(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return UNAVAILABLE
  const pct = Number((v * 100).toFixed(digits))
  if (pct === 0) return `${(0).toFixed(digits)}%`
  return `${pct > 0 ? '+' : MINUS}${Math.abs(pct).toFixed(digits)}%`
}

/** `forecast − actual`: positive = over-forecast (less wind than predicted). */
export function errorDirection(v: number | null | undefined): 'over' | 'under' | 'none' | null {
  if (!isNum(v)) return null
  if (v > 0) return 'over'
  if (v < 0) return 'under'
  return 'none'
}

export const DIRECTION_LABEL = { over: 'over-forecast', under: 'under-forecast', none: 'exact' } as const

function parts(iso: string, options: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return UNAVAILABLE
  return new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, ...options }).format(d)
}

/** `Thu 15 Jan 2026, 08:30 GMT` */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE
  return parts(iso, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}

/** `15 Jan, 08:30` (compact, for axes and dense tables) */
export function fmtShortDateTime(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE
  return parts(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE
  return parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** `15 Jan` for an instant, evaluated on the local (UK) calendar. */
export function fmtDayMonth(iso: string): string {
  return parts(iso, { day: 'numeric', month: 'short' })
}

/** Plain calendar date `YYYY-MM-DD` (no timezone semantics) -> `Thu 15 Jan 2026`. */
export function fmtDate(date: string | null | undefined, style: 'long' | 'short' = 'long'): string {
  if (!date) return UNAVAILABLE
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return UNAVAILABLE
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' }
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(d)
}

/** Add whole days to a `YYYY-MM-DD` calendar date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** `3 h 20 min` / `45 min` from a number of hours. */
export function fmtDuration(hours: number | null | undefined): string {
  if (!isNum(hours)) return UNAVAILABLE
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Minutes relative to a reference, e.g. `10 min before cutoff`. */
export function fmtRelativeMinutes(minutes: number): string {
  const abs = Math.abs(minutes)
  const label = abs >= 120 ? fmtDuration(abs / 60) : `${Math.round(abs)} min`
  if (Math.round(abs) === 0) return 'at the cutoff'
  return `${label} ${minutes < 0 ? 'before' : 'after'} cutoff`
}

/** Offset of Europe/London from UTC, in minutes, at the given instant (0 in winter, 60 in summer). */
function londonOffsetMinutes(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000)
}

/**
 * UK wall-clock `date` (YYYY-MM-DD) + `hhmm` -> UTC instant as `YYYY-MM-DDTHH:MM:SSZ`.
 * Correct across clock changes (the offset is evaluated at the resulting instant).
 */
export function londonLocalToUtcIso(date: string, hhmm: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  const [h = 0, min = 0] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, min)
  let utc = wall
  for (let i = 0; i < 3; i++) utc = wall - londonOffsetMinutes(utc) * 60_000
  return new Date(utc).toISOString().replace('.000Z', 'Z')
}

/** UK local calendar date (YYYY-MM-DD) and HH:MM of a UTC instant. */
export function utcToLondonParts(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: LONDON,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** Shift a UTC ISO instant by whole half-hours. */
export function shiftHalfHours(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * 30 * 60_000).toISOString().replace('.000Z', 'Z')
}
