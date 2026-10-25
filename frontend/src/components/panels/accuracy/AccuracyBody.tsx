import { useNavigate } from 'react-router'
import type { Accuracy, Summary } from '../../../api/types'
import { fmtMW, fmtNumber } from '../../../lib/format'
import { useAnalysis } from '../../../state/useAnalysis'
import { DailyErrorChart } from '../../charts/DailyErrorChart'
import { ErrorHistogram } from '../../charts/ErrorHistogram'
import { SlotChart } from '../../charts/SlotChart'
import { ChartFrame } from '../../charts/chartKit'
import { EmptyState } from '../../states/ErrorState'
import { LargestErrorsTable } from '../../tables/LargestErrorsTable'
import { Card, Skeleton } from '../../ui/primitives'
import { ErrorProfile } from './ErrorProfile'
import { BaselineTable } from './BaselineTable'
import { DaypartTable } from './DaypartTable'

export function AccuracyBody({ acc, summary }: { acc: Accuracy; summary: Summary | undefined }) {
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
