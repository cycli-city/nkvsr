import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { SlotAccuracy } from '../../api/types'
import { fmtMW, fmtSignedMW } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick } from './chartTheme'

function SlotTip({ active, payload }: TooltipContentProps) {
  const d = payload?.[0]?.payload as SlotAccuracy | undefined
  if (!active || !d) return null
  const end = (() => {
    const [h = 0, m = 0] = d.slot.split(':').map(Number)
    const total = (h * 60 + m + 30) % 1440
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  })()
  return (
    <TooltipBox title={`${d.slot}–${end} (period ${d.settlement_period})`}>
      <TipRow label="Matched" value={`${d.n} of ${d.expected}`} />
      <TipRow label="MAE" color={COLORS.bar} value={fmtMW(d.mae_mw)} strong />
      <TipRow label="Bias (F − A)" color={COLORS.forecast} value={fmtSignedMW(d.bias_mw)} />
      <TipRow label="Mean actual" value={fmtMW(d.mean_actual_mw)} />
    </TooltipBox>
  )
}

export function SlotChart({ slots, height = 280 }: { slots: SlotAccuracy[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={slots} margin={MARGIN}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="slot"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          interval={3}
        />
        <YAxis
          tickFormatter={mwTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={56}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke={COLORS.axis} />
        <Tooltip content={SlotTip} isAnimationActive={false} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
        <Bar dataKey="mae_mw" name="MAE" fill={COLORS.bar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="bias_mw"
          name="Bias"
          stroke={COLORS.forecast}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
