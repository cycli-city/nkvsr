import { describe, expect, it } from 'vitest'
import { parseIntervalQuery } from './intervalQuery'
import { rangePresets } from './presets'

const q = (s: string) => new URLSearchParams(s)

describe('parseIntervalQuery', () => {
  it('has sensible defaults', () => {
    expect(parseIntervalQuery(q(''))).toEqual({
      page: 1,
      page_size: 50,
      sort_by: 'start_time',
      sort_dir: 'asc',
      status: 'all',
      direction: undefined,
      min_abs_error: undefined,
      q: undefined,
    })
  })

  it('accepts valid filters', () => {
    expect(
      parseIntervalQuery(
        q(
          'page=3&page_size=100&sort_by=abs_error&sort_dir=desc&status=missing_any&direction=over&min_abs_error=1500&q=%20sat%20',
        ),
      ),
    ).toEqual({
      page: 3,
      page_size: 100,
      sort_by: 'abs_error',
      sort_dir: 'desc',
      status: 'missing_any',
      direction: 'over',
      min_abs_error: 1500,
      q: 'sat',
    })
  })

  it('rejects invalid values rather than forwarding them', () => {
    const r = parseIntervalQuery(
      q('page=-2&page_size=7&sort_by=hax&sort_dir=sideways&status=zzz&direction=up&min_abs_error=-5'),
    )
    expect(r).toMatchObject({ page: 1, page_size: 50, sort_by: 'start_time', sort_dir: 'asc', status: 'all' })
    expect(r.direction).toBeUndefined()
    expect(r.min_abs_error).toBeUndefined()
  })
})

describe('rangePresets', () => {
  it('offers the full period then consecutive 7-day blocks that tile the window', () => {
    const presets = rangePresets('2026-01-01', '2026-01-31')
    expect(presets[0]).toMatchObject({ label: 'Full period', from: '2026-01-01', to: '2026-01-31' })
    expect(presets.slice(1).map((p) => [p.from, p.to])).toEqual([
      ['2026-01-01', '2026-01-07'],
      ['2026-01-08', '2026-01-14'],
      ['2026-01-15', '2026-01-21'],
      ['2026-01-22', '2026-01-28'],
      ['2026-01-29', '2026-01-31'],
    ])
  })
})
