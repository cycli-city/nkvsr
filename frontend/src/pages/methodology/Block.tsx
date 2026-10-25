import type { ReactNode } from 'react'
import { Card } from '../../components/ui/primitives'
import { scrollRegion } from '../../lib/a11y'

export function Block({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4 p-5">
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </Card>
  )
}

export const Formula = ({ children }: { children: ReactNode }) => (
  <pre
    {...scrollRegion('Formula')}
    className="relative overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100"
  >
    {children}
  </pre>
)
