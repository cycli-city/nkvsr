import { useId, useState } from 'react'
import { Button } from '../../components/ui/primitives'
import { londonLocalToUtcIso, utcToLondonParts } from '../../lib/format'

const SLOTS = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
)

export function VintagePicker({
  initial,
  min,
  max,
  onPick,
}: {
  initial: string | null
  min: string
  max: string
  onPick: (iso: string) => void
}) {
  const parts = initial ? utcToLondonParts(initial) : { date: min, time: '08:30' }
  const [date, setDate] = useState(parts.date)
  const [time, setTime] = useState(parts.time)
  const ids = { date: useId(), time: useId() }
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (date) onPick(londonLocalToUtcIso(date, time))
      }}
    >
      <div>
        <label htmlFor={ids.date} className="block text-xs font-medium text-slate-600">
          Delivery date (UK)
        </label>
        <input
          id={ids.date}
          type="date"
          min={min}
          max={max}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor={ids.time} className="block text-xs font-medium text-slate-600">
          Half-hour starting
        </label>
        <select
          id={ids.time}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
        >
          {SLOTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="primary">
        Show vintages
      </Button>
    </form>
  )
}
