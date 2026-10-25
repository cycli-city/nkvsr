import { fmtNumber } from '../../lib/format'

export type Report = {
  rows_in?: number
  rows_kept?: number
  ignored_other_fuel_types?: number
  duplicates_removed?: number
  conflicting_duplicates?: number
  negative_values?: number
  outside_window?: number
  published_after_delivery_start?: number
  dropped?: Record<string, number>
}

/** The ingestion quality report as stored in the snapshot manifest (all fields optional: older snapshots lack some). */
export interface Quality {
  actuals?: Report
  forecasts?: Report
  forecast_profile?: Record<string, number | null>
  coverage_window?: Record<string, number>
}

export function QualityTable({ title, report }: { title: string; report: Report | undefined }) {
  if (!report) return null
  const dropped = Object.entries(report.dropped ?? {})
  const rows: [string, string][] = [
    ['Rows received', fmtNumber(report.rows_in)],
    ['Rows kept', fmtNumber(report.rows_kept)],
    ...(report.ignored_other_fuel_types
      ? ([['Other fuel types ignored', fmtNumber(report.ignored_other_fuel_types)]] as [string, string][])
      : []),
    ['Outside the requested window', fmtNumber(report.outside_window ?? 0)],
    ['Duplicates removed', fmtNumber(report.duplicates_removed ?? 0)],
    ['…of which conflicting values', fmtNumber(report.conflicting_duplicates ?? 0)],
    ['Negative values (kept as-is)', fmtNumber(report.negative_values ?? 0)],
    ...(report.published_after_delivery_start !== undefined
      ? ([['Published after delivery start', fmtNumber(report.published_after_delivery_start)]] as [
          string,
          string,
        ][])
      : []),
    [
      'Dropped as invalid',
      dropped.length ? dropped.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${fmtNumber(v)}`).join('; ') : '0',
    ],
  ]
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-navy-900">{title}</h4>
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-1.5">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
