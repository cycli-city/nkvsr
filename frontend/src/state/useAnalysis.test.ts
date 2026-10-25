import { describe, expect, it } from 'vitest'
import { metadata } from '../test/fixtures'
import { defaultsFor, parseAnalysis, toSearch } from './useAnalysis'

const meta = metadata()
const q = (s: string) => new URLSearchParams(s)

describe('parseAnalysis', () => {
  it('uses metadata defaults when the URL is empty', () => {
    expect(parseAnalysis(q(''), meta)).toEqual({
      basis: 'decision_date',
      from: '2026-01-01',
      to: '2026-01-31',
      cutoff: '09:20',
    })
  })

  it('reads valid values from the URL', () => {
    expect(parseAnalysis(q('basis=delivery_date&from=2026-01-05&to=2026-01-11&cutoff=09:50'), meta)).toEqual({
      basis: 'delivery_date',
      from: '2026-01-05',
      to: '2026-01-11',
      cutoff: '09:50',
    })
  })

  it('falls back to defaults for malformed values instead of sending garbage to the API', () => {
    const p = parseAnalysis(q('basis=nonsense&from=yesterday&to=2026-1-5&cutoff=9.20'), meta)
    expect(p).toEqual(defaultsFor(meta, 'decision_date'))
  })

  it('accepts a basis-specific default range when only the basis is given', () => {
    expect(parseAnalysis(q('basis=delivery_date'), meta)).toMatchObject({
      basis: 'delivery_date',
      from: '2026-01-01',
      to: '2026-01-31',
    })
  })
})

describe('toSearch', () => {
  it('omits everything that equals the defaults, keeping shared URLs short', () => {
    expect(toSearch(defaultsFor(meta, 'decision_date'), meta).toString()).toBe('')
  })

  it('serialises only what differs', () => {
    const s = toSearch(
      { basis: 'delivery_date', from: '2026-01-01', to: '2026-01-07', cutoff: '09:20' },
      meta,
    )
    expect(Object.fromEntries(s)).toEqual({ basis: 'delivery_date', to: '2026-01-07' })
  })

  it('round-trips through parseAnalysis', () => {
    const original = {
      basis: 'delivery_date' as const,
      from: '2026-01-03',
      to: '2026-01-09',
      cutoff: '10:15',
    }
    expect(parseAnalysis(toSearch(original, meta), meta)).toEqual(original)
  })
})
