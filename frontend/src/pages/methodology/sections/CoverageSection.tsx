import { fmtDate, fmtPct } from '../../../lib/format'
import { Block } from '../Block'
import type { Metadata } from '../../../api/types'

/** Coverage and sufficiency. */
export function CoverageSection({
  meta,
  basisInfo,
}: {
  meta: Metadata
  basisInfo: Metadata['bases'][number] | null
}) {
  return (
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
  )
}
