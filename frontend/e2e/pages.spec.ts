import { expect, test } from '@playwright/test'
import { parseMW, trackErrors } from './helpers'

test.describe('Intervals', () => {
  test('filters to the data gaps and labels them', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/intervals?status=missing_any')
    await expect(page.getByText(/half-hours · delivery/)).toBeVisible()
    const badges = page.locator('tbody tr td:nth-child(8)')
    await expect(badges.first()).toBeVisible()
    for (const text of await badges.allInnerTexts()) expect(text).toMatch(/No forecast|No actual|No data/)
    expect(errors).toEqual([])
  })

  test('over-forecast filter only shows positive errors; under-forecast only negative', async ({ page }) => {
    await page.goto('/intervals?direction=over&status=matched')
    const errs = page.locator('tbody tr td:nth-child(6)')
    await expect(errs.first()).toBeVisible()
    for (const t of (await errs.allInnerTexts()).slice(0, 20)) expect(parseMW(t)).toBeGreaterThan(0)
    await page.goto('/intervals?direction=under&status=matched')
    await expect(errs.first()).toBeVisible()
    for (const t of (await errs.allInnerTexts()).slice(0, 20)) expect(parseMW(t)).toBeLessThan(0)
  })

  test('pagination moves through the full list and reports the range', async ({ page }) => {
    await page.goto('/intervals')
    await expect(page.getByText(/Showing\s*1–50/)).toBeVisible()
    await page.getByRole('button', { name: /Next/ }).click()
    await expect(page.getByText(/Showing\s*51–100/)).toBeVisible()
    await expect(page).toHaveURL(/page=2/)
  })

  test('sorting by a header toggles direction and survives a reload (URL state)', async ({ page }) => {
    await page.goto('/intervals?sort_by=forecast&sort_dir=desc&status=matched')
    const col = page.locator('tbody tr td:nth-child(4)')
    await expect(col.first()).toBeVisible()
    let values = (await col.allInnerTexts()).slice(0, 15).map(parseMW)
    expect(values).toEqual([...values].sort((a, b) => b - a))
    await page.getByRole('button', { name: /Forecast \(MW\)/ }).click()
    await expect(page).toHaveURL(/sort_dir=asc/)
    await page.reload()
    await expect(col.first()).toBeVisible()
    values = (await col.allInnerTexts()).slice(0, 15).map(parseMW)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  test('search narrows to a single half-hour', async ({ page }) => {
    await page.goto('/intervals')
    await page.getByLabel('Search date / time').fill('2026-01-15 08:30')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr').first()).toContainText('2026-01-15 08:30')
  })

  test('CSV export contains the filtered rows and states the sign convention in its header', async ({
    page,
  }) => {
    await page.goto('/intervals?status=matched&from=2026-01-05&to=2026-01-05')
    const href = await page.getByRole('link', { name: /Export CSV/ }).getAttribute('href')
    const res = await page.request.get(href as string)
    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toContain('text/csv')
    const lines = (await res.text()).trim().split('\n')
    expect(lines[0]).toContain('error_mw_forecast_minus_actual')
    expect(lines.length).toBeGreaterThan(40) // one decision day = 48 half-hours (less any gaps)
    expect(lines.length).toBeLessThanOrEqual(49)
  })
})

test.describe('Vintages', () => {
  test('exactly one publication is "used at decision time" and the table agrees with the summary line', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await page.goto('/vintages?start=2026-01-15T08:30:00Z')
    const table = page.getByRole('table', { name: /Every stored forecast publication/ })
    await expect(table).toBeVisible()
    await expect(table.getByText('Used at decision time', { exact: true })).toHaveCount(1)

    const used = await table.getByText('Used at decision time', { exact: true }).count()
    const superseded = await table.getByText('Eligible - superseded', { exact: true }).count()
    const after = await table.getByText('After cutoff', { exact: true }).count()
    const header = await page.getByText(/stored publications were available by then/).innerText()
    const [, eligibleFromHeader, totalFromHeader] = /(\d+) of (\d+) stored/.exec(header) ?? []
    expect(used + superseded).toBe(Number(eligibleFromHeader))
    expect(used + superseded + after).toBe(Number(totalFromHeader))
    expect(errors).toEqual([])
  })

  test('a half-hour inside a forecast hour says which hour it is scored against', async ({ page }) => {
    // Forecasts are hourly (like the live WINDFOR feed): 08:30 is held from the 08:00 forecast, 09:00 is not.
    await page.goto('/vintages?start=2026-01-15T08:30:00Z')
    const note = page.getByTestId('held-forecast-note')
    await expect(note).toContainText('forecast for the hour starting 08:00')
    await expect(note).toContainText('Nothing is interpolated')
    await page.goto('/vintages?start=2026-01-15T09:00:00Z')
    await expect(page.getByRole('heading', { name: /15 Jan 2026, 09:00 GMT/ })).toBeVisible()
    await expect(page.getByTestId('held-forecast-note')).toHaveCount(0)
  })

  test('every "After cutoff" row was published after the cutoff and every eligible row before it', async ({
    page,
  }) => {
    await page.goto('/vintages?start=2026-01-15T08:30:00Z')
    const rows = page.getByRole('table', { name: /Every stored forecast publication/ }).locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const row of await rows.all()) {
      const status = await row.locator('td:nth-child(5)').innerText()
      const relative = await row.locator('td:nth-child(4)').innerText()
      if (status.includes('After cutoff')) expect(relative).toMatch(/after cutoff/)
      else expect(relative).toMatch(/before cutoff|at the cutoff/)
    }
  })

  test('the picker and the previous/next buttons walk through half-hours', async ({ page }) => {
    await page.goto('/vintages?start=2026-01-15T08:30:00Z')
    await expect(page.getByRole('heading', { name: /15 Jan 2026, 08:30 GMT/ })).toBeVisible()
    await page.getByRole('button', { name: /Next half-hour/ }).click()
    await expect(page.getByRole('heading', { name: /15 Jan 2026, 09:00 GMT/ })).toBeVisible()
    await page.getByLabel('Half-hour starting').selectOption('12:30')
    await page.getByRole('button', { name: 'Show vintages' }).click()
    await expect(page.getByRole('heading', { name: /15 Jan 2026, 12:30 GMT/ })).toBeVisible()
  })

  test('an interval outside the data coverage is explained, not shown as an empty chart', async ({
    page,
  }) => {
    await page.goto('/vintages?start=2027-01-15T08:30:00Z')
    await expect(page.getByText('Nothing found')).toBeVisible()
    await expect(page.getByText(/No data for delivery date 2027-01-15/)).toBeVisible()
  })
})

test.describe('Methodology & routing', () => {
  test('documents the decision-time rule, both readings, metrics, quality and limits', async ({ page }) => {
    await page.goto('/methodology')
    for (const name of [
      'Methodology and data quality',
      'Which forecast counts: the decision-time rule',
      'Metric definitions',
      'Data quality report (from the last ingestion)',
      'Known limitations',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
    await expect(page.getByText(/Latest forecast now ≠ forecast at the cutoff/)).toBeVisible()
    await expect(page.getByTestId('hourly-forecast-explainer')).toContainText('60 minutes apart')
  })

  test('unknown routes show a friendly 404', async ({ page }) => {
    await page.goto('/definitely-not-a-page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('a shared URL restores the exact analysis selection', async ({ page }) => {
    await page.goto('/?basis=delivery_date&from=2026-01-05&to=2026-01-11&cutoff=09:50')
    await expect(page.getByLabel(/January.*means/i)).toHaveValue('delivery_date')
    await expect(page.getByLabel('Decision cutoff (UK time, day before delivery)')).toHaveValue('09:50')
    await expect(page.getByText(/Decisions 4 Jan – 10 Jan → delivery 5 Jan – 11 Jan/)).toBeVisible()
  })
})
