import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as fx from '../test/fixtures'
import { apiError, kpi, mockApi, renderApp } from '../test/utils'

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
