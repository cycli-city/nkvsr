import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as fx from './test/fixtures'
import { apiError, inSummary, kpi, mockApi, renderApp, requestsTo } from './test/utils'

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

describe('Decision timing panel', () => {
  it('shows the accuracy at each publication run, marks the chosen cutoff, and reads the numbers back', async () => {
    const spy = mockApi()
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Does the decision time matter?' })).toBeInTheDocument()
    const table = await screen.findByRole('table', {
      name: /Accuracy of the forecast available at each decision cutoff/,
    })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + 5) // header + 4 runs + the chosen cutoff
    const yours = rows.find((r) => within(r).queryByText('Yours'))!
    expect(within(yours).getByText('09:20')).toBeInTheDocument()
    expect(within(table).getAllByText('Hindsight only')).toHaveLength(2) // 09:30 and 22:30 came after the cutoff
    expect(await screen.findByTestId('sensitivity-reading')).toHaveTextContent(/came from the 07:30 run/)
    expect(requestsTo(spy, '/api/cutoff-sensitivity')[0]).toEqual({
      basis: 'decision_date',
      from: '2026-01-01',
      to: '2026-01-31',
      cutoff: '09:20',
    })
  })

  it('is listed in the "jump to" navigation', async () => {
    mockApi()
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Decision timing' })).toHaveAttribute('href', '#timing-h')
  })

  it('does not ask the server for it until the reader scrolls near it', async () => {
    let reveal: (() => void) | undefined
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const spy = mockApi()
    renderApp('/')
    await inSummary()
    expect(await screen.findByRole('heading', { name: 'Decision brief' })).toBeInTheDocument()
    expect(requestsTo(spy, '/api/summary').length).toBeGreaterThan(0)
    expect(requestsTo(spy, '/api/cutoff-sensitivity')).toHaveLength(0)

    act(() => reveal?.())
    expect(
      await screen.findByRole('table', {
        name: /Accuracy of the forecast available at each decision cutoff/,
      }),
    ).toBeInTheDocument()
    expect(requestsTo(spy, '/api/cutoff-sensitivity')).toHaveLength(1)
  })

  it('a failure here is contained: the rest of the dashboard still renders', async () => {
    mockApi({ '/api/cutoff-sensitivity': apiError(503, 'data_unavailable', 'No dataset loaded') })
    renderApp('/')
    expect(await (await inSummary()).findByText('1,487')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Forecast accuracy' })).toBeInTheDocument()
    expect(await screen.findAllByText(/No dataset loaded/)).not.toHaveLength(0)
  })

  it('explains when no cutoff has any matched interval', async () => {
    mockApi({
      '/api/cutoff-sensitivity': fx.sensitivity({
        points: fx.sensitivity().points.map((p) => ({ ...p, mae_mw: null, n: 0 })),
      }),
    })
    renderApp('/')
    expect(await screen.findByText('No matched intervals at any cutoff')).toBeInTheDocument()
  })
})

