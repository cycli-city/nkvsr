import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as fx from '../../test/fixtures'
import { apiError, inSummary, mockApi, renderApp, requestsTo } from '../../test/utils'

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
