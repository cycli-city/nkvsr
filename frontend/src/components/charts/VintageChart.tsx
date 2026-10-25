import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { VintageRow } from '../../api/types'
import { fmtDateTime, fmtDuration, fmtMW, fmtRelativeMinutes } from '../../lib/format'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick } from './chartTheme'

interface VintageDatum extends VintageRow {
  t: number
  kind: 'selected' | 'eligible' | 'late'
}

function VintageTip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as VintageDatum | undefined
  if (!active || !p) return null
  return (
    <TooltipBox title={fmtDateTime(p.publish_time)}>
      <TipRow
        label="Forecast"
        value={fmtMW(p.forecast_mw)}
        strong
        color={p.kind === 'late' ? COLORS.hindsight : COLORS.forecast}
      />
      <TipRow label="Lead time" value={fmtDuration(p.lead_time_h)} />
      <TipRow label="Vs cutoff" value={fmtRelativeMinutes(p.minutes_from_cutoff)} />
      <TipRow
        label="Status"
        value={
          p.selected ? 'Used at decision time' : p.eligible ? 'Eligible (superseded)' : 'After the cutoff'
        }
      />
    </TooltipBox>
  )
}

function VintageDot(props: { cx?: number; cy?: number; payload?: VintageDatum }) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined || !payload) return <g />
  if (payload.kind === 'selected') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="none" stroke={COLORS.forecast} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={4.5} fill={COLORS.forecast} />
      </g>
    )
  }
  if (payload.kind === 'late') {
    return <circle cx={cx} cy={cy} r={4} fill="#fff" stroke={COLORS.hindsight} strokeWidth={1.75} />
  }
  return <circle cx={cx} cy={cy} r={3.5} fill={COLORS.actual} fillOpacity={0.85} />
}

export function VintageChart({
  vintages,
  cutoffTime,
  cutoffLabel,
  actualMw,
  height = 340,
}: {
  vintages: VintageRow[]
  cutoffTime: string
  cutoffLabel: string
  actualMw: number | null
  height?: number
}) {
  const data = useMemo<VintageDatum[]>(
    () =>
      vintages.map((v) => ({
        ...v,
        t: Date.parse(v.publish_time),
        kind: v.selected ? 'selected' : v.eligible ? 'eligible' : 'late',
      })),
    [vintages],
  )
  const cutoffMs = Date.parse(cutoffTime)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ ...MARGIN, right: 24 }}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin - 3600000', 'dataMax + 3600000']}
          tickFormatter={(ms: number) =>
            new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Europe/London',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(ms))
          }
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          minTickGap={44}
          label={{
            value: 'Forecast publication time (UK)',
            position: 'insideBottom',
            offset: -2,
            fill: COLORS.axis,
            fontSize: 11,
          }}
          height={38}
        />
        <YAxis
          type="number"
          dataKey="forecast_mw"
          domain={['auto', 'auto']}
          tickFormatter={mwTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={60}
          label={{
            value: 'Forecast MW',
            angle: -90,
            position: 'insideLeft',
            fill: COLORS.axis,
            fontSize: 11,
          }}
        />
        <Tooltip content={VintageTip} isAnimationActive={false} cursor={{ strokeDasharray: '3 3' }} />
        <ReferenceLine
          x={cutoffMs}
          stroke={COLORS.cutoff}
          strokeWidth={1.75}
          strokeDasharray="6 4"
          label={{
            value: cutoffLabel,
            position: 'insideTopRight',
            fill: COLORS.cutoff,
            fontSize: 11,
            fontWeight: 600,
          }}
        />
        {actualMw != null && (
          <ReferenceLine
            y={actualMw}
            stroke={COLORS.actual}
            strokeDasharray="2 3"
            label={{
              value: `Actual ${fmtMW(actualMw)}`,
              position: 'insideBottomLeft',
              fill: COLORS.actual,
              fontSize: 11,
            }}
          />
        )}
        <Line
          type="stepAfter"
          dataKey="forecast_mw"
          stroke={COLORS.hindsight}
          strokeWidth={1.25}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Scatter dataKey="forecast_mw" shape={VintageDot as never} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
