import type { ReactNode } from 'react'
import type { LegendItem } from './chartTheme'

function Swatch({ color, kind = 'line' }: { color: string; kind?: LegendItem['kind'] }) {
  if (kind === 'box')
    return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
  return (
    <svg width="22" height="8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={kind === 'dash' ? '4 3' : undefined}
      />
    </svg>
  )
}

/** Figure with a caption, an accessible text summary and an HTML legend (readable by screen readers). */
export function ChartFrame({
  title,
  description,
  legend,
  footnote,
  children,
  actions,
  summary,
}: {
  title: string
  description?: ReactNode
  legend?: LegendItem[]
  footnote?: ReactNode
  children: ReactNode
  actions?: ReactNode
  /** Plain-language equivalent of the chart for assistive technology. */
  summary: string
}) {
  return (
    <figure className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy-900">{title}</p>
          {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
        </div>
        {actions}
      </figcaption>
      {legend && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="Chart legend">
          {legend.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-1.5">
              <Swatch color={item.color} kind={item.kind} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div role="img" aria-label={summary}>
        {children}
      </div>
      {footnote && <p className="mt-2 text-xs text-slate-500">{footnote}</p>}
    </figure>
  )
}

export function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-48 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-navy-900">{title}</p>
      <dl className="space-y-0.5">{children}</dl>
    </div>
  )
}

export function TipRow({
  label,
  value,
  color,
  strong,
}: {
  label: string
  value: ReactNode
  color?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-slate-600">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-navy-900' : 'text-slate-800'}`}>{value}</dd>
    </div>
  )
}
