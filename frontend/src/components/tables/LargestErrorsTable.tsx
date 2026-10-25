import { Link } from 'react-router'
import type { IntervalRow } from '../../api/types'
import { scrollRegion } from '../../lib/a11y'
import { fmtDate, fmtShortDateTime, fmtTime } from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { ErrorCell, ValueCell } from './cells'

/** Compact "largest errors" table used on the dashboard (each row links to its vintages). */
export function LargestErrorsTable({ rows }: { rows: IntervalRow[] }) {
  const { linkTo } = useAnalysis()
  return (
    <div {...scrollRegion('Largest forecast errors table')} className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">
          The ten matched half-hours with the largest absolute forecast error
        </caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Delivery (UK)
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Forecast
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Actual
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Error F−A
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Published
            </th>
            <th scope="col" className="px-2 py-1.5">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.start_time}>
              <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-900">
                {fmtDate(r.delivery_date, 'short')}, {fmtTime(r.start_time)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <ValueCell value={r.forecast_mw} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <ValueCell value={r.actual_mw} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <ErrorCell value={r.error_mw} />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                {fmtShortDateTime(r.forecast_publish_time)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <Link
                  className="text-xs font-medium text-teal-700 hover:underline"
                  to={linkTo('/vintages', { start: r.start_time })}
                  aria-label={`Open forecast vintages for ${r.local_label}`}
                >
                  Vintages →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
