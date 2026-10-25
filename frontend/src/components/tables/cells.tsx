import type { IntervalRow } from '../../api/types'
import { cn } from '../../lib/cn'
import { DIRECTION_LABEL, errorDirection, fmtNumber, UNAVAILABLE } from '../../lib/format'
import { Badge } from '../ui/primitives'

const STATUS_LABEL: Record<IntervalRow['match_status'], string> = {
  matched: 'Matched',
  missing_forecast: 'No forecast',
  missing_actual: 'No actual',
  missing_both: 'No data',
}

export function StatusBadge({ status }: { status: IntervalRow['match_status'] }) {
  return status === 'matched' ? (
    <Badge tone="good">{STATUS_LABEL[status]}</Badge>
  ) : (
    <Badge tone="warn">{STATUS_LABEL[status]}</Badge>
  )
}

/** `+120` / `−85` with direction colour AND a text/arrow cue (never colour alone). */
export function ErrorCell({ value }: { value: number | null }) {
  const dir = errorDirection(value)
  if (dir === null || value === null)
    return (
      <span className="text-slate-500" title="Unavailable (missing data)">
        {UNAVAILABLE}
      </span>
    )
  const text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmtNumber(Math.abs(value))}`
  return (
    <span
      className={cn('tabular-nums', dir === 'over' && 'text-amber-800', dir === 'under' && 'text-teal-800')}
      title={DIRECTION_LABEL[dir]}
    >
      {dir === 'over' ? '▲ ' : dir === 'under' ? '▼ ' : ''}
      {text}
    </span>
  )
}

/** A whole-number MW value, or "—" when unavailable. */
export function ValueCell({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-slate-500" title="Unavailable">
      {UNAVAILABLE}
    </span>
  ) : (
    <span className="tabular-nums">{fmtNumber(value)}</span>
  )
}
