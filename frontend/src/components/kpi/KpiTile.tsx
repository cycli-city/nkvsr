import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'
import { InfoTip } from '../ui/primitives'

type Tone = 'default' | 'good' | 'warn'

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-navy-900',
  good: 'text-teal-700',
  warn: 'text-amber-700',
}

/**
 * One headline number. When `to` is given the whole tile is a link to the observations behind it, so a KPI
 * is never a dead end ("show me the rows that make this number").
 */
export function KpiTile({
  label,
  value,
  sub,
  info,
  to,
  drillLabel,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  info?: ReactNode
  to?: string
  drillLabel?: string
  tone?: Tone
}) {
  const body = (
    <>
      <p className="flex items-center pr-6 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums tracking-tight', VALUE_TONE[tone])}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs leading-snug text-slate-600">{sub}</p>}
      {to && (
        <p className="mt-2 text-xs font-medium text-teal-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {drillLabel ?? 'View underlying intervals'} →
        </p>
      )}
    </>
  )
  const shell =
    'group relative flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm'
  return (
    <div className="relative">
      {to ? (
        <Link to={to} className={cn(shell, 'transition-colors hover:border-teal-500 hover:bg-teal-50/30')}>
          {body}
        </Link>
      ) : (
        <div className={shell}>{body}</div>
      )}
      {info && (
        <div className="absolute right-3 top-3">
          <InfoTip label={`About ${label}`}>{info}</InfoTip>
        </div>
      )}
    </div>
  )
}
