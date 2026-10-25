import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openDashboard, summary } from './helpers'

const ERROR_ENVELOPE = (code: string, message: string) =>
  JSON.stringify({ error: { code, message, details: null } })

test.describe('Resilience', () => {
  test('an unreachable API is explained and the page recovers on retry', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort())
    await page.goto('/')
    await expect(page.getByText("Can't reach the API")).toBeVisible({ timeout: 20_000 })
    await page.unroute('**/api/**')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(summary(page).getByText('Matched intervals')).toBeVisible()
  })

  test('one failing endpoint degrades only its own panel', async ({ page }) => {
    await page.route('**/api/accuracy**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: ERROR_ENVELOPE('internal_error', 'An unexpected error occurred.'),
      }),
    )
    await page.goto('/')
    await expect(page.getByText('The API reported an error')).toBeVisible()
    await expect(summary(page).getByText('Matched intervals')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Wind generation timeline' })).toBeVisible()
  })

  test('an invalid selection from a hand-edited URL is explained with a way back', async ({ page }) => {
    await page.goto('/?from=2025-06-01&to=2025-06-07')
    await expect(page.getByText("That selection isn't valid").first()).toBeVisible()
    await page.getByRole('button', { name: 'Reset selection' }).first().click()
    await expect(summary(page).getByText('Matched intervals')).toBeVisible()
    await expect(page).not.toHaveURL(/2025-06/)
  })

  test('an API that has no dataset loaded shows the operator guidance, not empty charts', async ({
    page,
  }) => {
    await page.route('**/api/metadata', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      await route.fulfill({
        response: res,
        json: {
          ...body,
          data_available: false,
          provenance: null,
          sources: [],
          load_error: 'No snapshot manifest',
        },
      })
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /No Elexon data is loaded yet/ })).toBeVisible()
    await expect(page.getByText(/python -m app.cli ingest/)).toBeVisible()
  })

  test('a slow API (e.g. a sleeping free-tier host) triggers the cold-start explanation', async ({
    page,
  }) => {
    test.slow()
    await page.route('**/api/metadata', async (route) => {
      await new Promise((r) => setTimeout(r, 8_000))
      await route.continue()
    })
    await page.goto('/')
    await expect(page.getByTestId('cold-start-hint')).toBeVisible({ timeout: 9_000 })
    await expect(summary(page).getByText('Matched intervals')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Responsive layout', () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`no horizontal page overflow at ${width}px on any page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      for (const path of ['/', '/intervals', '/vintages?start=2026-01-15T08:30:00Z', '/methodology']) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        await page.waitForLoadState('networkidle')
        const [scroll, client] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ])
        expect(scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(client)
      }
    })
  }

  test('on a phone the selection controls collapse to one line and can be expanded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(page.getByLabel(/Decision cutoff/)).toBeHidden()
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByLabel(/Decision cutoff/)).toBeVisible()
  })
})

test.describe('Accessibility', () => {
  const pages = [
    ['dashboard', '/'],
    ['intervals', '/intervals?sort_by=abs_error&sort_dir=desc'],
    ['vintages', '/vintages?start=2026-01-15T08:30:00Z'],
    ['methodology', '/methodology'],
  ] as const

  for (const [name, path] of pages) {
    test(`${name}: no WCAG 2.1 A/AA violations (axe-core)`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main')).toBeVisible()
      await page.waitForTimeout(500) // let charts finish their first paint
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const summaryText = results.violations
        .map(
          (v) =>
            `${v.impact}: ${v.id} - ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0]?.target.join(' ')}`,
        )
        .join('\n')
      expect(results.violations, summaryText).toEqual([])
    })
  }

  test('keyboard: the skip link comes first and moves focus past the header', async ({ page }) => {
    await openDashboard(page)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main/)
  })

  test('keyboard: sortable column headers are buttons that sort on Enter', async ({ page }) => {
    await page.goto('/intervals?status=matched')
    const header = page.getByRole('button', { name: /Forecast \(MW\)/ })
    await header.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/sort_by=forecast/)
    await expect(page.getByRole('columnheader', { name: /Forecast \(MW\)/ })).toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    )
  })

  test('keyboard: info tips open with Enter and close with Escape', async ({ page }) => {
    await openDashboard(page)
    const tip = summary(page).getByRole('button', { name: 'About MAE', exact: true })
    await tip.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tooltip')).toContainText(/Mean absolute error/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })
})
