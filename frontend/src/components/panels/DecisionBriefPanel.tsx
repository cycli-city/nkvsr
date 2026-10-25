import { useState } from 'react'
import { useDecisionBrief } from '../../api/hooks'
import type { DecisionBrief } from '../../api/types'
import {
  addDays,
  DIRECTION_LABEL,
  errorDirection,
  fmtDate,
  fmtDateTime,
  fmtMW,
  fmtNumber,
  fmtSignedMW,
  fmtTime,
} from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { BriefChart } from '../charts/DecisionCharts'
import { ChartFrame } from '../charts/chartKit'
import { QueryBoundary } from '../states/QueryBoundary'
import { Badge, Button, Card, LinkButton, SectionHeader, Skeleton, Stat } from '../ui/primitives'

function BriefBody({ b }: { b: DecisionBrief }) {
  const fs = b.forecast_set
  const h = b.hindsight
  const dir = errorDirection(h.bias_mw)
  const incomplete = fs.n_with_forecast < fs.n_intervals
  const revised = h.latest_mean_mw != null && fs.mean_mw != null ? h.latest_mean_mw - fs.mean_mw : null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Mean forecast" value={fmtMW(fs.mean_mw)} />
          <Stat
            label="Forecast energy"
            value={fs.energy_mwh == null ? '—' : `${fmtNumber(fs.energy_mwh / 1000, 1)} GWh`}
            hint={incomplete ? 'Partial day - gaps excluded' : 'Over the delivery day'}
          />
          <Stat
            label="Peak"
            value={fmtMW(fs.peak_mw)}
            hint={fs.peak_time ? `at ${fmtTime(fs.peak_time)}` : undefined}
          />
          <Stat
            label="Lowest"
            value={fmtMW(fs.trough_mw)}
            hint={fs.trough_time ? `at ${fmtTime(fs.trough_time)}` : undefined}
          />
        </dl>

        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          <p>
            <strong className="font-semibold text-navy-900">Forecast set visible at {b.cutoff_local}:</strong>{' '}
            {fs.n_with_forecast} of {fs.n_intervals} half-hours have a forecast
            {fs.first_publish_time && fs.last_publish_time && (
              <>
                , drawn from {fs.distinct_publications} publication{fs.distinct_publications === 1 ? '' : 's'}{' '}
                released between {fmtDateTime(fs.first_publish_time)} and {fmtDateTime(fs.last_publish_time)}
              </>
            )}
            .
          </p>
          {incomplete && (
            <p className="mt-1">
              <Badge tone="warn">Incomplete</Badge> Half-hours with no eligible publication are left blank,
              not estimated.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-xs leading-relaxed text-slate-700">
          <p className="font-semibold text-navy-900">In hindsight (not known at decision time)</p>
          {h.n_matched === 0 ? (
            <p className="mt-1">No actuals available to judge this day.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              <li>Mean actual output {fmtMW(h.mean_actual_mw)}.</li>
              <li>
                Error: MAE {fmtMW(h.mae_mw)}, bias {fmtSignedMW(h.bias_mw)}
                {dir && dir !== 'none' ? ` (${DIRECTION_LABEL[dir]})` : ''}.
              </li>
              {revised != null && (
                <li>
                  Forecasts revised after the cutoff averaged {fmtMW(h.latest_mean_mw)} (
                  {fmtSignedMW(revised)} vs the set above) - information a day-ahead buyer could not use.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <ChartFrame
        title={`Wind forecast for ${fmtDate(b.delivery_date)} as at ${b.cutoff_local} on ${fmtDate(b.decision_date, 'short')}`}
        legend={[
          { label: 'Forecast available at cutoff', color: '#0d9488' },
          { label: 'Actual (hindsight)', color: '#0b1f3f', kind: 'dash' },
        ]}
        summary={`Half-hourly wind forecast for ${b.delivery_date} as published by ${b.cutoff_local}, mean ${fmtMW(fs.mean_mw)}, with actual output for comparison.`}
        footnote="The actual line is revealed only after delivery; it is drawn to judge the forecast, not to inform the decision."
      >
        <BriefChart points={b.points} />
      </ChartFrame>
    </div>
  )
}

export function DecisionBriefPanel() {
  const { params, linkTo, resetAnalysis } = useAnalysis()
  const [chosen, setChosen] = useState<string | null>(null)

  // Decision-date window implied by the current selection (works for both bases).
  const shift = params?.basis === 'decision_date' ? 0 : -1
  const min = params ? addDays(params.from, shift) : null
  const max = params ? addDays(params.to, shift) : null
  const date = min && max ? (chosen && chosen >= min && chosen <= max ? chosen : max) : null
  const query = useDecisionBrief(date, params?.cutoff ?? null)
  if (!params || !min || !max || !date) return null

  return (
    <section aria-labelledby="brief-h">
      <SectionHeader
        id="brief-h"
        title="Decision brief"
        subtitle="The wind forecast a buyer could actually see when the day-ahead decision had to be made, for the next delivery day."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={date <= min}
              onClick={() => setChosen(addDays(date, -1))}
              aria-label="Previous decision date"
            >
              ←
            </Button>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Decision date
              <input
                type="date"
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                value={date}
                min={min}
                max={max}
                onChange={(e) => e.target.value && setChosen(e.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={date >= max}
              onClick={() => setChosen(addDays(date, 1))}
              aria-label="Next decision date"
            >
              →
            </Button>
            <LinkButton
              variant="ghost"
              to={linkTo(
                '/intervals',
                params.basis === 'decision_date'
                  ? { from: date, to: date }
                  : { from: addDays(date, 1), to: addDays(date, 1) },
              )}
            >
              Open intervals
            </LinkButton>
          </div>
        }
      />
      <Card className="p-4">
        <QueryBoundary
          query={query}
          skeleton={<Skeleton className="h-72" />}
          onReset={resetAnalysis}
          label="Loading decision brief"
        >
          {(b) => <BriefBody b={b} />}
        </QueryBoundary>
      </Card>
    </section>
  )
}
