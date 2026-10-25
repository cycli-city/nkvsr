import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTimeseries } from '../../api/hooks'
import type { TimeSeries } from '../../api/types'
import { fmtNumber } from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { ChartFrame } from '../charts/chartKit'
import { TimelineChart } from '../charts/TimelineChart'
import { EmptyState } from '../states/ErrorState'
import { QueryBoundary } from '../states/QueryBoundary'
import { Card, SectionHeader, Skeleton } from '../ui/primitives'

function Body({ ts }: { ts: TimeSeries }) {
  const { linkTo } = useAnalysis()
  const navigate = useNavigate()
  const [showLatest, setShowLatest] = useState(false)
  const toggleId = useId()
  const missing = ts.points.filter((p) => p.match_status !== 'matched').length
  const a = ts.analysis

  return (
    <ChartFrame
      title="National wind generation: forecast at cutoff vs actual"
      description={
        <>
          Forecast = latest WINDFOR publication at or before <strong>{a.cutoff_local} UK time</strong> on the
          day before delivery. Hover for the publication time, error and cutoff; click a point to inspect its
          forecast vintages.
        </>
      }
      legend={[
        { label: 'Actual (FUELHH)', color: '#0b1f3f' },
        { label: `Forecast available at ${a.cutoff_local} (WINDFOR)`, color: '#0d9488' },
        ...(showLatest
          ? [
              {
                label: 'Latest published forecast - hindsight, not usable',
                color: '#94a3b8',
                kind: 'dash' as const,
              },
            ]
          : []),
      ]}
      actions={
        <label htmlFor={toggleId} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input
            id={toggleId}
            type="checkbox"
            className="h-4 w-4 accent-teal-600"
            checked={showLatest}
            onChange={(e) => setShowLatest(e.target.checked)}
          />
          Compare with latest published forecast
        </label>
      }
      summary={`Line chart of ${fmtNumber(ts.points.length)} half-hourly delivery periods from ${a.delivery_from} to ${a.delivery_to}, comparing actual wind generation in MW with the forecast available at the ${a.cutoff_local} cutoff.`}
      footnote={
        <>
          Units: MW (half-hourly average). Times: UK local.{' '}
          {missing > 0 ? (
            <>
              {missing === 1
                ? '1 half-hour has missing data and appears as a gap'
                : `${fmtNumber(missing)} half-hours have missing data and appear as gaps`}{' '}
              -{' '}
              <a className="underline" href={linkTo('/intervals', { status: 'missing_any' })}>
                list them
              </a>
              .
            </>
          ) : (
            'No gaps in this selection.'
          )}{' '}
          {showLatest &&
            'The dashed line includes revisions published after the cutoff and is shown for context only.'}
        </>
      }
    >
      <TimelineChart
        points={ts.points}
        showLatest={showLatest}
        onSelect={(p) => navigate(linkTo('/vintages', { start: p.start_time }))}
      />
    </ChartFrame>
  )
}

export function TimelinePanel() {
  const { params, resetAnalysis } = useAnalysis()
  const query = useTimeseries(params)
  return (
    <section aria-labelledby="timeline-h">
      <SectionHeader
        id="timeline-h"
        title="Wind generation timeline"
        subtitle="Forecast and actual national wind output on one time axis. Use the handles under the chart to zoom."
      />
      <Card className="p-0">
        <QueryBoundary
          query={query}
          skeleton={<Skeleton className="m-4 h-96" />}
          isEmpty={(d) => d.points.length === 0}
          empty={<EmptyState title="No delivery periods in this selection" />}
          onReset={resetAnalysis}
          label="Loading timeline"
        >
          {(ts) => <Body ts={ts} />}
        </QueryBoundary>
      </Card>
    </section>
  )
}
