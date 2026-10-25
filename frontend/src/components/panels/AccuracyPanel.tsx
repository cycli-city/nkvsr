import { useNavigate } from 'react-router'
import { useAccuracy, useSummary } from '../../api/hooks'
import type { Accuracy, Baseline, ErrorDistribution, Summary } from '../../api/types'
import { fmtMW, fmtNumber, fmtPct, fmtSignedMW } from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { DailyErrorChart, ErrorHistogram, SlotChart } from '../charts/AccuracyCharts'
import { ChartFrame } from '../charts/chartKit'
import { EmptyState } from '../states/ErrorState'
import { QueryBoundary } from '../states/QueryBoundary'
import { LargestErrorsTable } from '../tables/IntervalsTable'
import { Card, InfoTip, SectionHeader, Skeleton } from '../ui/primitives'

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

function ErrorProfile({ d }: { d: ErrorDistribution }) {
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

function BaselineTable({ baselines }: { baselines: Baseline[] }) {
  return (
    <div className="relative overflow-x-auto">
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

function DaypartTable({ rows }: { rows: Accuracy['by_daypart'] }) {
  return (
    <div className="relative overflow-x-auto">
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

function Body({ acc, summary }: { acc: Accuracy; summary: Summary | undefined }) {
  const { linkTo, params } = useAnalysis()
  const navigate = useNavigate()
  const a = acc.analysis
  const none = acc.metrics.n === 0

  if (none) {
    return (
      <EmptyState title="No matched intervals to analyse">
        There is no half-hour in this selection with both an actual and a forecast available at the cutoff.
        Try a different date range or cutoff.
      </EmptyState>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartFrame
        title="Daily error trend"
        description="MAE (bars) and bias (line) per delivery day. Click a day to open its intervals."
        legend={[
          { label: 'MAE (MW)', color: '#5f84bb', kind: 'box' },
          { label: 'Bias F−A (MW)', color: '#0d9488' },
        ]}
        summary={`Daily MAE and bias for ${acc.daily.length} delivery days; overall MAE ${fmtMW(acc.metrics.mae_mw)}.`}
        footnote="Bars show how large the misses were; the line shows whether the forecast ran high (above 0) or low (below 0)."
      >
        <DailyErrorChart
          daily={acc.daily}
          onSelectDay={(row) => {
            // Stay in the user's chosen basis and use that basis' own date type for the drill-down.
            const day = params?.basis === 'delivery_date' ? row.delivery_date : row.decision_date
            navigate(linkTo('/intervals', { from: day, to: day }))
          }}
        />
      </ChartFrame>

      <ChartFrame
        title="Error distribution"
        description="How many half-hours fell in each error band (forecast − actual)."
        legend={[
          { label: 'Under-forecast (buyer long)', color: '#0f766e', kind: 'box' },
          { label: 'Over-forecast (buyer short)', color: '#b45309', kind: 'box' },
        ]}
        summary={`Histogram of ${acc.metrics.n} signed forecast errors in ${acc.histogram.bin_width_mw ?? 'n/a'} MW bins.`}
        footnote={`Bin width ${fmtNumber(acc.histogram.bin_width_mw)} MW. Magnitude (the x-axis) is the error; it is not the same as forecast generation level.`}
      >
        <ErrorHistogram histogram={acc.histogram} />
      </ChartFrame>

      <ChartFrame
        title="Accuracy by half-hour of the day"
        description="MAE and bias for each UK local half-hour slot, across all days selected."
        legend={[
          { label: 'MAE (MW)', color: '#5f84bb', kind: 'box' },
          { label: 'Bias F−A (MW)', color: '#0d9488' },
        ]}
        summary="Mean absolute error and bias for each of the 48 half-hour slots in the UK day."
        footnote="Slots are UK wall-clock times; on clock-change days the repeated or skipped hour is grouped by its label."
      >
        <SlotChart slots={acc.by_slot} />
      </ChartFrame>

      <Card className="p-4">
        <p className="text-sm font-semibold text-navy-900">Error profile</p>
        <p className="mb-3 text-xs text-slate-600">
          Over-forecast = forecast above actual (less wind than predicted). Sign convention: error = forecast
          − actual.
        </p>
        <ErrorProfile d={acc.error_distribution} />
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-navy-900">Day versus night</p>
        <DaypartTable rows={acc.by_daypart} />
        <p className="mt-4 mb-2 text-sm font-semibold text-navy-900">Against naive baselines</p>
        {summary ? <BaselineTable baselines={summary.baselines} /> : <Skeleton className="h-24" />}
        {summary && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
            <strong className="font-semibold text-navy-900">Hindsight check.</strong> The most recent forecast
            for each half-hour (including revisions after the cutoff) had MAE{' '}
            {fmtMW(summary.hindsight_latest.mae_mw)} versus {fmtMW(summary.metrics.mae_mw)} at the cutoff: a
            measure of what later information adds, not something a day-ahead buyer can use.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-navy-900">Largest forecast errors</p>
        <p className="mb-2 text-xs text-slate-600">
          The ten half-hours with the biggest absolute miss in {a.delivery_from} – {a.delivery_to}.
        </p>
        <LargestErrorsTable rows={acc.largest_errors} />
      </Card>
    </div>
  )
}

export function AccuracyPanel() {
  const { params, resetAnalysis } = useAnalysis()
  const query = useAccuracy(params)
  const summary = useSummary(params)
  return (
    <section aria-labelledby="accuracy-h">
      <SectionHeader
        id="accuracy-h"
        title="Forecast accuracy"
        subtitle="How far the forecast available at the cutoff was from actual wind output, and how that varies by day and time of day."
      />
      <QueryBoundary
        query={query}
        skeleton={
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        }
        onReset={resetAnalysis}
        label="Loading accuracy analysis"
      >
        {(acc) => <Body acc={acc} summary={summary.data} />}
      </QueryBoundary>
    </section>
  )
}
