import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures'
import { availability, readSensitivity } from './sensitivity'

const data = fx.sensitivity()
const at = (clock: string) => data.points.find((p) => p.cutoff_local === clock)!

describe('availability', () => {
  it('marks the chosen cutoff, earlier runs that could have informed it, and later runs that could not', () => {
    expect(availability(at('09:20'), '09:20')).toBe('selected')
    expect(availability(at('07:30'), '09:20')).toBe('before')
    expect(availability(at('09:30'), '09:20')).toBe('after')
    expect(availability(at('22:30'), '09:20')).toBe('after')
  })

  it('a run exactly at the cutoff is the selected one, never a hindsight run', () => {
    const exact = { ...at('09:30'), is_selected: true }
    expect(availability(exact, '09:30')).toBe('selected')
  })
})

describe('readSensitivity', () => {
  it('states where the forecast came from, what the next run would have changed, and what the last run does to bias', () => {
    const lines = readSensitivity(data)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      'At your 09:20 cutoff the forecast came from the 07:30 run, a median 1 h 50 min old: MAE 2,042 MW.',
    )
    expect(lines[1]).toMatch(/next run \(09:30\) came out after your cutoff/)
    expect(lines[1]).toMatch(/could not have informed the bid/)
    expect(lines[1]).toMatch(/MAE would have been 2,016 MW \(−26 MW, −1\.3%\)/)
    expect(lines[2]).toMatch(/last run of the day \(22:30\)/)
    expect(lines[2]).toMatch(/MAE 1,830 MW \(−10\.4%\)/)
    expect(lines[2]).toMatch(/bias moves from \+1,748 MW to \+1,603 MW/)
  })

  it('never claims a cause: it only describes the numbers', () => {
    expect(readSensitivity(data).join(' ')).not.toMatch(/because|due to|caused|reason/i)
  })

  it('omits the "last run" line when the next run is also the last', () => {
    const two = fx.sensitivity({
      points: data.points.filter((p) => p.cutoff_local !== '22:30'),
    })
    expect(readSensitivity(two)).toHaveLength(2)
  })

  it('says only what it knows when no later run exists', () => {
    const lateChoice = fx.sensitivity({
      selected_cutoff: '22:30',
      points: data.points.map((p) => ({ ...p, is_selected: p.cutoff_local === '22:30' })),
    })
    expect(readSensitivity(lateChoice)).toHaveLength(1)
  })

  it('returns nothing when the chosen cutoff has no valid MAE', () => {
    const empty = fx.sensitivity({
      points: data.points.map((p) => (p.is_selected ? { ...p, mae_mw: null } : p)),
    })
    expect(readSensitivity(empty)).toEqual([])
    expect(readSensitivity(fx.sensitivity({ points: [] }))).toEqual([])
  })
})
