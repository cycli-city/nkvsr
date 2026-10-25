import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAccuracy, useVintages } from '../api/hooks'
import { QueryBoundary } from '../components/states/QueryBoundary'
import { Button, Card, SectionHeader, Skeleton } from '../components/ui/primitives'
import { fmtDateTime, fmtSignedMW, shiftHalfHours } from '../lib/format'
import { useAnalysis } from '../state/useAnalysis'
import { VintagePicker } from './vintages/VintagePicker'
import { VintageDetail } from './vintages/VintageDetail'

export function VintagesPage() {
  const { params, linkTo, basisInfo, metadata } = useAnalysis()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const start = search.get('start')
  const cutoff = params?.cutoff ?? null
  const query = useVintages(start, cutoff)
  const accuracy = useAccuracy(start ? null : params)

  if (!params || !metadata) return null
  const go = (iso: string) => navigate(linkTo('/vintages', { start: iso }))
  const coverageFrom = metadata.delivery_coverage_from ?? basisInfo?.min_date ?? ''
  const coverageTo = metadata.delivery_coverage_to ?? basisInfo?.max_date ?? ''
  const worst = accuracy.data?.largest_errors[0]

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Forecast vintage comparison"
        subtitle="Pick a delivery half-hour to see every forecast published for it, and which one was available when the day-ahead decision had to be made."
      />
      <Card className="p-4">
        <VintagePicker
          key={start ?? 'none'}
          initial={start}
          min={coverageFrom}
          max={coverageTo}
          onPick={go}
        />
        {start && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => go(shiftHalfHours(start, -1))}>
              ← Previous half-hour
            </Button>
            <Button variant="secondary" onClick={() => go(shiftHalfHours(start, 1))}>
              Next half-hour →
            </Button>
          </div>
        )}
        {!start && worst && (
          <p className="mt-3 text-sm text-slate-600">
            Not sure where to look? The largest miss in your selection was{' '}
            <Link
              className="font-medium text-teal-700 underline"
              to={linkTo('/vintages', { start: worst.start_time })}
            >
              {worst.local_label} ({fmtSignedMW(worst.error_mw)})
            </Link>
            .
          </p>
        )}
      </Card>

      {start ? (
        <QueryBoundary
          query={query}
          skeleton={<Skeleton className="h-96" />}
          label="Loading forecast vintages"
        >
          {(v) => (
            <>
              <h3 className="text-base font-semibold text-navy-900">
                {fmtDateTime(v.start_time)}{' '}
                <span className="font-normal text-slate-500">· settlement period {v.settlement_period}</span>
              </h3>
              <VintageDetail v={v} />
            </>
          )}
        </QueryBoundary>
      ) : (
        <p className="text-sm text-slate-600">
          Choose a delivery date and half-hour above, or follow a link from the timeline or the interval
          explorer.
        </p>
      )}
    </div>
  )
}
