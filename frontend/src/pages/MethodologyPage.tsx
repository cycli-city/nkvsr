import type { ReactNode } from 'react'
import { useMetadata } from '../api/hooks'
import { Card, SectionHeader } from '../components/ui/primitives'
import { fmtDate, fmtDateTime, fmtNumber, fmtPct } from '../lib/format'
import { useAnalysis } from '../state/useAnalysis'

function Block({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4 p-5">
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </Card>
  )
}

const Formula = ({ children }: { children: ReactNode }) => (
  <pre className="relative overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100">
    {children}
  </pre>
)

type Report = {
  rows_in?: number
  rows_kept?: number
  ignored_other_fuel_types?: number
  duplicates_removed?: number
  conflicting_duplicates?: number
  negative_values?: number
  outside_window?: number
  published_after_delivery_start?: number
  dropped?: Record<string, number>
}

function QualityTable({ title, report }: { title: string; report: Report | undefined }) {
  if (!report) return null
  const dropped = Object.entries(report.dropped ?? {})
  const rows: [string, string][] = [
    ['Rows received', fmtNumber(report.rows_in)],
    ['Rows kept', fmtNumber(report.rows_kept)],
    ...(report.ignored_other_fuel_types
      ? ([['Other fuel types ignored', fmtNumber(report.ignored_other_fuel_types)]] as [string, string][])
      : []),
    ['Outside the requested window', fmtNumber(report.outside_window ?? 0)],
    ['Duplicates removed', fmtNumber(report.duplicates_removed ?? 0)],
    ['…of which conflicting values', fmtNumber(report.conflicting_duplicates ?? 0)],
    ['Negative values (kept as-is)', fmtNumber(report.negative_values ?? 0)],
    ...(report.published_after_delivery_start !== undefined
      ? ([['Published after delivery start', fmtNumber(report.published_after_delivery_start)]] as [
          string,
          string,
        ][])
      : []),
    [
      'Dropped as invalid',
      dropped.length ? dropped.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${fmtNumber(v)}`).join('; ') : '0',
    ],
  ]
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-navy-900">{title}</h4>
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-1.5">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function MethodologyPage() {
  const { data: meta } = useMetadata()
  const { params, basisInfo } = useAnalysis()
  if (!meta) return null
  const q = meta.quality as {
    actuals?: Report
    forecasts?: Report
    forecast_profile?: Record<string, number | null>
    coverage_window?: Record<string, number>
  }
  const profile = q.forecast_profile
  const cw = q.coverage_window
  const cutoff = params?.cutoff ?? meta.default_cutoff
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(`${meta.analysis_month}-01T12:00:00Z`),
  )

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Methodology and data quality"
        subtitle="Exactly how every number in WindScope is produced, what the data does and does not cover, and where the analysis stops."
      />

      <Block title="What this answers">
        <p>
          A GB energy supplier buying in the day-ahead market must commit before it knows how much wind will
          blow. WindScope shows (1) the national wind forecast that was <em>actually available</em> at the
          day-ahead decision cutoff and (2) how accurate that forecast turned out to be, so the error can be
          allowed for when choosing how much to buy.
        </p>
        <p className="rounded-lg bg-amber-50 p-3 text-amber-950">
          <strong>Scope warning.</strong> Wind forecast error is <strong>not</strong> the utility&apos;s
          procurement volume. Demand, thermal and other generation, hedges and contracted positions, storage
          and balancing arrangements are outside the data used here. The numbers describe uncertainty in the
          wind component only.
        </p>
      </Block>

      <Block id="sources" title="Data sources">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Actuals - FUELHH</strong> (half-hourly generation outturn by fuel type), filtered to{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">fuelType = WIND</code>. Fields used:
            startTime, generation. Metered transmission-connected wind (embedded wind is not included).
          </li>
          <li>
            <strong>Forecasts - WINDFOR</strong>. Fields used: startTime (delivery), publishTime (when the
            forecast was created), generation. Many publications can exist for one delivery half-hour.
          </li>
          <li>
            Both are national level, unit MW, from the Elexon BMRS / Insights API. No other data is used.
          </li>
        </ul>
        {meta.provenance ? (
          <div className="rounded-lg border border-slate-200 p-3 text-xs">
            <p>
              <strong>This deployment:</strong> {meta.provenance.source_name}. Last successful retrieval{' '}
              <time dateTime={meta.provenance.retrieved_at}>{fmtDateTime(meta.provenance.retrieved_at)}</time>
              . Snapshot holds {fmtNumber(meta.actuals_rows)} actual rows and {fmtNumber(meta.forecasts_rows)}{' '}
              forecast rows covering delivery {fmtDate(meta.delivery_coverage_from)} –{' '}
              {fmtDate(meta.delivery_coverage_to)}.
            </p>
            <ul className="mt-2 space-y-1">
              {meta.sources.map((s) => (
                <li key={s.code}>
                  <strong>{s.code}</strong>:{' '}
                  <a
                    className="break-all text-teal-700 underline"
                    href={s.documentation_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    documentation
                  </a>{' '}
                  · <code className="break-all font-mono">{s.endpoint}</code>
                  {Object.keys(s.query_parameters).length > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="font-mono">
                        {Object.entries(s.query_parameters)
                          .map(([k, v]) => `${k}=${v}`)
                          .join('&')}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-amber-800">No snapshot is currently loaded.</p>
        )}
        <p className="text-xs text-slate-500">{meta.provenance?.attribution}</p>
      </Block>

      <Block id="decision-time" title="Which forecast counts: the decision-time rule">
        <p>
          A day-ahead buyer decides on day <em>D−1</em> for delivery on day <em>D</em>. For every half-hour of{' '}
          <em>D</em> we use the <strong>most recent forecast published at or before the cutoff</strong> on
          D−1:
        </p>
        <Formula>{`eligible(i)  = { f : f.startTime = i.startTime  AND  f.publishTime <= cutoff(D-1) }
used(i)      = argmax over eligible(i) of f.publishTime        (one forecast per half-hour)`}</Formula>
        <p>
          Current cutoff: <strong>{cutoff} Europe/London</strong> on the day before delivery. The default,
          09:20, is the earliest GB day-ahead gate closure (EPEX SPOT), so no forecast is used that could not
          have informed any day-ahead bid. N2EX closes at 09:50 (one secondary source says 09:40, so it is
          offered only as a preset). A buyer&apos;s real bidding deadline is earlier than gate closure; the
          cutoff is therefore an <em>upper bound</em> on what was knowable. Try other cutoffs in the controls
          to see the sensitivity.
        </p>
        <p>
          <strong>Latest forecast now ≠ forecast at the cutoff.</strong> Forecasts are revised up to the
          moment of delivery. The &ldquo;latest published&rdquo; series (shown dashed on the timeline, and in
          the Vintages view) includes those revisions. It is hindsight and is <em>never</em> used for any KPI;
          it appears only to show what later information would have added.
        </p>
      </Block>

      <Block id="interpretation" title={`What does "decisions made in ${month}" mean?`}>
        <p>The brief is ambiguous, so both readings are supported and never mixed:</p>
        <div className="relative overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Reading</th>
                <th className="px-2 py-1 text-left font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meta.bases.map((b) => (
                <tr key={b.id} className={b.id === params?.basis ? 'bg-teal-50/50' : undefined}>
                  <th scope="row" className="px-2 py-2 text-left font-medium text-slate-900">
                    {b.label}
                    {b.id === meta.default_basis && (
                      <span className="ml-1 text-xs font-normal text-teal-700">(default)</span>
                    )}
                  </th>
                  <td className="px-2 py-2 text-slate-700">{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          January 2026 is entirely GMT, so UK time equals UTC for this window. The code is nevertheless
          timezone-aware: delivery days are local days (46, 48 or 50 half-hours around the March and October
          clock changes).
        </p>
      </Block>

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
            forecast available at the cutoff. Skill is computed on the (possibly smaller) set where the
            baseline also exists, and reports its own n.
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
          last completed half-hour actual, held flat across the next day) and <em>trailing mean</em> (the same
          settlement period averaged over days D−8 … D−2; D−1 is incomplete at the cutoff).
        </p>
      </Block>

      <Block id="sufficiency" title="Coverage and when the analysis is considered supported">
        <p>
          &ldquo;Expected&rdquo; intervals are counted from the calendar (every half-hour of each delivery day
          that has finished by the data retrieval time), independently of what the feed returned, so missing
          data lowers coverage instead of vanishing. Status: <strong>sufficient</strong> ≥{' '}
          {fmtPct(meta.thresholds.coverage_sufficient, 0)}, <strong>partial</strong> ≥{' '}
          {fmtPct(meta.thresholds.coverage_partial, 0)}, otherwise <strong>insufficient</strong>. Forecasts
          older than {meta.thresholds.stale_forecast_hours} h at the cutoff are counted and flagged but not
          discarded.
        </p>
        {basisInfo && (
          <p className="text-xs text-slate-500">
            Range limits: {fmtDate(basisInfo.min_date)} – {fmtDate(basisInfo.max_date)}, at most{' '}
            {meta.thresholds.max_range_days} days per request.
          </p>
        )}
      </Block>

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

      <Block id="limitations" title="Known limitations">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Wind only, national level: no demand, price, solar, other generation, contracts, storage or
            balancing data.
          </li>
          <li>
            FUELHH WIND measures transmission-connected wind; the WINDFOR forecast may cover a slightly
            different scope, so part of any persistent bias could be definitional rather than forecast skill.
          </li>
          <li>
            <code className="font-mono text-xs">publishTime</code> is taken as the moment a forecast became
            available to buyers; internal publication latency is unknown.
          </li>
          <li>
            The cutoff is an upper bound; a buyer&apos;s true decision time is earlier, which would lower
            forecast quality.
          </li>
          <li>
            One month of history: statistics are descriptive of that month and may not generalise across
            seasons.
          </li>
          <li>Historical analysis only; this is not a live trading signal and has no price information.</li>
        </ul>
      </Block>
    </div>
  )
}
