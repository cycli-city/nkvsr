import { describe, expect, it } from 'vitest'
import { activeIndexOf, niceTicks, timeTick } from './chartTheme'

describe('activeIndexOf', () => {
  it('accepts the string index Recharts 3 emits and the numeric one older versions emit', () => {
    expect(activeIndexOf({ activeTooltipIndex: '123' })).toBe(123)
    expect(activeIndexOf({ activeTooltipIndex: 7 })).toBe(7)
    expect(activeIndexOf({ activeTooltipIndex: '0' })).toBe(0)
  })

  it('ignores missing or malformed indexes instead of navigating somewhere arbitrary', () => {
    for (const bad of [undefined, null, '', ' ', 'abc', -1, '-3', 1.5, Number.NaN]) {
      expect(activeIndexOf({ activeTooltipIndex: bad })).toBeUndefined()
    }
    expect(activeIndexOf({})).toBeUndefined()
  })
})

describe('niceTicks', () => {
  it('produces round ticks from zero to just above the maximum', () => {
    expect(niceTicks(14000)).toEqual([0, 2500, 5000, 7500, 10000, 12500, 15000])
    expect(niceTicks(10774)).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000])
    expect(niceTicks(900)).toEqual([0, 200, 400, 600, 800, 1000])
  })

  it('degrades safely for empty or non-positive data', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(Number.NaN)).toEqual([0])
    expect(niceTicks(-5)).toEqual([0])
  })
})

describe('timeTick', () => {
  const noon = Date.parse('2026-01-12T12:00:00Z')
  const midnight = Date.parse('2026-01-12T00:00:00Z')

  it('shows only the time when a day or less is on screen', () => {
    expect(timeTick(1)(noon)).toBe('12:00')
  })

  it('keeps the time next to the date up to ten days, so two ticks on one day never read the same', () => {
    const tick = timeTick(8)
    expect(tick(midnight)).not.toBe(tick(noon))
    expect(tick(noon)).toContain('12 Jan')
    expect(tick(noon)).toContain('12:00')
  })

  it('uses the date alone for longer spans, where there is at most one tick a day', () => {
    expect(timeTick(30)(noon)).toBe('12 Jan')
  })
})
