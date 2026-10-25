import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useMetadata } from '../api/hooks'
import type { AnalysisParams, Basis, BasisInfo, Metadata } from '../api/types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const BASES: readonly Basis[] = ['decision_date', 'delivery_date']

/** Query keys owned by the analysis selection (everything else in the URL belongs to a page). */
export const ANALYSIS_KEYS = ['basis', 'from', 'to', 'cutoff'] as const

export interface AnalysisState {
  /** Metadata has loaded, so `params` is defined. */
  ready: boolean
  metadata: Metadata | undefined
  params: AnalysisParams | null
  /** Defaults for the *current* basis (full analysis month, configured cutoff). */
  defaults: AnalysisParams | null
  basisInfo: BasisInfo | null
  setAnalysis: (patch: Partial<AnalysisParams>) => void
  resetAnalysis: () => void
  /** Build an in-app link to `path` that carries the current analysis selection plus `extra`. */
  linkTo: (path: string, extra?: Record<string, string | number | undefined>) => string
}

export function defaultsFor(metadata: Metadata, basis: Basis): AnalysisParams {
  const info = metadata.bases.find((b) => b.id === basis) ?? (metadata.bases[0] as BasisInfo)
  return { basis: info.id, from: info.default_from, to: info.default_to, cutoff: metadata.default_cutoff }
}

/** Pure parser (exported for tests): URL search params + metadata -> a complete selection. */
export function parseAnalysis(search: URLSearchParams, metadata: Metadata): AnalysisParams {
  const rawBasis = search.get('basis')
  const basis = BASES.includes(rawBasis as Basis) ? (rawBasis as Basis) : metadata.default_basis
  const d = defaultsFor(metadata, basis)
  const from = search.get('from')
  const to = search.get('to')
  const cutoff = search.get('cutoff')
  return {
    basis,
    from: from && DATE_RE.test(from) ? from : d.from,
    to: to && DATE_RE.test(to) ? to : d.to,
    cutoff: cutoff && TIME_RE.test(cutoff) ? cutoff : d.cutoff,
  }
}

/** Serialise only the non-default parts so shared URLs stay short and readable. */
export function toSearch(p: AnalysisParams, metadata: Metadata): URLSearchParams {
  const d = defaultsFor(metadata, p.basis)
  const out = new URLSearchParams()
  if (p.basis !== metadata.default_basis) out.set('basis', p.basis)
  if (p.from !== d.from) out.set('from', p.from)
  if (p.to !== d.to) out.set('to', p.to)
  if (p.cutoff !== d.cutoff) out.set('cutoff', p.cutoff)
  return out
}

export function useAnalysis(): AnalysisState {
  const { data: metadata } = useMetadata()
  const [search, setSearch] = useSearchParams()

  const params = useMemo(() => (metadata ? parseAnalysis(search, metadata) : null), [search, metadata])
  const defaults = useMemo(
    () => (metadata && params ? defaultsFor(metadata, params.basis) : null),
    [metadata, params],
  )
  const basisInfo = useMemo(
    () => (metadata && params ? (metadata.bases.find((b) => b.id === params.basis) ?? null) : null),
    [metadata, params],
  )

  const write = useCallback(
    (next: AnalysisParams) => {
      if (!metadata) return
      setSearch(
        (prev) => {
          const merged = new URLSearchParams(prev)
          for (const key of [...ANALYSIS_KEYS, 'page']) merged.delete(key)
          toSearch(next, metadata).forEach((value, key) => merged.set(key, value))
          return merged
        },
        { replace: false },
      )
    },
    [metadata, setSearch],
  )

  const setAnalysis = useCallback(
    (patch: Partial<AnalysisParams>) => {
      if (!metadata || !params) return
      let next = { ...params, ...patch }
      if (patch.basis && patch.basis !== params.basis) {
        // Decision dates and delivery dates are different things: never carry a range across bases.
        const d = defaultsFor(metadata, patch.basis)
        next = { ...next, from: patch.from ?? d.from, to: patch.to ?? d.to }
      }
      write(next)
    },
    [metadata, params, write],
  )

  const resetAnalysis = useCallback(() => {
    if (metadata) write(defaultsFor(metadata, metadata.default_basis))
  }, [metadata, write])

  const linkTo = useCallback(
    (path: string, extra?: Record<string, string | number | undefined>) => {
      const qs = metadata && params ? toSearch(params, metadata) : new URLSearchParams()
      for (const [key, value] of Object.entries(extra ?? {})) {
        if (value !== undefined && value !== '') qs.set(key, String(value))
      }
      const text = qs.toString()
      return text ? `${path}?${text}` : path
    },
    [metadata, params],
  )

  return { ready: !!metadata, metadata, params, defaults, basisInfo, setAnalysis, resetAnalysis, linkTo }
}
