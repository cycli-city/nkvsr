import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures'
import { mockApi, renderApp } from '../test/utils'

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
