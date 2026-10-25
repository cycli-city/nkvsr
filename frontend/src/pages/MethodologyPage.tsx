import { useMetadata } from '../api/hooks'
import { SectionHeader } from '../components/ui/primitives'
import { useAnalysis } from '../state/useAnalysis'
import { Limitations } from './methodology/sections/Limitations'
import { CoverageSection } from './methodology/sections/CoverageSection'
import { DataQuality } from './methodology/sections/DataQuality'
import { DataSources } from './methodology/sections/DataSources'
import { DecisionTimeRule } from './methodology/sections/DecisionTimeRule'
import { Interpretation } from './methodology/sections/Interpretation'
import { MetricDefinitions } from './methodology/sections/MetricDefinitions'
import { WhatThisAnswers } from './methodology/sections/WhatThisAnswers'
import type { Quality } from './methodology/quality'

/** The methodology page: how every number is produced. One component per section lives in `methodology/sections`. */
export function MethodologyPage() {
  const { data: meta } = useMetadata()
  const { params, basisInfo } = useAnalysis()
  if (!meta) return null
  const quality = meta.quality as Quality
  const cutoff = params?.cutoff ?? meta.default_cutoff
  const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(`${meta.analysis_month}-01T12:00:00Z`),
  )

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Methodology and data quality"
        subtitle="Exactly how every number in WindScope is produced, what the data does and does not cover, and where the analysis stops."
      />
      <WhatThisAnswers />
      <DataSources meta={meta} />
      <DecisionTimeRule meta={meta} cutoff={cutoff} profile={quality.forecast_profile} />
      <Interpretation meta={meta} month={month} activeBasis={params?.basis} />
      <MetricDefinitions />
      <CoverageSection meta={meta} basisInfo={basisInfo} />
      <DataQuality meta={meta} quality={quality} />
      <Limitations />
    </div>
  )
}
