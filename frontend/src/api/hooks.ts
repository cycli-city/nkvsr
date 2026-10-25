import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, ApiError, NetworkError } from './client'
import type { AnalysisParams, IntervalQuery } from './types'

const FIVE_MINUTES = 5 * 60_000

/** Retry only transport failures (cold start, flaky network); API errors are deterministic. */
export function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError) return error.status >= 502 && failureCount < 2
  return error instanceof NetworkError && failureCount < 2
}

const base = { staleTime: FIVE_MINUTES, retry: shouldRetry } as const

export const useMetadata = () =>
  useQuery({
    queryKey: ['metadata'],
    queryFn: ({ signal }) => api.metadata(signal),
    ...base,
    staleTime: 60_000,
  })

export const useSummary = (p: AnalysisParams | null) =>
  useQuery({
    queryKey: ['summary', p],
    queryFn: ({ signal }) => api.summary(p as AnalysisParams, signal),
    enabled: p !== null,
    placeholderData: keepPreviousData,
    ...base,
  })

export const useTimeseries = (p: AnalysisParams | null) =>
  useQuery({
    queryKey: ['timeseries', p],
    queryFn: ({ signal }) => api.timeseries(p as AnalysisParams, signal),
    enabled: p !== null,
    placeholderData: keepPreviousData,
    ...base,
  })

export const useAccuracy = (p: AnalysisParams | null) =>
  useQuery({
    queryKey: ['accuracy', p],
    queryFn: ({ signal }) => api.accuracy(p as AnalysisParams, signal),
    enabled: p !== null,
    placeholderData: keepPreviousData,
    ...base,
  })

export const useCutoffSensitivity = (p: AnalysisParams | null) =>
  useQuery({
    queryKey: ['cutoff-sensitivity', p],
    queryFn: ({ signal }) => api.cutoffSensitivity(p as AnalysisParams, signal),
    enabled: p !== null,
    placeholderData: keepPreviousData,
    ...base,
  })

export const useIntervals = (p: AnalysisParams | null, q: IntervalQuery) =>
  useQuery({
    queryKey: ['intervals', p, q],
    queryFn: ({ signal }) => api.intervals(p as AnalysisParams, q, signal),
    enabled: p !== null,
    placeholderData: keepPreviousData,
    ...base,
  })

export const useVintages = (start: string | null, cutoff: string | null) =>
  useQuery({
    queryKey: ['vintages', start, cutoff],
    queryFn: ({ signal }) => api.vintages(start as string, cutoff as string, signal),
    enabled: start !== null && cutoff !== null,
    ...base,
  })

export const useDecisionBrief = (decisionDate: string | null, cutoff: string | null) =>
  useQuery({
    queryKey: ['decision-brief', decisionDate, cutoff],
    queryFn: ({ signal }) => api.decisionBrief(decisionDate as string, cutoff as string, signal),
    enabled: decisionDate !== null && cutoff !== null,
    placeholderData: keepPreviousData,
    ...base,
  })
