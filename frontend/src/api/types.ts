import type { components } from './schema'

type S = components['schemas']

export type Basis = S['AnalysisEcho']['basis']
export type MatchStatus = S['IntervalRow']['match_status']
export type DataStatusName = S['DataStatusOut']['status']

export type Metadata = S['MetadataResponse']
export type BasisInfo = S['BasisInfo']
export type CutoffPreset = S['CutoffPreset']
export type Provenance = S['ProvenanceOut']
export type AnalysisEcho = S['AnalysisEcho']
export type Summary = S['SummaryResponse']
export type Metrics = S['MetricsOut']
export type Coverage = S['CoverageOut']
export type ErrorDistribution = S['ErrorDistributionOut']
export type Baseline = S['BaselineOut']
export type TimeSeries = S['TimeSeriesResponse']
export type TimeSeriesPoint = S['TimeSeriesPoint']
export type Accuracy = S['AccuracyResponse']
export type DailyAccuracy = S['DailyAccuracy']
export type SlotAccuracy = S['SlotAccuracy']
export type DaypartAccuracy = S['DaypartAccuracy']
export type Histogram = S['HistogramOut']
export type IntervalRow = S['IntervalRow']
export type Intervals = S['IntervalsResponse']
export type Vintages = S['VintagesResponse']
export type VintageRow = S['VintageRow']
export type DecisionBrief = S['DecisionBriefResponse']
export type BriefPoint = S['BriefPoint']

/** The analysis selection that is mirrored in the URL and sent with every analytics request. */
export interface AnalysisParams {
  basis: Basis
  /** Inclusive, in the date type of `basis` (decision date or delivery date), YYYY-MM-DD. */
  from: string
  to: string
  /** Decision cutoff, 24h HH:MM Europe/London on the day before delivery. */
  cutoff: string
}

export type IntervalSort =
  'start_time' | 'forecast' | 'actual' | 'error' | 'abs_error' | 'publish_time' | 'forecast_age'

export interface IntervalQuery {
  page: number
  page_size: number
  sort_by: IntervalSort
  sort_dir: 'asc' | 'desc'
  status: 'all' | 'matched' | 'missing_any' | 'missing_forecast' | 'missing_actual' | 'missing_both'
  direction?: 'over' | 'under'
  min_abs_error?: number
  q?: string
}
