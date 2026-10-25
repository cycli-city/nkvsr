import { NavLink, Outlet } from 'react-router'
import { useMetadata } from '../../api/hooks'
import { cn } from '../../lib/cn'
import { fmtDateTime } from '../../lib/format'
import { useAnalysis } from '../../state/useAnalysis'
import { Badge } from '../ui/primitives'
import { ControlsBar } from './ControlsBar'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/intervals', label: 'Intervals', end: false },
  { to: '/vintages', label: 'Vintages', end: false },
  { to: '/methodology', label: 'Methodology', end: false },
]

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#132c52" />
      <path
        d="M5 12h13a3 3 0 1 0-3-3M5 17h19a3.5 3.5 0 1 1-3.5 3.5M5 22h9"
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SyntheticBanner() {
  const { data } = useMetadata()
  if (!data?.provenance?.is_synthetic) return null
  return (
    <div role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white">
      SYNTHETIC DEVELOPMENT DATA - these numbers are generated locally and are NOT Elexon observations. Never
      use for analysis, screenshots or claims.
    </div>
  )
}

export function ProvenanceBar() {
  const { data } = useMetadata()
  const { linkTo } = useAnalysis()
  if (!data) return null

  if (!data.data_available) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1">
          <strong>No dataset loaded.</strong>
          <span>{data.load_error ?? 'No snapshot has been ingested from Elexon yet.'}</span>
          {data.refresh.status === 'failed' && data.refresh.error && (
            <span>Last refresh attempt failed: {data.refresh.error}</span>
          )}
        </div>
      </div>
    )
  }

  const p = data.provenance
  const failed = data.refresh.status === 'failed'
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Source: <strong className="font-medium text-slate-800">{p?.source_name}</strong>
          {' · '}
          {data.sources.map((s, i) => (
            <span key={s.code}>
              {i > 0 && ', '}
              <a
                className="underline decoration-slate-300 hover:text-navy-700"
                href={s.documentation_url}
                target="_blank"
                rel="noreferrer"
              >
                {s.code}
              </a>
            </span>
          ))}
          {' · national WIND · '}
          {p?.unit}
        </span>
        <span>
          Last successful refresh:{' '}
          <time className="font-medium text-slate-800" dateTime={p?.retrieved_at}>
            {fmtDateTime(p?.retrieved_at)}
          </time>
        </span>
        {failed && (
          <Badge tone="warn" title={data.refresh.error ?? undefined}>
            Latest refresh attempt failed - showing previously retrieved data
          </Badge>
        )}
        {data.warnings.length > 0 && !p?.is_synthetic && (
          <NavLink
            to={`${linkTo('/methodology')}#quality`}
            className="underline decoration-slate-300 hover:text-navy-700"
          >
            {data.warnings.length} data-quality note{data.warnings.length > 1 ? 's' : ''}
          </NavLink>
        )}
      </div>
    </div>
  )
}

function Footer() {
  const { data } = useMetadata()
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl space-y-1 px-4 py-6 text-xs leading-relaxed text-slate-500">
        <p>
          {data?.provenance?.attribution ??
            'Contains BMRS data © Elexon Limited copyright and database right.'}{' '}
          <a
            className="underline hover:text-slate-700"
            href="https://www.elexon.co.uk/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/"
            target="_blank"
            rel="noreferrer"
          >
            BMRS data licence
          </a>
        </p>
        <p>
          Wind forecast error is <strong className="font-medium text-slate-700">not</strong> the
          utility&apos;s net procurement requirement: demand, other generation, contracted positions, storage
          and balancing are outside the scope of this data. Statistics describe the selected historical window
          and are not guarantees about the future.
        </p>
        <p>An independent analysis tool; not affiliated with or endorsed by Elexon or National Grid ESO.</p>
      </div>
    </footer>
  )
}

export function AppShell() {
  const { linkTo } = useAnalysis()
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-3 py-2 text-sm font-medium text-navy-900 shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <SyntheticBanner />
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight">WindScope UK</p>
              <p className="text-xs text-navy-200">Day-ahead wind forecast analytics</p>
            </div>
          </div>
          <nav aria-label="Primary" className="-mx-1 flex relative overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={linkTo(item.to)}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/15 text-white' : 'text-navy-100 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <ProvenanceBar />
      <ControlsBar />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
