import type { Baseline } from '../../../api/types'
import { scrollRegion } from '../../../lib/a11y'
import { fmtMW, fmtNumber, fmtPct } from '../../../lib/format'
import { InfoTip } from '../../ui/primitives'

export function BaselineTable({ baselines }: { baselines: Baseline[] }) {
  return (
    <div {...scrollRegion('Baseline comparison table')} className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Forecast MAE compared with information-valid baselines</caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Baseline
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              n
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Forecast MAE
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Baseline MAE
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Skill
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {baselines.map((b) => (
            <tr key={b.key}>
              <th scope="row" className="px-2 py-2 text-left font-medium text-slate-900">
                {b.label}
                <InfoTip label={`About ${b.label}`}>{b.description}</InfoTip>
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{fmtNumber(b.n)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMW(b.mae_forecast_mw)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtMW(b.mae_baseline_mw)}</td>
              <td
                className={`px-2 py-2 text-right font-semibold tabular-nums ${b.skill != null && b.skill > 0 ? 'text-teal-700' : 'text-slate-700'}`}
              >
                {b.skill == null ? '—' : fmtPct(b.skill, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        Skill = 1 − forecast MAE ÷ baseline MAE on intervals where forecast, actual and baseline all exist;
        positive means the forecast beats the baseline. Baselines use only actuals published before the
        cutoff.
      </p>
    </div>
  )
}
