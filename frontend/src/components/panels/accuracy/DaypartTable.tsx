import type { Accuracy } from '../../../api/types'
import { scrollRegion } from '../../../lib/a11y'
import { fmtMW, fmtNumber, fmtPct, fmtSignedMW } from '../../../lib/format'

export function DaypartTable({ rows }: { rows: Accuracy['by_daypart'] }) {
  return (
    <div {...scrollRegion('Day versus night table')} className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">
          Accuracy by day (07:00–23:00) versus night (23:00–07:00) UK time
        </caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Period
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              n
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              MAE
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Bias
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              WAPE
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.daypart}>
              <th scope="row" className="px-2 py-2 text-left font-medium text-slate-900">
                {r.daypart === 'day' ? 'Day' : 'Night'}
                <span className="ml-1.5 text-xs font-normal text-slate-500">{r.definition}</span>
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{fmtNumber(r.n)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMW(r.mae_mw)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtSignedMW(r.bias_mw)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtPct(r.wape)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
