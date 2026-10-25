import { useMemo } from 'react'
import {
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { TimeSeriesPoint } from '../../api/types'
import { DIRECTION_LABEL, errorDirection, fmtDateTime, fmtMW, fmtSignedMW } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick, niceTicks, timeTick } from './chartTheme'

interface Datum extends TimeSeriesPoint {
  t: number
}

function Tip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as Datum | undefined
  if (!active || !p) return null
  const dir = errorDirection(p.error_mw)
  return (
    <TooltipBox title={fmtDateTime(p.start_time)}>
      <TipRow label="Actual" color={COLORS.actual} value={fmtMW(p.actual_mw)} />
      <TipRow label="Forecast at cutoff" color={COLORS.forecast} value={fmtMW(p.forecast_mw)} />
      <TipRow
        label="Error (F − A)"
        strong
        value={
          p.error_mw == null
            ? 'Unavailable'
            : `${fmtSignedMW(p.error_mw)}${dir && dir !== 'none' ? ` · ${DIRECTION_LABEL[dir]}` : ''}`
        }
      />
      <TipRow label="Published" value={fmtDateTime(p.forecast_publish_time)} />
      {p.latest_forecast_mw != null && (
        <TipRow
          label="Latest forecast (hindsight)"
          color={COLORS.hindsight}
          value={fmtMW(p.latest_forecast_mw)}
        />
      )}
      {p.match_status !== 'matched' && <TipRow label="Status" value={p.match_status.replace('_', ' ')} />}
    </TooltipBox>
  )
}

export function TimelineChart({
  points,
  showLatest,
  onSelect,
  height = 360,
}: {
  points: TimeSeriesPoint[]
  showLatest: boolean
  onSelect?: (point: TimeSeriesPoint) => void
  height?: number
}) {
  const data = useMemo<Datum[]>(() => points.map((p) => ({ ...p, t: Date.parse(p.start_time) })), [points])
  const spanDays = data.length > 1 ? ((data[data.length - 1]?.t ?? 0) - (data[0]?.t ?? 0)) / 86_400_000 : 1
  const tick = useMemo(() => timeTick(spanDays), [spanDays])
  const yTicks = useMemo(
    () =>
      niceTicks(
        Math.max(
          0,
          ...points.flatMap((p) => [
            p.actual_mw ?? 0,
            p.forecast_mw ?? 0,
            showLatest ? (p.latest_forecast_mw ?? 0) : 0,
          ]),
        ),
      ),
    [points, showLatest],
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={MARGIN}
        onClick={(state) => {
          const index = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : undefined
          const point = index !== undefined ? data[index] : undefined
          if (point && onSelect) onSelect(point)
        }}
        style={{ cursor: onSelect ? 'pointer' : undefined }}
      >
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={tick}
          tick={AXIS_TICK}
          axisLine={{ stroke: COLORS.axisLine }}
          tickLine={false}
          minTickGap={36}
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
        <Tooltip content={Tip} isAnimationActive={false} />
        {showLatest && (
          <Line
            type="monotone"
            dataKey="latest_forecast_mw"
            name="Latest published forecast (hindsight)"
            stroke={COLORS.hindsight}
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="actual_mw"
          name="Actual"
          stroke={COLORS.actual}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="forecast_mw"
          name="Forecast at cutoff"
          stroke={COLORS.forecast}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
        {data.length > 96 && (
          <Brush
            dataKey="t"
            height={26}
            travellerWidth={8}
            stroke={COLORS.axis}
            tickFormatter={tick}
            fill="#f8fafc"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
