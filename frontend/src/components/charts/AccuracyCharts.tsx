import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { DailyAccuracy, Histogram, SlotAccuracy } from '../../api/types'
import { fmtDate, fmtMW, fmtNumber, fmtPct, fmtSignedMW } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick } from './chartTheme'

/* ------------------------------------------------------------------ Daily error trend */

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
          const i = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : undefined
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
