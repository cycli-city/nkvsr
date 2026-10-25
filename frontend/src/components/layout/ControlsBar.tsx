import { useId, useState } from 'react'
import type { Basis } from '../../api/types'
import { cn } from '../../lib/cn'
import { fmtDate } from '../../lib/format'
import { rangePresets } from '../../lib/presets'
import { useAnalysis } from '../../state/useAnalysis'
import { Button } from '../ui/primitives'

const CUSTOM = 'custom'
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const labelCls = 'block text-xs font-medium text-slate-600'
const fieldCls =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-teal-600 aria-[invalid=true]:border-red-500'

export function ControlsBar() {
  const { ready, metadata, params, basisInfo, setAnalysis, resetAnalysis } = useAnalysis()
  const ids = { basis: useId(), from: useId(), to: useId(), cutoff: useId(), custom: useId(), panel: useId() }
  const [customOpen, setCustomOpen] = useState(false)
  const [expanded, setExpanded] = useState(false) // phones only: the controls collapse to one line

  if (!ready || !metadata || !params || !basisInfo) return null

  const presetValues = metadata.cutoff_presets.map((p) => p.value)
  const isCustomCutoff = customOpen || !presetValues.includes(params.cutoff)
  const activePreset = metadata.cutoff_presets.find((p) => p.value === params.cutoff)
  const dateOutOfBounds = (d: string) => d < basisInfo.min_date || d > basisInfo.max_date
  const fromInvalid = dateOutOfBounds(params.from) || params.from > params.to
  const toInvalid = dateOutOfBounds(params.to) || params.to < params.from
  const dateKind = basisInfo.date_type === 'decision' ? 'Decision' : 'Delivery'
  const presets = rangePresets(basisInfo.min_date, basisInfo.max_date)

  const commitDate = (key: 'from' | 'to') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value) setAnalysis({ [key]: value })
  }

  return (
    <section aria-label="Analysis selection" className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <p className="min-w-0 text-sm text-slate-700">
            <strong className="font-semibold text-navy-900">{basisInfo.label}</strong>
            <span className="text-slate-500">
              {' '}
              · {fmtDate(params.from, 'short')} – {fmtDate(params.to, 'short')} · cutoff {params.cutoff} UK
            </span>
          </p>
          <Button
            variant="secondary"
            aria-expanded={expanded}
            aria-controls={ids.panel}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'Edit'}
          </Button>
        </div>
        <div id={ids.panel} className={cn(expanded ? 'mt-3 block' : 'hidden', 'lg:mt-0 lg:block')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-start">
            <div>
              <label htmlFor={ids.basis} className={labelCls}>
                &ldquo;January&rdquo; means
              </label>
              <select
                id={ids.basis}
                className={fieldCls}
                value={params.basis}
                onChange={(e) => setAnalysis({ basis: e.target.value as Basis })}
              >
                {metadata.bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={ids.from} className={labelCls}>
                {dateKind} date from
              </label>
              <input
                id={ids.from}
                type="date"
                className={fieldCls}
                value={params.from}
                min={basisInfo.min_date}
                max={basisInfo.max_date}
                aria-invalid={fromInvalid}
                onChange={commitDate('from')}
              />
            </div>
            <div>
              <label htmlFor={ids.to} className={labelCls}>
                {dateKind} date to
              </label>
              <input
                id={ids.to}
                type="date"
                className={fieldCls}
                value={params.to}
                min={basisInfo.min_date}
                max={basisInfo.max_date}
                aria-invalid={toInvalid}
                onChange={commitDate('to')}
              />
            </div>

            <div>
              <label htmlFor={ids.cutoff} className={labelCls}>
                Decision cutoff (UK time, day before delivery)
              </label>
              <div className="flex gap-2">
                <select
                  id={ids.cutoff}
                  className={fieldCls}
                  value={isCustomCutoff ? CUSTOM : params.cutoff}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM) setCustomOpen(true)
                    else {
                      setCustomOpen(false)
                      setAnalysis({ cutoff: e.target.value })
                    }
                  }}
                >
                  {metadata.cutoff_presets.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value} - {p.label}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom time…</option>
                </select>
                {isCustomCutoff && (
                  <input
                    id={ids.custom}
                    type="time"
                    step={60}
                    aria-label="Custom decision cutoff time"
                    className={cn(fieldCls, 'w-28')}
                    value={params.cutoff}
                    onChange={(e) => TIME_RE.test(e.target.value) && setAnalysis({ cutoff: e.target.value })}
                  />
                )}
              </div>
            </div>

            <div className="flex items-end lg:pt-5">
              <Button
                variant="ghost"
                onClick={() => {
                  setCustomOpen(false)
                  resetAnalysis()
                }}
              >
                Reset
              </Button>
            </div>
          </div>

          <div
            className="mt-2.5 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Quick date ranges"
          >
            <span className="mr-1 text-xs text-slate-500">Quick range:</span>
            {presets.map((p) => {
              const active = p.from === params.from && p.to === params.to
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAnalysis({ from: p.from, to: p.to })}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-navy-800 bg-navy-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-navy-400',
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {(fromInvalid || toInvalid) && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              Choose dates between {fmtDate(basisInfo.min_date)} and {fmtDate(basisInfo.max_date)}, with
              &ldquo;from&rdquo; not after &ldquo;to&rdquo;.
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            <strong className="font-medium text-slate-800">{basisInfo.label}.</strong> {basisInfo.description}{' '}
            Each half-hour uses the{' '}
            <em>
              latest WINDFOR forecast published at or before {params.cutoff} UK time on the day before
              delivery
            </em>
            {activePreset ? ` (${activePreset.label})` : ''}. Error = forecast − actual.
          </p>
        </div>
      </div>
    </section>
  )
}