describe('Dashboard states', () => {
  it('explains that no data is loaded instead of showing empty charts', async () => {
    mockApi({
      '/api/metadata': fx.metadata({
        data_available: false,
        provenance: null,
        sources: [],
        load_error: 'No snapshot manifest at /data',
      }),
    })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: /No Elexon data is loaded yet/ })).toBeInTheDocument()
    expect(screen.getAllByText(/No snapshot manifest/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Executive summary' })).not.toBeInTheDocument()
  })

  it('reports an unreachable API with a retry action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    renderApp('/')
    expect(await screen.findByText("Can't reach the API")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('explains an invalid selection and offers a reset', async () => {
    mockApi({
      '/api/summary': apiError(
        422,
        'invalid_request',
        'Range 2025-12-01..2026-01-05 is outside the analysis window',
      ),
    })
    renderApp('/')
    expect(await screen.findByText("That selection isn't valid")).toBeInTheDocument()
    expect(screen.getByText(/outside the analysis window/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset selection' })).toBeInTheDocument()
  })

  it('shows an API error in one panel without taking down the rest of the page', async () => {
    mockApi({ '/api/accuracy': apiError(500, 'internal_error', 'An unexpected error occurred.') })
    renderApp('/')
    expect(await screen.findByText('The API reported an error')).toBeInTheDocument()
    expect(await kpi('975 MW')).toBeInTheDocument() // summary still rendered
    expect(await screen.findByRole('heading', { name: 'Wind generation timeline' })).toBeInTheDocument()
  })

  it('shows unavailable metrics as an em dash and a no-data status, never zero', async () => {
    mockApi({
      '/api/summary': fx.summary({
        coverage: {
          expected: 48,
          matched: 0,
          missing_forecast: 48,
          missing_actual: 0,
          missing_both: 0,
          coverage: 0,
        },
        data_status: {
          status: 'no_data',
          message: 'No interval has both a forecast and an actual.',
          sufficient_threshold: 0.98,
          partial_threshold: 0.9,
        },
        metrics: {
          n: 0,
          mae_mw: null,
          rmse_mw: null,
          bias_mw: null,
          wape: null,
          mean_forecast_mw: null,
          mean_actual_mw: null,
        },
        baselines: [
          {
            key: 'persistence',
            label: 'Persistence at cutoff',
            description: 'd',
            n: 0,
            mae_forecast_mw: null,
            mae_baseline_mw: null,
            skill: null,
          },
        ],
      }),
      '/api/accuracy': fx.accuracy({
        metrics: {
          n: 0,
          mae_mw: null,
          rmse_mw: null,
          bias_mw: null,
          wape: null,
          mean_forecast_mw: null,
          mean_actual_mw: null,
        },
      }),
    })
    renderApp('/')
    expect(await screen.findByText('No matched data')).toBeInTheDocument()
    expect(screen.queryByText('0 MW')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(await screen.findByText('No matched intervals to analyse')).toBeInTheDocument()
  })

  it('explains slow cold starts after a few seconds of waiting', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ) // never answers
    renderApp('/')
    expect(screen.queryByTestId('cold-start-hint')).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })
    expect(screen.getByTestId('cold-start-hint')).toHaveTextContent(
      /Free-tier hosting can take up to a minute/,
    )
  })
})

describe('Intervals page', () => {
  it('lists intervals with cutoff, publication time, signed error and a link to vintages', async () => {
    mockApi({
      '/api/intervals': fx.intervals([
        fx.row(),
        fx.row({
          start_time: '2026-01-15T09:00:00Z',
          local_label: '2026-01-15 09:00',
          forecast_mw: null,
          forecast_publish_time: null,
          error_mw: null,
          abs_error_mw: null,
          forecast_age_h: null,
          match_status: 'missing_forecast',
        }),
      ]),
    })
    renderApp('/intervals')
    expect(await screen.findByText('2026-01-15 08:30')).toBeInTheDocument()
    expect(screen.getByText('▲ +322')).toBeInTheDocument()
    expect(screen.getByText('No forecast')).toBeInTheDocument()
    const link = screen.getAllByRole('link', { name: /Open forecast vintages for 2026-01-15 08:30/ })[0]
    expect(link?.getAttribute('href')).toContain('/vintages?')
    expect(link?.getAttribute('href')).toContain('start=2026-01-15T08%3A30%3A00Z')
  })

  it('requests server-side sorting, filtering and paging from the URL state', async () => {
    const spy = mockApi({ '/api/intervals': fx.intervals([fx.row()], { total: 120, total_pages: 3 }) })
    const user = userEvent.setup()
    renderApp('/intervals?status=matched&direction=over&min_abs_error=1000&sort_by=abs_error&sort_dir=desc')
    await screen.findByText('2026-01-15 08:30')
    expect(requestsTo(spy, '/api/intervals')[0]).toMatchObject({
      status: 'matched',
      direction: 'over',
      min_abs_error: '1000',
      sort_by: 'abs_error',
      sort_dir: 'desc',
      page: '1',
      page_size: '50',
    })
    await user.click(screen.getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(requestsTo(spy, '/api/intervals').at(-1)?.page).toBe('2'))
  })

  it('toggles sort direction when the active column header is clicked', async () => {
    const spy = mockApi()
    const user = userEvent.setup()
    renderApp('/intervals?sort_by=abs_error&sort_dir=desc')
    await screen.findByText('2026-01-15 08:30')
    expect(screen.getByRole('columnheader', { name: /\|Error\|/ })).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: /\|Error\|/ }))
    await waitFor(() =>
      expect(requestsTo(spy, '/api/intervals').at(-1)).toMatchObject({
        sort_by: 'abs_error',
        sort_dir: 'asc',
      }),
    )
  })

  it('debounces free-text search into a single request', async () => {
    const spy = mockApi()
    const user = userEvent.setup()
    renderApp('/intervals')
    await screen.findByText('2026-01-15 08:30')
    const before = requestsTo(spy, '/api/intervals').length
    await user.type(screen.getByLabelText('Search date / time'), '08:30')
    await waitFor(() => expect(requestsTo(spy, '/api/intervals').at(-1)?.q).toBe('08:30'))
    expect(requestsTo(spy, '/api/intervals').length - before).toBe(1)
  })

  it('shows a helpful empty state with a way out when filters match nothing', async () => {
    mockApi({ '/api/intervals': fx.intervals([], { total: 0 }) })
    renderApp('/intervals?min_abs_error=999999')
    expect(await screen.findByText('No intervals match these filters')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0)
  })

  it('offers a CSV export of the filtered view', async () => {
    mockApi()
    renderApp('/intervals?status=missing_any')
    const link = await screen.findByRole('link', { name: /Export CSV/ })
    expect(link.getAttribute('href')).toContain('/api/intervals/export?')
    expect(link.getAttribute('href')).toContain('status=missing_any')
  })
})

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

