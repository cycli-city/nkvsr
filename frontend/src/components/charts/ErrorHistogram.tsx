import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { Histogram } from '../../api/types'
import { fmtNumber, fmtPct, fmtSignedMW } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN } from './chartTheme'

interface BinDatum {
  lower: number
  upper: number
  count: number
  label: string
  share: number
}

function HistTip({ active, payload }: TooltipContentProps) {
  const d = payload?.[0]?.payload as BinDatum | undefined
  if (!active || !d) return null
  const side = d.lower >= 0 ? 'over-forecast' : 'under-forecast'
  return (
    <TooltipBox title={`${fmtSignedMW(d.lower)} to ${fmtSignedMW(d.upper)}`}>
      <TipRow label="Intervals" value={`${fmtNumber(d.count)} (${fmtPct(d.share)})`} strong />
      <TipRow label="Direction" value={side} color={d.lower >= 0 ? COLORS.over : COLORS.under} />
    </TooltipBox>
  )
}

export function ErrorHistogram({ histogram, height = 260 }: { histogram: Histogram; height?: number }) {
  const total = histogram.bins.reduce((sum, b) => sum + b.count, 0)
  const data = useMemo<BinDatum[]>(
    () =>
      histogram.bins.map((b) => ({
        lower: b.lower_mw,
        upper: b.upper_mw,
        count: b.count,
        label: fmtNumber(b.lower_mw),
        share: total ? b.count / total : 0,
      })),
    [histogram.bins, total],
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={MARGIN} barCategoryGap={1}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          interval="preserveStartEnd"
          minTickGap={24}
          label={{
            value: 'Forecast error (MW, forecast − actual)',
            position: 'insideBottom',
            offset: -2,
            fill: COLORS.axis,
            fontSize: 11,
          }}
          height={36}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
        <Tooltip content={HistTip} isAnimationActive={false} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
        <Bar dataKey="count" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.lower} fill={d.lower >= 0 ? COLORS.over : COLORS.under} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ By half-hour slot */
