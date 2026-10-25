import { expect, test } from '@playwright/test'
import { kpiValue, openDashboard, parseMW, summary, trackErrors } from './helpers'

test.describe('Dashboard', () => {
  test('loads every section with real charts, no console errors, and labels the data as synthetic', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await openDashboard(page)

    await expect(page.getByRole('alert').first()).toContainText('SYNTHETIC DEVELOPMENT DATA')
    for (const name of [
      'Executive summary',
      'Decision brief',
      'Wind generation timeline',
      'Forecast accuracy',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
    // Charts actually drew lines/bars (not just empty frames).
    await expect(
      page.locator('section[aria-labelledby="timeline-h"] .recharts-line path').first(),
    ).toBeVisible()
    await expect(
      page.locator('section[aria-labelledby="accuracy-h"] .recharts-bar-rectangle').first(),
    ).toBeVisible()
    expect(parseMW(await kpiValue(page, 'MAE'))).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('tells the reader that hourly forecasts were applied to half-hourly actuals', async ({ page }) => {
    await openDashboard(page)
    const note = page.getByTestId('alignment-note')
    await expect(note).toContainText('Forecast resolution:')
    await expect(note).toContainText('both half-hours it covers')
    await expect(note).toContainText('interpolated')
  })

  test('shows the cutoff rule and sign convention near the numbers', async ({ page }) => {
    await openDashboard(page)
    await expect(
      page.getByText(/latest WINDFOR forecast published at or before 09:20 UK time/i).first(),
    ).toBeVisible()
    await expect(page.getByText(/Error = forecast − actual/).first()).toBeVisible()
  })

  test('changing the decision cutoff re-computes the analysis and is reflected in the URL', async ({
    page,
  }) => {
    await openDashboard(page)
    const before = await kpiValue(page, 'MAE')
    await page.getByLabel(/Decision cutoff/).selectOption('08:00')
    await expect(page).toHaveURL(/cutoff=08%3A00/)
    await expect(summary(page).getByText(/cutoff 08:00 UK time/)).toBeVisible()
    await expect.poll(() => kpiValue(page, 'MAE')).not.toBe(before)
  })

  test('both readings of "January" are available and never mixed', async ({ page }) => {
    await openDashboard(page)
    await expect(summary(page).getByText(/Decisions 1 Jan – 31 Jan → delivery 2 Jan – 1 Feb/)).toBeVisible()
    await page.getByLabel(/January.*means/i).selectOption('delivery_date')
    await expect(page).toHaveURL(/basis=delivery_date/)
    await expect(summary(page).getByText(/Decisions 31 Dec – 30 Jan → delivery 1 Jan – 31 Jan/)).toBeVisible()
  })

  test('a quick range narrows every number to that week', async ({ page }) => {
    await openDashboard(page)
    await page.getByRole('button', { name: /8 Jan – 14 Jan/ }).click()
    await expect(summary(page).getByText(/7 days/)).toBeVisible()
    const matched = Number((await kpiValue(page, 'Matched intervals')).replace(/,/g, ''))
    expect(matched).toBeLessThanOrEqual(7 * 48)
    expect(matched).toBeGreaterThan(7 * 48 * 0.9)
    await expect(page.getByRole('heading', { name: 'Forecast accuracy' })).toBeVisible()
  })

  test('clicking the MAE tile opens the intervals behind it, largest error first', async ({ page }) => {
    await openDashboard(page)
    await summary(page).getByRole('link', { name: /^MAE/ }).click()
    await expect(page).toHaveURL(/\/intervals\?.*sort_by=abs_error/)
    const abs = page.locator('tbody tr td:nth-child(7)')
    await expect(abs.first()).toBeVisible()
    const values = (await abs.allInnerTexts()).slice(0, 12).map(parseMW)
    expect(values).toEqual([...values].sort((a, b) => b - a))
    await expect(page.getByRole('columnheader', { name: /\|Error\|/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  test('clicking the timeline opens the forecast vintages of that half-hour', async ({ page }) => {
    await openDashboard(page)
    const chart = page.locator('section[aria-labelledby="timeline-h"] .recharts-wrapper')
    await chart.scrollIntoViewIfNeeded()
    // Recharts resolves the data point from the pointer position, so move first (as a user would).
    await chart.hover({ position: { x: 500, y: 150 } })
    await chart.click({ position: { x: 500, y: 150 } })
    await expect(page).toHaveURL(/\/vintages\?.*start=/)
    await expect(page.getByText('Used at decision time', { exact: true }).first()).toBeVisible()
  })

  test('the decision brief steps through decision dates', async ({ page }) => {
    await openDashboard(page)
    const brief = page.locator('section[aria-labelledby="brief-h"]')
    await expect(brief.getByText(/as at 09:20 on 31 Jan/)).toBeVisible()
    await brief.getByRole('button', { name: 'Previous decision date' }).click()
    await expect(brief.getByText(/as at 09:20 on 30 Jan/)).toBeVisible()
    await expect(brief.getByText(/Forecast set visible at 09:20/)).toBeVisible()
  })

  test('the hindsight comparison is opt-in and clearly labelled', async ({ page }) => {
    await openDashboard(page)
    const timeline = page.locator('section[aria-labelledby="timeline-h"]')
    await expect(timeline.getByText(/hindsight, not usable/)).toHaveCount(0)
    await timeline.getByLabel(/Compare with latest published forecast/).check()
    await expect(timeline.getByText(/hindsight, not usable/)).toBeVisible()
  })
})