describe('Methodology page', () => {
  it('documents the decision-time rule, the two interpretations and the limits', async () => {
    mockApi({
      '/api/metadata': fx.metadata({
        warnings: ['FUELHH: 2 of 100 rows dropped (bad_generation=2).'],
        quality: {
          actuals: { rows_in: 100, rows_kept: 98, dropped: { bad_generation: 2 } },
          forecast_profile: {
            start_resolution_minutes: 30,
            distinct_publish_times: 60,
            publish_cadence_minutes_median: 60,
            lead_time_hours_median: 24,
            lead_time_hours_max: 60,
          },
        },
      }),
    })
    renderApp('/methodology')
    expect(await screen.findByRole('heading', { name: 'Methodology and data quality' })).toBeInTheDocument()
    expect(screen.getByText('Which forecast counts: the decision-time rule')).toBeInTheDocument()
    expect(screen.getByText(/Latest forecast now ≠ forecast at the cutoff/)).toBeInTheDocument()
    const readings = within(screen.getByRole('table'))
    expect(readings.getByText('Decisions made in January 2026')).toBeInTheDocument()
    expect(readings.getByText('Deliveries in January 2026')).toBeInTheDocument()
    expect(screen.getAllByText(/error = forecast − actual/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Scope warning/)).toBeInTheDocument()
    expect(screen.getByText(/FUELHH: 2 of 100 rows dropped/)).toBeInTheDocument()
    expect(screen.getByText('Known limitations')).toBeInTheDocument()
  })
})

describe('Methodology page: forecast resolution', () => {
  const hourlyQuality = {
    forecast_profile: {
      start_resolution_minutes: 60,
      distinct_publish_times: 272,
      publish_cadence_minutes_median: 180,
      lead_time_hours_median: 21.5,
      lead_time_hours_max: 66.5,
    },
  }

  it('explains the hold rule for an hourly forecast grid', async () => {
    mockApi({ '/api/metadata': fx.metadata({ quality: hourlyQuality, forecast_alignment: 'hold' }) })
    renderApp('/methodology')
    const box = await screen.findByTestId('hourly-forecast-explainer')
    expect(box).toHaveTextContent('60 minutes apart')
    expect(box).toHaveTextContent(/applied unchanged to both half-hours/)
    expect(box).toHaveTextContent(/never uses the next hour/)
  })

  it('explains that exact matching leaves the other half-hours missing', async () => {
    mockApi({ '/api/metadata': fx.metadata({ quality: hourlyQuality, forecast_alignment: 'exact' }) })
    renderApp('/methodology')
    const box = await screen.findByTestId('hourly-forecast-explainer')
    expect(box).toHaveTextContent(/exact matching/)
    expect(box).toHaveTextContent(/reported as missing, never\s+filled/)
  })

  it('omits the explainer when the forecast grid is half-hourly', async () => {
    mockApi({
      '/api/metadata': fx.metadata({
        quality: { forecast_profile: { start_resolution_minutes: 30 } },
      }),
    })
    renderApp('/methodology')
    await screen.findByRole('heading', { name: 'Methodology and data quality' })
    expect(screen.queryByTestId('hourly-forecast-explainer')).not.toBeInTheDocument()
  })
})

describe('routing', () => {
  it('shows a not-found page for unknown routes', async () => {
    mockApi()
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
