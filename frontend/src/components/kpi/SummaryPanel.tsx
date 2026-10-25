import { useSummary } from '../../api/hooks'
import type { DataStatusName, Summary } from '../../api/types'
import {
  DIRECTION_LABEL,
  errorDirection,
  fmtDate,
  fmtDuration,
  fmtMW,
  fmtNumber,
  fmtPct,
  fmtSignedMW,
} from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { QueryBoundary } from '../states/QueryBoundary'
import { Badge, Card, SectionHeader, Skeleton } from '../ui/primitives'
import { KpiTile } from './KpiTile'

const STATUS_UI: Record<DataStatusName, { tone: 'good' | 'warn' | 'bad'; label: string }> = {
  sufficient: { tone: 'good', label: 'Data sufficient' },
  partial: { tone: 'warn', label: 'Partial data' },
  insufficient: { tone: 'bad', label: 'Insufficient data' },
  no_data: { tone: 'bad', label: 'No matched data' },
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  )
}

function Tiles({ s }: { s: Summary }) {
  const { linkTo } = useAnalysis()
  const m = s.metrics
  const dist = s.error_distribution
  const persistence = s.baselines.find((b) => b.key === 'persistence')
  const dir = errorDirection(m.bias_mw)
  const biasLink = linkTo('/intervals', { direction: dir === 'under' ? 'under' : 'over', status: 'matched' })
  const gaps = s.coverage.missing_forecast + s.coverage.missing_actual + s.coverage.missing_both

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Matched intervals"
        value={fmtNumber(m.n)}
        sub={`of ${fmtNumber(s.coverage.expected)} expected half-hours`}
        to={linkTo('/intervals', { status: 'matched' })}
        info="Half-hourly delivery periods that have both an actual (FUELHH) and a forecast that was published at or before the decision cutoff (WINDFOR). Every metric below is computed on exactly this set."
      />
      <KpiTile
        label="Forecast coverage"
        value={fmtPct(s.coverage.coverage)}
        tone={s.data_status.status === 'sufficient' ? 'good' : 'warn'}
        sub={
          gaps === 0
            ? 'No gaps in this selection'
            : `${fmtNumber(gaps)} half-hour${gaps === 1 ? '' : 's'} missing data`
        }
        to={gaps > 0 ? linkTo('/intervals', { status: 'missing_any' }) : undefined}
        drillLabel="View the gaps"
        info="Matched intervals divided by expected intervals (a calendar count of half-hours, 46/48/50 per day). Gaps are shown as gaps, never filled."
      />
      <KpiTile
        label="MAE"
        value={fmtMW(m.mae_mw)}
        sub={`WAPE ${fmtPct(m.wape)} of actual output`}
        to={linkTo('/intervals', { sort_by: 'abs_error', sort_dir: 'desc', status: 'matched' })}
        drillLabel="See largest errors"
        info="Mean absolute error: the average size of the miss in MW, ignoring direction. WAPE = Σ|error| ÷ Σ actual, shown only when total actual output is greater than zero."
      />
      <KpiTile
        label="RMSE"
        value={fmtMW(m.rmse_mw)}
        sub={
          m.mae_mw && m.rmse_mw
            ? `${(m.rmse_mw / m.mae_mw).toFixed(2)}× MAE - weights large misses`
            : 'Weights large misses more'
        }
        info="Root-mean-square error. Always ≥ MAE; the further above MAE it is, the more the error is concentrated in a few large misses."
      />
      <KpiTile
        label="Bias (F − A)"
        value={fmtSignedMW(m.bias_mw)}
        tone={dir === 'over' ? 'warn' : 'default'}
        sub={
          dir && dir !== 'none'
            ? `Net ${DIRECTION_LABEL[dir]}; ${fmtPct(dist.share_over, 0)} of intervals over, ${fmtPct(dist.share_under, 0)} under`
            : 'No net bias'
        }
        to={biasLink}
        drillLabel={dir === 'under' ? 'See under-forecasts' : 'See over-forecasts'}
        info="Mean of (forecast − actual). Positive = over-forecast: less wind arrived than predicted, so a buyer relying on the forecast would have been short."
      />
      <KpiTile
        label="MAE vs persistence"
        value={
          persistence?.skill == null
            ? '—'
            : `${persistence.skill >= 0 ? '−' : '+'}${fmtPct(Math.abs(persistence.skill), 0)}`
        }
        tone={persistence?.skill != null && persistence.skill > 0 ? 'good' : 'default'}
        sub={
          persistence?.skill == null
            ? 'Baseline unavailable for these intervals'
            : `${fmtMW(persistence.mae_forecast_mw)} vs ${fmtMW(persistence.mae_baseline_mw)} on ${fmtNumber(persistence.n)} intervals`
        }
        info="Skill against a naive baseline that is information-valid at the cutoff: the last completed half-hour actual held flat for the whole delivery day. Negative % = forecast MAE is lower than the baseline's."
      />
    </div>
  )
}

export function SummaryPanel() {
  const { params, resetAnalysis } = useAnalysis()
  const query = useSummary(params)
  return (
    <section aria-labelledby="summary-h">
      <SectionHeader
        id="summary-h"
        title="Executive summary"
        subtitle={
          query.data ? (
            <>
              Decisions {fmtDate(query.data.analysis.decision_from, 'short')} –{' '}
              {fmtDate(query.data.analysis.decision_to, 'short')} → delivery{' '}
              {fmtDate(query.data.analysis.delivery_from, 'short')} –{' '}
              {fmtDate(query.data.analysis.delivery_to, 'short')}{' '}
              {query.data.analysis.delivery_to.slice(0, 4)} · {query.data.analysis.n_delivery_days} day
              {query.data.analysis.n_delivery_days === 1 ? '' : 's'} · cutoff{' '}
              {query.data.analysis.cutoff_local} UK time
            </>
          ) : undefined
        }
      />
      <QueryBoundary
        query={query}
        skeleton={<SummarySkeleton />}
        onReset={resetAnalysis}
        label="Loading summary"
      >
        {(s) => {
          const ui = STATUS_UI[s.data_status.status]
          const age = s.forecast_age
          return (
            <div className="space-y-3">
              <Tiles s={s} />
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <Badge tone={ui.tone}>{ui.label}</Badge>
                <span className="text-slate-700">{s.data_status.message}</span>
                <span className="text-xs text-slate-500">
                  Mean forecast {fmtMW(s.metrics.mean_forecast_mw)} · mean actual{' '}
                  {fmtMW(s.metrics.mean_actual_mw)}
                  {age.median_h != null && (
                    <> · forecasts were a median {fmtDuration(age.median_h)} old at the cutoff</>
                  )}
                  {age.n_stale > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <strong className="text-amber-700">
                        {age.n_stale} older than {age.stale_threshold_h} h
                      </strong>
                    </>
                  )}
                </span>
              </Card>
            </div>
          )
        }}
      </QueryBoundary>
    </section>
  )
}
