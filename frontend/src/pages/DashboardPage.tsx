import { AccuracyPanel } from '../components/panels/AccuracyPanel'
import { DecisionBriefPanel } from '../components/panels/DecisionBriefPanel'
import { TimelinePanel } from '../components/panels/TimelinePanel'
import { SummaryPanel } from '../components/kpi/SummaryPanel'

const SECTIONS = [
  { id: 'summary-h', label: 'Summary' },
  { id: 'brief-h', label: 'Decision brief' },
  { id: 'timeline-h', label: 'Timeline' },
  { id: 'accuracy-h', label: 'Accuracy' },
]

export function DashboardPage() {
  return (
    <div className="space-y-9">
      <nav aria-label="On this page" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-slate-500">Jump to:</span>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-slate-300 bg-white px-3 py-0.5 text-xs font-medium text-slate-700 hover:border-navy-400"
          >
            {s.label}
          </a>
        ))}
      </nav>
      <SummaryPanel />
      <DecisionBriefPanel />
      <TimelinePanel />
      <AccuracyPanel />
    </div>
  )
}
