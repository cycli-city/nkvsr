import { fmtDate, fmtDateTime, fmtNumber } from '../../../lib/format'
import { Block } from '../Block'
import type { Metadata } from '../../../api/types'

/** Data sources. */
export function DataSources({ meta }: { meta: Metadata }) {
  return (
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
        <li>Both are national level, unit MW, from the Elexon BMRS / Insights API. No other data is used.</li>
      </ul>
      {meta.provenance ? (
        <div className="rounded-lg border border-slate-200 p-3 text-xs">
          <p>
            <strong>This deployment:</strong> {meta.provenance.source_name}. Last successful retrieval{' '}
            <time dateTime={meta.provenance.retrieved_at}>{fmtDateTime(meta.provenance.retrieved_at)}</time>.
            Snapshot holds {fmtNumber(meta.actuals_rows)} actual rows and {fmtNumber(meta.forecasts_rows)}{' '}
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
      <p className="text-xs text-slate-500">
        {meta.provenance?.attribution}{' '}
        <a
          className="underline hover:text-slate-700"
          href="https://www.elexon.co.uk/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/"
          target="_blank"
          rel="noreferrer"
        >
          BMRS data licence
        </a>
      </p>
    </Block>
  )
}
