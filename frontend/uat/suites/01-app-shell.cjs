// UAT suite: App shell: title, provenance bar, footer, skip link, primary navigation.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L
const fs = require('fs')

;(async () => {
  const { browser, page, problems } = await L.launch()

  L.setSection('A. App shell')
  await t(
    'A01',
    'Dashboard loads on a hard URL with real (non-synthetic) data and a page title',
    async () => {
      await L.openDashboard(page)
      ok((await page.title()).length > 3, 'empty title')
      eq(await page.getByText('SYNTHETIC DEVELOPMENT DATA').count(), 0, 'synthetic banner')
      return `title="${await page.title()}"`
    },
  )
  await t('A02', 'Brand + tagline are shown', async () => {
    await page.getByText('WindScope UK', { exact: true }).first().waitFor()
    await page.getByText('Day-ahead wind forecast analytics').waitFor()
  })
  await t(
    'A03',
    'Provenance bar: source, FUELHH + WINDFOR links to Elexon docs, unit, refresh time',
    async () => {
      const bar = page.locator('main').locator('xpath=preceding::div[contains(@class,"border-b")][1]')
      const hrefs = await page
        .locator('a[href*="bmrs.elexon.co.uk"]')
        .evaluateAll((as) => as.map((a) => a.href))
      ok(
        hrefs.some((h) => /FUELHH/.test(h)) && hrefs.some((h) => /WINDFOR/.test(h)),
        `links: ${hrefs.join(',')}`,
      )
      await page.getByText(/Last successful refresh/).waitFor()
      await page.getByText(/national WIND/).waitFor()
      return hrefs.join(' ')
    },
  )
  await t('A04', 'Data-quality note link jumps to Methodology #quality', async () => {
    const link = page.getByRole('link', { name: /data-quality note/ })
    if ((await link.count()) === 0) return 'no data-quality notes on this snapshot (nothing to link)'
    await link.click()
    await page.waitForURL(/\/methodology.*#quality/)
    await page.goBack()
    await L.settle(page)
  })
  await t(
    'A05',
    'Footer: licence link opens Elexon licence in a new tab; scope disclaimer present',
    async () => {
      const a = page.getByRole('link', { name: 'BMRS data licence' })
      ok((await a.getAttribute('href')).includes('elexon.co.uk'), 'licence href')
      eq(await a.getAttribute('target'), '_blank')
      eq(await a.getAttribute('rel'), 'noreferrer')
      await page.getByText(/not.*the\s+utility.s net procurement requirement/s).waitFor()
    },
  )
  await t('A06', 'Skip link is the first tab stop and moves focus to main content', async () => {
    await page.reload()
    await L.openDashboard(page)
    await page.keyboard.press('Tab')
    await page.getByRole('link', { name: 'Skip to main content' }).waitFor({ state: 'visible' })
    await page.keyboard.press('Enter')
    ok(/#main$/.test(page.url()), page.url())
  })
  await t(
    'A07',
    'Primary nav: Dashboard / Intervals / Vintages / Methodology each navigate and mark the active page',
    async () => {
      for (const [name, re] of [
        ['Intervals', /\/intervals/],
        ['Vintages', /\/vintages/],
        ['Methodology', /\/methodology/],
        ['Dashboard', /\/(\?.*)?$/],
      ]) {
        await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name }).click()
        await page.waitForURL(re)
        await until(async () =>
          eq(
            await page
              .getByRole('navigation', { name: 'Primary' })
              .getByRole('link', { name })
              .getAttribute('aria-current'),
            'page',
            `${name} aria-current`,
          ),
        )
        await L.settle(page, 200)
      }
    },
  )

  L.setSection('Z. Cleanliness')
  await t(
    'Z01',
    'No console errors, failed requests, HTTP >= 400 or Content-Security-Policy violations in this suite',
    async () => {
      const csp = await page.evaluate(() => window.__csp)
      ok(
        problems.length === 0 && csp.length === 0,
        `${problems.join(' | ')} ${csp.join(' | ')}`.slice(0, 400),
      )
    },
  )

  await browser.close()
  L.report()
})().catch((e) => {
  console.error('SCRIPT ERROR', e)
  process.exit(1)
})
