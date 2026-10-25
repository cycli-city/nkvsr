import { expect, test } from '@playwright/test'
import { openDashboard } from './helpers'

declare global {
  interface Window {
    __cspViolations?: string[]
  }
}

test.describe('Security headers and Content-Security-Policy', () => {
  test('the app is served with a strict CSP, Permissions-Policy and isolation headers', async ({
    request,
  }) => {
    const headers = (await request.get('/')).headers()
    const csp = headers['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/unsafe-(inline|eval)/)
    expect(headers['permissions-policy']).toContain('geolocation=()')
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  })

  test('every page, chart, tooltip and drill-down works under the CSP without a single violation', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        ;(window.__cspViolations ??= []).push(`${e.violatedDirective} blocked ${e.blockedURI || 'inline'}`)
      })
    })
    const violations: string[] = []
    const consoleErrors: string[] = []
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
    const collect = async () =>
      violations.push(...((await page.evaluate(() => window.__cspViolations)) ?? []))

    await openDashboard(page)
    for (const chart of await page.locator('.recharts-wrapper').all()) {
      await chart.scrollIntoViewIfNeeded()
      const box = await chart.boundingBox()
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2) // tooltips render
    }
    await collect()

    for (const path of ['/intervals', '/vintages?start=2026-01-15T08:30:00Z', '/methodology']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page
        .locator('.recharts-wrapper')
        .first()
        .hover({ timeout: 1500 })
        .catch(() => undefined)
      await collect()
    }

    expect(violations, `CSP blocked something the app needs: ${violations.join(' | ')}`).toEqual([])
    expect(consoleErrors.filter((m) => /content security policy|refused to/i.test(m))).toEqual([])
  })
})
