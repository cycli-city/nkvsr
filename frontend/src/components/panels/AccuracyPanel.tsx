import { useAccuracy, useSummary } from '../../api/hooks'
import { useAnalysis } from '../../state/useAnalysis'
import { QueryBoundary } from '../states/QueryBoundary'
import { SectionHeader, Skeleton } from '../ui/primitives'
import { AccuracyBody } from './accuracy/AccuracyBody'

export function AccuracyPanel() {
  const { params, resetAnalysis } = useAnalysis()
  const query = useAccuracy(params)
  const summary = useSummary(params)
  return (
    <section aria-labelledby="accuracy-h">
      <SectionHeader
        id="accuracy-h"
        title="Forecast accuracy"
        subtitle="How far the forecast available at the cutoff was from actual wind output, and how that varies by day and time of day."
      />
      <QueryBoundary
        query={query}
        skeleton={
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        }
        onReset={resetAnalysis}
        label="Loading accuracy analysis"
      >
        {(acc) => <AccuracyBody acc={acc} summary={summary.data} />}
      </QueryBoundary>
    </section>
  )
}
