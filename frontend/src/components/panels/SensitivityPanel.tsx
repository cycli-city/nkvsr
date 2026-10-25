import { useCutoffSensitivity } from '../../api/hooks'
import type { CutoffSensitivity, SensitivityPoint } from '../../api/types'
import { scrollRegion } from '../../lib/a11y'
import { fmtNumber } from '../../lib/format'
import { AVAILABILITY_LABEL, availability, readSensitivity } from '../../lib/sensitivity'
import { useInView } from '../../lib/useInView'
import { useAnalysis } from '../../state/useAnalysis'
import { ChartFrame } from '../charts/chartKit'
import { SensitivityChart } from '../charts/SensitivityChart'
import { EmptyState } from '../states/ErrorState'
import { QueryBoundary } from '../states/QueryBoundary'
import { Badge, Card, SectionHeader, Skeleton } from '../ui/primitives'

/** `+1,748` / `−26`: a signed whole number with a typographic minus; the unit lives in the column header. */
const signed = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return '—'
  const whole = Number(v.toFixed(0))
  return `${whole > 0 ? '+' : whole < 0 ? '−' : ''}${fmtNumber(Math.abs(whole))}`
}

function Row({
  p,
  selected,
  reference,
}: {
  p: SensitivityPoint
  selected: string
  reference: number | null
}) {
  const where = availability(p, selected)
  const delta = reference != null && p.mae_mw != null ? p.mae_mw - reference : null
  return (
    <tr className={p.is_selected ? 'bg-teal-50/60' : undefined}>
      <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-slate-900">
        {p.cutoff_local}
        {p.is_selected && (
          <span className="ml-1.5">
            <Badge tone="good">Yours</Badge>
          </span>
        )}
      </th>
      <td className="px-2 py-1.5 text-slate-600">{p.run_used_local ?? '—'}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmtNumber(p.mae_mw)}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{signed(p.bias_mw)}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-600">
        {p.is_selected || delta == null ? '—' : Math.abs(delta) < 0.5 ? 'no change' : signed(delta)}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-600">
        {where === 'after' ? 'Hindsight only' : where === 'before' ? 'Available' : 'Used'}
      </td>
    </tr>
  )
}

function SensitivityTable({ data }: { data: CutoffSensitivity }) {
  const reference = data.points.find((p) => p.is_selected)?.mae_mw ?? null
  return (
    <div {...scrollRegion('Accuracy by decision cutoff table')} className="relative overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">
          Accuracy of the forecast available at each decision cutoff on the day before delivery
        </caption>
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Cutoff (UK)
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Run used
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              MAE (MW)
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Bias (MW)
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              MAE vs yours (MW)
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.points.map((p) => (
            <Row key={p.cutoff_local} p={p} selected={data.selected_cutoff} reference={reference} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Body({ data }: { data: CutoffSensitivity }) {
  const usable = data.points.filter((p) => p.mae_mw != null)
  if (usable.length === 0) {
    return (
      <EmptyState title="No matched intervals at any cutoff">
        There is no half-hour in this selection with both an actual and a forecast. Try a different date
        range.
      </EmptyState>
    )
  }
  const reading = readSensitivity(data)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <ChartFrame
            title="Accuracy if the decision had been taken after each publication run"
            description="Same window, same rule, only the cutoff moves. MAE as bars, bias as the line."
            legend={[
              { label: AVAILABILITY_LABEL.before, color: '#5f84bb', kind: 'box' },
              { label: AVAILABILITY_LABEL.selected, color: '#0d9488', kind: 'box' },
              { label: AVAILABILITY_LABEL.after, color: '#94a3b8', kind: 'box' },
              { label: 'Bias F−A (MW)', color: '#b45309' },
            ]}
            summary={`MAE and bias for ${data.points.length} decision cutoffs. ${reading.join(' ')}`}
            footnote={data.note}
          >
            <SensitivityChart points={data.points} selectedCutoff={data.selected_cutoff} />
          </ChartFrame>
        </div>
        <Card className="min-w-0 space-y-3 p-4 lg:col-span-2">
          <p className="text-sm font-semibold text-navy-900">What the timing changes</p>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-700" data-testid="sensitivity-reading">
            {reading.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="min-w-0 p-4">
        <SensitivityTable data={data} />
      </Card>
    </div>
  )
}

export function SensitivityPanel() {
  const { params, resetAnalysis } = useAnalysis()
  // Loaded only when the reader is about to see it: it recomputes the analysis once per publication run.
  const [ref, visible] = useInView<HTMLElement>()
  const query = useCutoffSensitivity(visible ? params : null)
  return (
    <section aria-labelledby="timing-h" ref={ref}>
      <SectionHeader
        id="timing-h"
        title="Does the decision time matter?"
        subtitle="The same analysis repeated as if the decision had been taken just after each regular WINDFOR publication run on the day before delivery."
      />
      {visible ? (
        <QueryBoundary
          query={query}
          skeleton={<Skeleton className="h-80" />}
          onReset={resetAnalysis}
          label="Loading the decision-timing analysis"
        >
          {(data) => <Body data={data} />}
        </QueryBoundary>
      ) : (
        <Skeleton className="h-80" />
      )}
    </section>
  )
}
