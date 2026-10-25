import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { BriefPoint } from '../../api/types'
import { fmtDateTime, fmtMW, fmtSignedMW, fmtTime } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick, niceTicks } from './chartTheme'

interface BriefDatum extends BriefPoint {
  t: number
}

function BriefTip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as BriefDatum | undefined
  if (!active || !p) return null
  return (
    <TooltipBox title={`${p.slot} UK time`}>
      <TipRow label="Forecast at cutoff" color={COLORS.forecast} value={fmtMW(p.forecast_mw)} strong />
      <TipRow label="Published" value={fmtDateTime(p.forecast_publish_time)} />
      <TipRow label="Actual (known later)" color={COLORS.actual} value={fmtMW(p.actual_mw)} />
      <TipRow label="Error (F − A)" value={fmtSignedMW(p.error_mw)} />
    </TooltipBox>
  )
}

export function BriefChart({ points, height = 260 }: { points: BriefPoint[]; height?: number }) {
  const data = useMemo<BriefDatum[]>(
    () => points.map((p) => ({ ...p, t: Date.parse(p.start_time) })),
    [points],
  )
  const yTicks = useMemo(
    () => niceTicks(Math.max(0, ...points.flatMap((p) => [p.actual_mw ?? 0, p.forecast_mw ?? 0]))),
    [points],
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(ms: number) => fmtTime(new Date(ms).toISOString())}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          minTickGap={28}
        />
        <YAxis
          domain={[0, yTicks[yTicks.length - 1] ?? 'auto']}
          ticks={yTicks}
          tickFormatter={mwTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={56}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }}
        />
        <Tooltip content={BriefTip} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="actual_mw"
          name="Actual"
          stroke={COLORS.actual}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="stepAfter"
          dataKey="forecast_mw"
          name="Forecast at cutoff"
          stroke={COLORS.forecast}
          strokeWidth={2.25}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ Vintage comparison */
