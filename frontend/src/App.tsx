import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { MetadataGate } from './components/states/MetadataGate'
import { LoadingState } from './components/states/QueryBoundary'
import { LinkButton, Skeleton } from './components/ui/primitives'

// Pages are code-split: the charting library (Recharts) is only downloaded by pages that draw charts.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const IntervalsPage = lazy(() => import('./pages/IntervalsPage').then((m) => ({ default: m.IntervalsPage })))
const VintagesPage = lazy(() => import('./pages/VintagesPage').then((m) => ({ default: m.VintagesPage })))
const MethodologyPage = lazy(() =>
  import('./pages/MethodologyPage').then((m) => ({ default: m.MethodologyPage })),
)

function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-navy-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">That address doesn&apos;t exist in WindScope.</p>
      <LinkButton to="/" variant="primary" className="mt-4">
        Back to the dashboard
      </LinkButton>
    </div>
  )
}

const page = (element: ReactNode) => (
  <MetadataGate>
    <Suspense fallback={<LoadingState label="Loading page" skeleton={<Skeleton className="h-96" />} />}>
      {element}
    </Suspense>
  </MetadataGate>
)

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="intervals" element={page(<IntervalsPage />)} />
        <Route path="vintages" element={page(<VintagesPage />)} />
        <Route path="methodology" element={page(<MethodologyPage />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
