import type { Vintages } from '../../api/types'
import { VintageChart } from '../../components/charts/VintageChart'
import { ChartFrame } from '../../components/charts/chartKit'
import { Badge, Card, Stat } from '../../components/ui/primitives'
import {
  DIRECTION_LABEL,
  errorDirection,
  fmtDateTime,
  fmtDuration,
  fmtMW,
  fmtRelativeMinutes,
  fmtSignedMW,
  fmtTime,
} from '../../lib/format'
import { scrollRegion } from '../../lib/a11y'

export function VintageDetail({ v }: { v: Vintages }) {
  const sel = v.selected
  const latest = v.latest
  const selErr = sel && v.actual_mw != null ? sel.forecast_mw - v.actual_mw : null
  const latestErr = latest && v.actual_mw != null ? latest.forecast_mw - v.actual_mw : null
  const revision = sel && latest ? latest.forecast_mw - sel.forecast_mw : null
  const dir = errorDirection(selErr)

  const heldFromEarlierBlock = v.forecast_for_time !== v.start_time
  return (
    <div className="space-y-4">
      {heldFromEarlierBlock && (
        <div
          role="note"
          data-testid="held-forecast-note"
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"
        >
          <p className="font-semibold">Hourly forecast applied to this half-hour</p>
          <p className="mt-1">
            WINDFOR publishes one value per hour. The {fmtTime(v.start_time)} half-hour is scored against the
            forecast for the hour starting <strong>{fmtTime(v.forecast_for_time)}</strong>, and the
            publications listed below are that hour&apos;s. Nothing is interpolated.
          </p>
        </div>
      )}
      {v.explanation && (
        <div role="note" className="rounded-xl border border-navy-100 bg-navy-50 p-4 text-sm text-navy-900">
          <p className="font-semibold">{v.n_vintages === 0 ? 'No vintage history to show' : 'Note'}</p>
          <p className="mt-1">{v.explanation}</p>
        </div>
      )}

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
          <Stat
            label="Used at decision time"
            value={sel ? fmtMW(sel.forecast_mw) : '—'}
            hint={
              sel
                ? `Published ${fmtTime(sel.publish_time)} · ${fmtRelativeMinutes(sel.minutes_from_cutoff)}`
                : 'No eligible publication'
            }
          />
          <Stat
            label="Latest published (hindsight)"
            value={latest ? fmtMW(latest.forecast_mw) : '—'}
            hint={
              latest
                ? `${fmtDateTime(latest.publish_time)}${revision != null ? ` · ${fmtSignedMW(revision)} vs used` : ''}`
                : undefined
            }
          />
          <Stat
            label="Actual"
            value={fmtMW(v.actual_mw)}
            hint={v.actual_mw == null ? 'Not available for this interval' : undefined}
          />
          <Stat
            label="Error at decision time"
            value={fmtSignedMW(selErr)}
            hint={
              dir && dir !== 'none'
                ? `${DIRECTION_LABEL[dir]}${latestErr != null ? ` · latest would be ${fmtSignedMW(latestErr)}` : ''}`
                : undefined
            }
          />
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Cutoff for this interval:{' '}
          <strong className="font-medium text-slate-700">{fmtDateTime(v.cutoff_time)}</strong> (
          {v.cutoff_local} UK time the day before delivery). {v.n_eligible} of {v.n_vintages} stored
          publications were available by then.
        </p>
      </Card>

      {v.vintages.length > 0 && (
        <>
          <ChartFrame
            title="How the forecast for this half-hour changed as publication time advanced"
            legend={[
              { label: 'Used at decision time', color: '#0d9488', kind: 'dot' },
              { label: 'Eligible, superseded', color: '#0b1f3f', kind: 'dot' },
              { label: 'Published after the cutoff', color: '#94a3b8', kind: 'ring' },
              { label: 'Decision cutoff', color: '#be123c', kind: 'dash' },
            ]}
            summary={`Forecast for ${v.local_label} across ${v.n_vintages} publications; ${v.n_eligible} were published before the ${v.cutoff_local} cutoff. The forecast used was ${fmtMW(sel?.forecast_mw)}.`}
            footnote="Each dot is one WINDFOR publication for this delivery period. Only dots left of the red line could have informed the day-ahead decision."
          >
            <VintageChart
              vintages={v.vintages}
              cutoffTime={v.cutoff_time}
              cutoffLabel={`Cutoff ${v.cutoff_local}`}
              actualMw={v.actual_mw}
            />
          </ChartFrame>

          <div
            {...scrollRegion('Forecast publications for this half-hour')}
            className="relative max-h-[30rem] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <table className="min-w-full text-sm">
              <caption className="sr-only">Every stored forecast publication for {v.local_label}</caption>
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Published (UK)
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Forecast (MW)
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Lead time
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Relative to cutoff
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...v.vintages].reverse().map((r) => (
                  <tr key={r.publish_time} className={r.selected ? 'bg-teal-50/60' : undefined}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-900">
                      {fmtDateTime(r.publish_time)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtMW(r.forecast_mw)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                      {fmtDuration(r.lead_time_h)}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {fmtRelativeMinutes(r.minutes_from_cutoff)}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.selected ? (
                        <Badge tone="good">Used at decision time</Badge>
                      ) : r.eligible ? (
                        <Badge>Eligible - superseded</Badge>
                      ) : (
                        <Badge tone="neutral">After cutoff</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
