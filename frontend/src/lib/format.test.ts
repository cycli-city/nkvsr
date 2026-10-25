import { describe, expect, it } from 'vitest'
import {
  addDays,
  errorDirection,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtMW,
  fmtNumber,
  fmtPct,
  fmtRelativeMinutes,
  fmtSignedMW,
  londonLocalToUtcIso,
  shiftHalfHours,
  UNAVAILABLE,
  utcToLondonParts,
} from './format'

describe('numbers', () => {
  it('formats with thousands separators', () => {
    expect(fmtNumber(1234567)).toBe('1,234,567')
    expect(fmtMW(8421.4)).toBe('8,421 MW')
  })

  it('shows unavailable values as an em dash, never zero or NaN', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fmtMW(v)).toBe(UNAVAILABLE)
      expect(fmtPct(v)).toBe(UNAVAILABLE)
      expect(fmtSignedMW(v)).toBe(UNAVAILABLE)
    }
  })

  it('keeps a genuine zero as zero', () => {
    expect(fmtMW(0)).toBe('0 MW')
    expect(fmtPct(0)).toBe('0.0%')
  })

  it('signs errors with a typographic minus and no sign for zero', () => {
    expect(fmtSignedMW(120.4)).toBe('+120 MW')
    expect(fmtSignedMW(-85.2)).toBe('−85 MW')
    expect(fmtSignedMW(0)).toBe('0 MW')
    expect(fmtSignedMW(-0.2)).toBe('0 MW')
  })

  it('classifies error direction using forecast − actual', () => {
    expect(errorDirection(5)).toBe('over')
    expect(errorDirection(-5)).toBe('under')
    expect(errorDirection(0)).toBe('none')
    expect(errorDirection(null)).toBeNull()
  })
})

describe('UK time', () => {
  it('shows GMT in winter', () => {
    // ICU versions differ on the comma after the weekday; the content is what matters.
    expect(fmtDateTime('2026-01-15T08:30:00Z')).toMatch(/^Thu,? 15 Jan 2026, 08:30 GMT$/)
  })

  it('converts to BST in summer', () => {
    expect(fmtDateTime('2026-07-01T08:30:00Z')).toMatch(/^Wed,? 1 Jul 2026, 09:30 BST$/)
  })

  it('formats plain calendar dates without timezone drift', () => {
    expect(fmtDate('2026-01-01')).toMatch(/^Thu,? 1 Jan 2026$/)
    expect(fmtDate('2026-03-29', 'short')).toBe('29 Mar')
    expect(fmtDate(null)).toBe(UNAVAILABLE)
  })

  it('adds days across month and daylight-saving boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('round-trips UK local time to UTC in winter and summer', () => {
    expect(londonLocalToUtcIso('2026-01-15', '08:30')).toBe('2026-01-15T08:30:00Z')
    expect(londonLocalToUtcIso('2026-07-01', '08:30')).toBe('2026-07-01T07:30:00Z')
    expect(utcToLondonParts('2026-07-01T07:30:00Z')).toEqual({ date: '2026-07-01', time: '08:30' })
  })

  it('handles the first hour of a clock-change day', () => {
    // Midnight on 29 Mar 2026 is still GMT; 02:00 local does not exist, 03:00 BST == 02:00Z.
    expect(londonLocalToUtcIso('2026-03-29', '00:00')).toBe('2026-03-29T00:00:00Z')
    expect(londonLocalToUtcIso('2026-03-29', '03:00')).toBe('2026-03-29T02:00:00Z')
    // 00:00 on 25 Oct 2026 is BST (== 23:00Z the day before).
    expect(londonLocalToUtcIso('2026-10-25', '00:00')).toBe('2026-10-24T23:00:00Z')
  })

  it('shifts by half-hours', () => {
    expect(shiftHalfHours('2026-01-15T08:30:00Z', 1)).toBe('2026-01-15T09:00:00Z')
    expect(shiftHalfHours('2026-01-15T00:00:00Z', -1)).toBe('2026-01-14T23:30:00Z')
  })
})

describe('durations', () => {
  it('formats hours and minutes', () => {
    expect(fmtDuration(0.5)).toBe('30 min')
    expect(fmtDuration(2)).toBe('2 h')
    expect(fmtDuration(3.3333)).toBe('3 h 20 min')
    expect(fmtDuration(null)).toBe(UNAVAILABLE)
  })

  it('describes time relative to the cutoff', () => {
    expect(fmtRelativeMinutes(-10)).toBe('10 min before cutoff')
    expect(fmtRelativeMinutes(30)).toBe('30 min after cutoff')
    expect(fmtRelativeMinutes(-360)).toBe('6 h before cutoff')
    expect(fmtRelativeMinutes(0)).toBe('at the cutoff')
  })
})
