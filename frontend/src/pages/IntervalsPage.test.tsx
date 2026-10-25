import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as fx from '../test/fixtures'
import { mockApi, renderApp, requestsTo } from '../test/utils'

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
