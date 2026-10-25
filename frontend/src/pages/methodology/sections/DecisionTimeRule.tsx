import { Block, Formula } from '../Block'
import type { Metadata } from '../../../api/types'
import type { Quality } from '../quality'

/** Which forecast counts. */
export function DecisionTimeRule({
  meta,
  cutoff,
  profile,
}: {
  meta: Metadata
  cutoff: string
  profile: Quality['forecast_profile']
}) {
  return (
    <Block id="decision-time" title="Which forecast counts: the decision-time rule">
      <p>
        A day-ahead buyer decides on day <em>D−1</em> for delivery on day <em>D</em>. For every half-hour of{' '}
        <em>D</em> we use the <strong>most recent forecast published at or before the cutoff</strong> on D−1:
      </p>
      <Formula>{`eligible(i)  = { f : f.startTime = block(i)  AND  f.publishTime <= cutoff(D-1) }
used(i)      = argmax over eligible(i) of f.publishTime        (one forecast per half-hour)
block(i)     = the forecast hour containing half-hour i (i itself when forecasts are half-hourly)`}</Formula>
      <p>
        Current cutoff: <strong>{cutoff} Europe/London</strong> on the day before delivery. The default,
        09:20, is the earliest GB day-ahead gate closure (EPEX SPOT), so no forecast is used that could not
        have informed any day-ahead bid. N2EX closes at 09:50 (one secondary source says 09:40, so it is
        offered only as a preset). A buyer&apos;s real bidding deadline is earlier than gate closure; the
        cutoff is therefore an <em>upper bound</em> on what was knowable. Try other cutoffs in the controls to
        see the sensitivity.
      </p>
      <p>
        <strong>Latest forecast now ≠ forecast at the cutoff.</strong> Forecasts are revised up to the moment
        of delivery. The &ldquo;latest published&rdquo; series (shown dashed on the timeline, and in the
        Vintages view) includes those revisions. It is hindsight and is <em>never</em> used for any KPI; it
        appears only to show what later information would have added.
      </p>
      {profile?.start_resolution_minutes != null && profile.start_resolution_minutes !== 30 && (
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800"
          data-testid="hourly-forecast-explainer"
        >
          <p className="font-semibold">Hourly forecasts, half-hourly actuals</p>
          <p className="mt-1">
            Measured on the stored data, WINDFOR start times are{' '}
            <strong>{profile.start_resolution_minutes} minutes apart</strong>, while FUELHH actuals are
            half-hourly (average MW per settlement period).{' '}
            {meta.forecast_alignment === 'hold' ? (
              <>
                Each forecast hour is applied unchanged to both half-hours it covers, so <em>n</em> counts
                half-hours and they come in pairs that share one forecast. Nothing is interpolated, and a
                half-hour never uses the next hour&apos;s forecast.
              </>
            ) : (
              <>
                This deployment is set to <em>exact</em> matching: a forecast is used only for the half-hour
                with an identical start time, so the other half-hours are reported as missing, never filled.
              </>
            )}{' '}
            Which part of the hour the value represents is not stated in the API documentation; the data
            cannot settle it either, because wind changes little within half an hour.
          </p>
        </div>
      )}
    </Block>
  )
}
