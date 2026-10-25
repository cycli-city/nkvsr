import { expect, type Page } from '@playwright/test'

/** Collects console errors / uncaught exceptions so a test can assert the page stayed clean. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

/**
 * Scroll to the bottom and let the network settle. Below-the-fold panels load only when they come into view, so
 * anything that measures or audits "the whole page" must reveal it first.
 */
export async function revealEverything(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 0))
}

export const summary = (page: Page) => page.getByRole('region', { name: 'Executive summary' })

export async function openDashboard(page: Page, search = '') {
  await page.goto(`/${search}`)
  await expect(summary(page).getByText('Matched intervals')).toBeVisible()
  await expect(summary(page).getByText(/Data sufficient|Partial data|Insufficient data/)).toBeVisible()
}

/** The big number inside a KPI tile, found by the tile's label. */
export async function kpiValue(page: Page, label: string | RegExp): Promise<string> {
  const tile = summary(page).locator('p', { hasText: label }).first().locator('xpath=..')
  return (await tile.locator('p').nth(1).innerText()).trim()
}

/** "−1,234 MW" / "+75 MW" / "▲ +322" -> number (typographic minus aware). */
export const parseMW = (text: string): number => Number(text.replace(/[^\d.−-]/g, '').replace('−', '-'))
