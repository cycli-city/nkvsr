import { Block, Formula } from '../Block'

/** Metric definitions. */
export function MetricDefinitions() {
  return (
    <Block id="metrics" title="Metric definitions">
      <p>
        Sign convention: <strong>error = forecast − actual</strong>. Positive = <em>over-forecast</em> (less
        wind than predicted, so a buyer relying on the forecast would be short); negative ={' '}
        <em>under-forecast</em> (buyer long).
      </p>
      <Formula>{`e_i      = F_i - A_i                         (matched half-hours i = 1..n)
MAE      = (1/n) * sum |e_i|
RMSE     = sqrt( (1/n) * sum e_i^2 )
Bias     = (1/n) * sum e_i
WAPE     = sum |e_i| / sum A_i               (shown only if sum A_i > 0, else "unavailable")
Coverage = matched intervals / expected intervals
Skill    = 1 - MAE_forecast / MAE_baseline   (same intervals; unavailable if MAE_baseline = 0)`}</Formula>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          All headline metrics use <strong>one eligible set</strong>: half-hours with both an actual and a
          forecast available at the cutoff. Skill is computed on the (possibly smaller) set where the baseline
          also exists, and reports its own n.
        </li>
        <li>A metric that cannot be defined is shown as &ldquo;—&rdquo; (unavailable), never as zero.</li>
        <li>
          MAPE is deliberately not reported: it is undefined or explosive when wind output is near zero.
        </li>
        <li>
          Quantiles use linear interpolation. &ldquo;Empirical error range&rdquo; describes the selected
          window; it is not a prediction interval for future days.
        </li>
        <li>
          Day = 07:00–23:00 UK local time; night = 23:00–07:00. Time-of-day charts group by UK wall-clock
          half-hour.
        </li>
      </ul>
      <p>
        <strong>Baselines</strong> use only information available at the cutoff: <em>persistence</em> (the
        last half-hour actual that was complete and published, assuming a short publication lag, held flat
        across the next day) and <em>trailing mean</em> (the same settlement period averaged over days D−8 …
        D−2; D−1 is incomplete at the cutoff).
      </p>
    </Block>
  )
}
