import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures'
import { inSummary, kpi, mockApi, renderApp, requestsTo } from '../test/utils'

describe('Dashboard', () => {
  it('renders headline KPIs, the decision brief, timeline and accuracy from API data', async () => {
    mockApi()
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Executive summary' })).toBeInTheDocument()
    const kpis = await inSummary()
    expect(await kpis.findByText('1,487')).toBeInTheDocument() // matched intervals
    expect(kpis.getByText('975 MW')).toBeInTheDocument() // MAE
    expect(kpis.getByText('1,232 MW')).toBeInTheDocument() // RMSE
    expect(kpis.getByText('+75 MW')).toBeInTheDocument() // bias, signed
    expect(kpis.getByText('99.9%')).toBeInTheDocument() // coverage
    expect(kpis.getByText('−60%')).toBeInTheDocument() // MAE vs persistence
    expect(kpis.getByText('Data sufficient')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Decision brief' })).toBeInTheDocument()
    expect(await screen.findByText(/Forecast set visible at 09:20/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Wind generation timeline' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Forecast accuracy' })).toBeInTheDocument()
    expect(await screen.findByText('Daily error trend')).toBeInTheDocument()
  })

  it('states how hourly forecasts were applied to half-hourly actuals, only when that is the case', async () => {
    const note =
      'Each forecast hour is applied unchanged to both half-hours it covers (nothing is interpolated).'
    mockApi({
      '/api/summary': fx.summary({
        analysis: fx.analysis({
          forecast_block_minutes: 60,
          forecast_alignment_note: note,
        }),
      }),
    })
    renderApp('/')
    const el = await screen.findByTestId('alignment-note')
    expect(el).toHaveTextContent('Forecast resolution:')
    expect(el).toHaveTextContent(/applied unchanged to both half-hours/)
  })

  it('shows no resolution note when forecasts already match the half-hourly actuals', async () => {
    mockApi()
    renderApp('/')
    await inSummary()
    await screen.findByText('Data sufficient')
    expect(screen.queryByTestId('alignment-note')).not.toBeInTheDocument()
  })

  it('shows source, units and last successful refresh', async () => {
    mockApi()
    renderApp('/')
    expect(await screen.findByText('Elexon BMRS (test)')).toBeInTheDocument()
    expect(screen.getByText(/Last successful refresh/)).toBeInTheDocument()
    expect(screen.queryByText(/SYNTHETIC DEVELOPMENT DATA/)).not.toBeInTheDocument()
  })

  it('shows an unmissable banner when the data is synthetic', async () => {
    mockApi({
      '/api/metadata': fx.metadata({
        provenance: fx.provenance({ provenance: 'synthetic_dev', is_synthetic: true }),
      }),
    })
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent(/SYNTHETIC DEVELOPMENT DATA.*NOT Elexon/)
  })

  it('shows a failed refresh honestly while still showing the previously retrieved data', async () => {
    mockApi({
      '/api/metadata': fx.metadata({
        refresh: {
          status: 'failed',
          last_attempt_at: '2026-10-25T15:00:00Z',
          last_success_at: '2026-10-25T14:00:00Z',
          error: 'HTTP 503',
        },
      }),
    })
    renderApp('/')
    expect(
      await screen.findByText(/Latest refresh attempt failed - showing previously retrieved data/),
    ).toBeInTheDocument()
    expect(await kpi('975 MW')).toBeInTheDocument()
  })

  it('sends the URL selection (basis, range, cutoff) to every analytics endpoint', async () => {
    const spy = mockApi()
    renderApp('/?basis=delivery_date&from=2026-01-05&to=2026-01-11&cutoff=09:50')
    await kpi('975 MW')
    const expected = { basis: 'delivery_date', from: '2026-01-05', to: '2026-01-11', cutoff: '09:50' }
    expect(requestsTo(spy, '/api/summary')[0]).toEqual(expected)
    expect(requestsTo(spy, '/api/timeseries')[0]).toEqual(expected)
    expect(requestsTo(spy, '/api/accuracy')[0]).toEqual(expected)
  })

  it('asks for the decision brief of the last decision date in range, at the selected cutoff', async () => {
    const spy = mockApi()
    renderApp('/?from=2026-01-05&to=2026-01-11&cutoff=09:50')
    await screen.findByText(/Forecast set visible/)
    expect(requestsTo(spy, '/api/decision-brief')[0]).toEqual({
      decision_date: '2026-01-11',
      cutoff: '09:50',
    })
  })

  it('maps the delivery basis to the previous decision date for the brief', async () => {
    const spy = mockApi()
    renderApp('/?basis=delivery_date&from=2026-01-05&to=2026-01-11')
    await screen.findByText(/Forecast set visible/)
    expect(requestsTo(spy, '/api/decision-brief')[0]?.decision_date).toBe('2026-01-10')
  })

  it('re-queries with the other interpretation when the user switches basis', async () => {
    const spy = mockApi()
    const user = userEvent.setup()
    renderApp('/?from=2026-01-05&to=2026-01-11')
    await (await inSummary()).findByText('975 MW')
    await user.selectOptions(screen.getByLabelText(/January.*means/i), 'delivery_date')
    await waitFor(() =>
      expect(requestsTo(spy, '/api/summary').some((r) => r.basis === 'delivery_date')).toBe(true),
    )
    const last = requestsTo(spy, '/api/summary').at(-1)
    // A decision-date range is never carried over to delivery dates: the full month default applies.
    expect(last).toEqual({ basis: 'delivery_date', from: '2026-01-01', to: '2026-01-31', cutoff: '09:20' })
  })

  it('updates the analysis when a quick range is chosen', async () => {
    const spy = mockApi()
    const user = userEvent.setup()
    renderApp('/')
    await (await inSummary()).findByText('975 MW')
    await user.click(screen.getByRole('button', { name: /8 Jan – 14 Jan/ }))
    await waitFor(() =>
      expect(requestsTo(spy, '/api/summary').at(-1)).toMatchObject({ from: '2026-01-08', to: '2026-01-14' }),
    )
  })

  it('makes the KPI tiles links into the observations behind them', async () => {
    mockApi()
    renderApp('/')
    const mae = (await kpi('975 MW')).closest('a')
    expect(mae).not.toBeNull()
    const href = new URL(mae?.getAttribute('href') ?? '', 'http://x')
    expect(href.pathname).toBe('/intervals')
    expect(href.searchParams.get('sort_by')).toBe('abs_error')
    expect(href.searchParams.get('sort_dir')).toBe('desc')
  })

  it('carries a non-default selection through navigation links', async () => {
    mockApi()
    renderApp('/?from=2026-01-05&to=2026-01-11&cutoff=09:50')
    await (await inSummary()).findByText('975 MW')
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const href = within(nav).getByRole('link', { name: 'Intervals' }).getAttribute('href') ?? ''
    expect(href).toContain('from=2026-01-05')
    expect(href).toContain('cutoff=09%3A50')
  })
})
