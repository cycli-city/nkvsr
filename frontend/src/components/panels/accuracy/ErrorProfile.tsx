import type { ErrorDistribution } from '../../../api/types'
import { fmtMW, fmtNumber, fmtPct, fmtSignedMW } from '../../../lib/format'
import { InfoTip } from '../../ui/primitives'

/** Over / under / exact share as a single stacked bar with text alternatives (colour is never alone). */
function DirectionBar({ d }: { d: ErrorDistribution }) {
  const over = (d.share_over ?? 0) * 100
  const under = (d.share_under ?? 0) * 100
  const exact = Math.max(0, 100 - over - under)
  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${over.toFixed(0)}% over-forecast, ${under.toFixed(0)}% under-forecast`}
      >
        <div style={{ width: `${over}%`, background: '#b45309' }} />
        <div style={{ width: `${exact}%`, background: '#cbd5e1' }} />
        <div style={{ width: `${under}%`, background: '#0f766e' }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-amber-800">
          ▲ Over-forecast {fmtPct(d.share_over, 0)}{' '}
          <span className="text-slate-500">({fmtNumber(d.n_over)})</span>
        </span>
        <span className="text-teal-800">
          ▼ Under-forecast {fmtPct(d.share_under, 0)}{' '}
          <span className="text-slate-500">({fmtNumber(d.n_under)})</span>
        </span>
      </div>
    </div>
  )
}

export function ErrorProfile({ d }: { d: ErrorDistribution }) {
  if (d.n === 0) return <p className="text-sm text-slate-600">No matched intervals.</p>
  const shortfallRare = d.signed_p90_mw != null && d.signed_p90_mw <= 0
  return (
    <div className="space-y-4">
      <DirectionBar d={d} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Typical over-forecast (when over)</dt>
          <dd className="font-semibold tabular-nums text-amber-800">{fmtMW(d.mean_over_mw)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Typical under-forecast (when under)</dt>
          <dd className="font-semibold tabular-nums text-teal-800">{fmtMW(d.mean_under_mw)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Largest over-forecast</dt>
          <dd className="font-semibold tabular-nums">{fmtMW(d.max_over_mw)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Largest under-forecast</dt>
          <dd className="font-semibold tabular-nums">{fmtMW(d.max_under_mw)}</dd>
        </div>
      </dl>
      <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        <p className="font-semibold text-navy-900">
          Empirical error range
          <InfoTip label="About the empirical error range">
            Percentiles of the signed error (forecast − actual) over the matched intervals in this selection.
            They describe what happened in this window; they are not a forecast of future errors or a
            guaranteed bound.
          </InfoTip>
        </p>
        <p className="mt-1">
          In 80% of intervals the error was between <strong>{fmtSignedMW(d.signed_p10_mw)}</strong> and{' '}
          <strong>{fmtSignedMW(d.signed_p90_mw)}</strong> (median {fmtSignedMW(d.signed_p50_mw)}); 90% of
          misses were within {fmtMW(d.abs_p90_mw)}.
        </p>
        <p className="mt-1.5 text-slate-600">
          {shortfallRare
            ? 'The forecast rarely exceeded actual wind in this window, so shortfall exposure from over-forecasting was limited.'
            : `Over-forecasting (less wind than predicted) is what leaves a buyer short: in 90% of intervals it stayed under ${fmtMW(d.signed_p90_mw)}.`}
        </p>
      </div>
    </div>
  )
}
