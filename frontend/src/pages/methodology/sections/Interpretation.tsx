import { scrollRegion } from '../../../lib/a11y'
import { Block } from '../Block'
import type { Metadata } from '../../../api/types'

/** What "decisions made in January" means. */
export function Interpretation({
  meta,
  month,
  activeBasis,
}: {
  meta: Metadata
  month: string
  activeBasis: string | undefined
}) {
  return (
    <Block id="interpretation" title={`What does "decisions made in ${month}" mean?`}>
      <p>The brief is ambiguous, so both readings are supported and never mixed:</p>
      <div {...scrollRegion('Interpretations table')} className="relative overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Reading</th>
              <th className="px-2 py-1 text-left font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meta.bases.map((b) => (
              <tr key={b.id} className={b.id === activeBasis ? 'bg-teal-50/50' : undefined}>
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
  )
}
