import { fmtNumber } from '../../../lib/format'
import { Block } from '../Block'
import type { Metadata } from '../../../api/types'
import type { Quality } from '../quality'
import { QualityTable } from '../quality'

/** Data quality report. */
export function DataQuality({ meta, quality }: { meta: Metadata; quality: Quality }) {
  const q = quality
  const profile = q.forecast_profile
  const cw = q.coverage_window
  return (
    <Block id="quality" title="Data quality report (from the last ingestion)">
      {cw && (
        <p>
          Expected delivery half-hours in the snapshot window:{' '}
          <strong>{fmtNumber(cw.expected_intervals)}</strong>; with an actual:{' '}
          <strong>{fmtNumber(cw.intervals_with_actual)}</strong>; with at least one forecast publication:{' '}
          <strong>{fmtNumber(cw.intervals_with_any_forecast)}</strong>.
        </p>
      )}
      {profile && (
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Forecast start-time resolution measured from the data:{' '}
            <strong>
              {profile.start_resolution_minutes != null
                ? `${profile.start_resolution_minutes} min`
                : 'unavailable'}
            </strong>
          </li>
          <li>
            Distinct publication times: <strong>{fmtNumber(profile.distinct_publish_times)}</strong>, median
            gap{' '}
            <strong>
              {profile.publish_cadence_minutes_median != null
                ? `${profile.publish_cadence_minutes_median} min`
                : '—'}
            </strong>
          </li>
          <li>
            Lead time (delivery start − publication): median{' '}
            <strong>
              {profile.lead_time_hours_median != null
                ? `${fmtNumber(profile.lead_time_hours_median, 1)} h`
                : '—'}
            </strong>
            , max{' '}
            <strong>
              {profile.lead_time_hours_max != null ? `${fmtNumber(profile.lead_time_hours_max, 1)} h` : '—'}
            </strong>
          </li>
        </ul>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <QualityTable title="FUELHH actuals (WIND)" report={q.actuals} />
        <QualityTable title="WINDFOR forecasts" report={q.forecasts} />
      </div>
      {meta.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="font-semibold">Notes raised during ingestion</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {meta.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        Handling rules: invalid rows are dropped and counted by reason; timestamps must carry a timezone;
        duplicate records collapse to the latest; negative values are kept and counted; nothing is imputed,
        interpolated or back-filled.
      </p>
    </Block>
  )
}
