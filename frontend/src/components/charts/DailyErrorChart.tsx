import { useMemo } from 'react'
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
import type { DailyAccuracy } from '../../api/types'
import { fmtDate, fmtMW, fmtPct, fmtSignedMW } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { activeIndexOf, AXIS_TICK, COLORS, MARGIN, mwTick } from './chartTheme'

interface DailyDatum extends DailyAccuracy {
  label: string
}

function DailyTip({ active, payload }: TooltipContentProps) {
  const d = payload?.[0]?.payload as DailyDatum | undefined
  if (!active || !d) return null
  return (
    <TooltipBox title={`Delivery ${fmtDate(d.delivery_date)}`}>
      <TipRow label="Decision made" value={fmtDate(d.decision_date)} />
      <TipRow label="Matched" value={`${d.n} of ${d.expected} (${fmtPct(d.coverage, 0)})`} />
      <TipRow label="MAE" color={COLORS.bar} value={fmtMW(d.mae_mw)} strong />
      <TipRow label="RMSE" value={fmtMW(d.rmse_mw)} />
      <TipRow label="Bias (F − A)" color={COLORS.forecast} value={fmtSignedMW(d.bias_mw)} />
      <TipRow label="WAPE" value={fmtPct(d.wape)} />
    </TooltipBox>
  )
}

export function DailyErrorChart({
  daily,
  onSelectDay,
  height = 280,
}: {
  daily: DailyAccuracy[]
  onSelectDay?: (row: DailyAccuracy) => void
  height?: number
}) {
  const data = useMemo<DailyDatum[]>(
    () => daily.map((d) => ({ ...d, label: fmtDate(d.delivery_date, 'short') })),
    [daily],
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={MARGIN}
        onClick={(state) => {
          const i = activeIndexOf(state)
          const row = i !== undefined ? data[i] : undefined
          if (row && onSelectDay) onSelectDay(row)
        }}
        style={{ cursor: onSelectDay ? 'pointer' : undefined }}
      >
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          interval="preserveStartEnd"
          minTickGap={14}
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
        <Tooltip content={DailyTip} isAnimationActive={false} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
        <Bar
          dataKey="mae_mw"
          name="MAE"
          fill={COLORS.bar}
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
          maxBarSize={36}
        />
        <Line
          type="monotone"
          dataKey="bias_mw"
          name="Bias"
          stroke={COLORS.forecast}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.forecast, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ Error distribution */
