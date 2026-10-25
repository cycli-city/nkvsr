import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures'
import { mockApi, renderApp, requestsTo } from '../test/utils'

describe('Vintages page', () => {
  it('marks the forecast used at decision time and the hindsight revision', async () => {
    const spy = mockApi()
    renderApp('/vintages?start=2026-01-15T08:30:00Z')
    expect(await screen.findByText('Used at decision time', { selector: 'dt' })).toBeInTheDocument()
    expect(requestsTo(spy, '/api/forecast-vintages')[0]).toEqual({
      start: '2026-01-15T08:30:00Z',
      cutoff: '09:20',
    })
    const table = screen.getByRole('table', { name: /Every stored forecast publication/ })
    expect(within(table).getByText('Used at decision time')).toBeInTheDocument()
    expect(within(table).getByText('After cutoff')).toBeInTheDocument()
    expect(within(table).getByText('Eligible - superseded')).toBeInTheDocument()
    expect(screen.getByText('Latest published (hindsight)')).toBeInTheDocument()
    expect(screen.getByText('+322 MW')).toBeInTheDocument() // error at decision time
  })

  it('says which forecast hour an off-hour half-hour is scored against', async () => {
    mockApi({
      '/api/forecast-vintages': fx.vintages({
        forecast_for_time: '2026-01-15T08:00:00Z',
        forecast_block_minutes: 60,
        forecast_alignment_note: 'held',
      }),
    })
    renderApp('/vintages?start=2026-01-15T08:30:00Z')
    const note = await screen.findByTestId('held-forecast-note')
    expect(note).toHaveTextContent('Hourly forecast applied to this half-hour')
    expect(note).toHaveTextContent(
      /08:30 half-hour is scored against the forecast for the hour starting 08:00/,
    )
    expect(note).toHaveTextContent('Nothing is interpolated')
  })

  it('shows no hourly note for a half-hour that has a forecast of its own', async () => {
    mockApi()
    renderApp('/vintages?start=2026-01-15T08:30:00Z')
    await screen.findByText('Used at decision time', { selector: 'dt' })
    expect(screen.queryByTestId('held-forecast-note')).not.toBeInTheDocument()
  })

  it('explains when no vintage history exists instead of drawing an empty chart', async () => {
    mockApi({
      '/api/forecast-vintages': fx.vintages({
        selected: null,
        latest: null,
        n_vintages: 0,
        n_eligible: 0,
        vintages: [],
        explanation:
          'No WINDFOR publication is stored for this delivery interval. Nothing has been estimated.',
      }),
    })
    renderApp('/vintages?start=2026-01-15T08:30:00Z')
    expect(await screen.findByText('No vintage history to show')).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been estimated/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Every stored forecast publication/ })).not.toBeInTheDocument()
  })

  it('asks the user to pick an interval when none is selected, and suggests the largest miss', async () => {
    mockApi()
    renderApp('/vintages')
    expect(await screen.findByText(/Choose a delivery date and half-hour above/)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /2026-01-15 08:30 \(\+322 MW\)/ })).toBeInTheDocument()
  })
})
