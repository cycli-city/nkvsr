import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { SensitivityPoint } from '../../api/types'
import { fmtDuration, fmtMW, fmtSignedMW } from '../../lib/format'
import { AVAILABILITY_LABEL, availability, type Availability } from '../../lib/sensitivity'
import { TipRow, TooltipBox } from './chartKit'
import { AXIS_TICK, COLORS, MARGIN, mwTick } from './chartTheme'

const FILL: Record<Availability, string> = {
  selected: COLORS.forecast,
  before: COLORS.bar,
  after: COLORS.hindsight,
}

interface Datum extends SensitivityPoint {
  kind: Availability
}

function Tip({ active, payload }: TooltipContentProps) {
  const d = payload?.[0]?.payload as Datum | undefined
  if (!active || !d) return null
  return (
    <TooltipBox title={`Decision at ${d.cutoff_local} UK, day before delivery`}>
      <TipRow label="Position" value={AVAILABILITY_LABEL[d.kind]} />
      <TipRow label="Forecast from the" value={d.run_used_local ? `${d.run_used_local} run` : '—'} />
      <TipRow
        label="Median forecast age"
        value={d.median_forecast_age_h != null ? fmtDuration(d.median_forecast_age_h) : '—'}
      />
      <TipRow label="MAE" color={FILL[d.kind]} value={fmtMW(d.mae_mw)} strong />
      <TipRow label="RMSE" value={fmtMW(d.rmse_mw)} />
      <TipRow label="Bias (F − A)" color={COLORS.over} value={fmtSignedMW(d.bias_mw)} />
    </TooltipBox>
  )
}

/** MAE per decision cutoff as bars (colour = availability), bias as an amber line to show what does not move. */
export function SensitivityChart({
  points,
  selectedCutoff,
  height = 300,
}: {
  points: SensitivityPoint[]
  selectedCutoff: string
  height?: number
}) {
  const data: Datum[] = points.map((p) => ({ ...p, kind: availability(p, selectedCutoff) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="cutoff_local"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: COLORS.axisLine }}
          label={{
            value: 'Decision cutoff (UK time, day before delivery)',
            position: 'insideBottom',
            offset: -2,
            fill: COLORS.axis,
            fontSize: 11,
          }}
          height={36}
        />
        <YAxis
          tickFormatter={mwTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={56}
          domain={[0, 'auto']}
          label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }}
        />
        <Tooltip content={Tip} isAnimationActive={false} cursor={{ fill: 'rgba(15,23,42,0.05)' }} />
        <Bar dataKey="mae_mw" name="MAE" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.cutoff_local} fill={FILL[d.kind]} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="bias_mw"
          name="Bias"
          stroke={COLORS.over}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.over, stroke: COLORS.over }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
