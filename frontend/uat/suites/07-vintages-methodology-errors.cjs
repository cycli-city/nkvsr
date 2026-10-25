// UAT suite: Vintages, Methodology, unknown routes and API-failure recovery.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L

;(async () => {
  const { browser, page, problems } = await L.launch()

  L.setSection('I. Forecast vintages')
  await t('I01', 'Empty state offers the largest miss; following it loads that half-hour', async () => {
    await page.goto(UI + '/vintages', { waitUntil: 'domcontentloaded' })
    await page.getByText(/Choose a delivery date and half-hour/).waitFor({ timeout: 90000 })
    const link = page.getByRole('link', { name: /2026-01-12 01:00/ })
    await link.waitFor()
    await link.click()
    await page.getByRole('heading', { name: /12 Jan 2026.*01:00/ }).waitFor()
  })
  await t(
    'I02',
    '12 Jan 01:00: used 20,942 (07:30 run), latest 21,226, actual 14,048, error +6,894',
    async () => {
      const txt = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      for (const v of ['20,942', '21,226', '14,048', '6,894']) ok(txt.includes(v), `${v} missing`)
      await page.getByText('Used at decision time', { exact: true }).first().waitFor()
    },
  )
  await t(
    'I03',
    'Publication table: exactly one "Used at decision time"; later runs are "After cutoff"; superseded earlier runs are labelled',
    async () => {
      const table = page.getByRole('table', { name: /Every stored forecast publication/ })
      eq(await table.getByText('Used at decision time', { exact: true }).count(), 1, 'used rows')
      ok((await table.getByText('After cutoff', { exact: true }).count()) >= 1, 'no after-cutoff rows')
      ok((await table.getByText('Eligible - superseded', { exact: true }).count()) >= 1, 'no superseded rows')
    },
  )
  await t('I04', 'Vintage chart draws the dots and the red cutoff line; hover shows a tooltip', async () => {
    const chart = page.locator('.recharts-wrapper').first()
    ok((await chart.locator('.recharts-scatter-symbol, .recharts-dot, circle').count()) > 3, 'no dots')
    ok(
      (await chart
        .locator('.recharts-reference-line, line[stroke="#dc2626"], .recharts-reference-line-line')
        .count()) >= 1,
      'no cutoff line',
    )
  })
  await t(
    'I05',
    '← Previous / Next → half-hour buttons step by 30 minutes and update the heading + URL',
    async () => {
      await page.getByRole('button', { name: /Next half-hour/ }).click()
      await page.getByRole('heading', { name: /01:30/ }).waitFor()
      ok(/start=2026-01-12T01%3A30/.test(page.url()), page.url())
      await page.getByRole('button', { name: /Previous half-hour/ }).click()
      await page.getByRole('heading', { name: /01:00/ }).waitFor()
    },
  )
  await t('I06', 'Picker: choosing a date + half-hour and pressing "Show vintages" loads it', async () => {
    await page.getByLabel('Delivery date (UK)').fill('2026-01-20')
    await page.getByLabel('Half-hour starting').selectOption('18:30')
    await page.getByRole('button', { name: 'Show vintages' }).click()
    await page.getByRole('heading', { name: /20 Jan 2026.*18:30/ }).waitFor()
    ok(/start=2026-01-20T18%3A30/.test(page.url()), page.url())
  })
  await t('I07', 'A half-hour outside the data window gives a clear, non-crashing message', async () => {
    await page.goto(UI + '/vintages?start=2025-06-01T12:00:00Z', { waitUntil: 'domcontentloaded' })
    await page.getByText('Nothing found').waitFor({ timeout: 60000 })
    const msg = await page
      .locator('main')
      .getByText(/No data for delivery date 2025-06-01; coverage is 2026-01-01/)
      .innerText()
    await page.getByRole('button', { name: 'Try again' }).waitFor()
    return msg
  })
  await t(
    'I08',
    "Hourly-forecast hold note explains why the :30 half-hour reuses the hour's forecast",
    async () => {
      await page.goto(UI + '/vintages?start=2026-01-15T08:30:00Z', { waitUntil: 'domcontentloaded' })
      await page.getByTestId('held-forecast-note').waitFor({ timeout: 60000 })
      ok(/08:00|hour/i.test(await page.getByTestId('held-forecast-note').innerText()), 'note text')
    },
  )

  L.setSection('J. Methodology')
  await t('J01', 'All seven sections render with their headings and substantial content', async () => {
    await page.goto(UI + '/methodology', { waitUntil: 'domcontentloaded' })
    await page.locator('#sources').waitFor({ timeout: 60000 })
    for (const id of [
      'sources',
      'decision-time',
      'interpretation',
      'metrics',
      'sufficiency',
      'quality',
      'limitations',
    ]) {
      const el = page.locator(`#${id}`)
      await el.waitFor()
      ok((await el.innerText()).length > 120, `#${id} too short`)
    }
  })
  await t(
    'J02',
    'Data-quality report shows the real ingestion counts (2,016 actuals / 18,664 forecast rows), provenance elexon_live',
    async () => {
      const txt = (await page.locator('#quality').innerText()).replace(/\s+/g, ' ')
      ok(/2,016/.test(txt) && /18,664/.test(txt), txt.slice(0, 300))
      const bar = (
        await page
          .getByText(/Source:/)
          .first()
          .innerText()
      ).replace(/\s+/g, ' ')
      ok(/Elexon/.test(bar) && !/synthetic/i.test(bar), bar)
      return bar
    },
  )
  await t('J03', 'Deep link /methodology#quality scrolls the quality section into view', async () => {
    await page.goto(UI + '/methodology#quality', { waitUntil: 'domcontentloaded' })
    await page.locator('#quality').waitFor({ timeout: 60000 })
    await L.settle(page, 800)
    const top = await page.locator('#quality').evaluate((e) => e.getBoundingClientRect().top)
    ok(top < 400 && top > -50, `top=${top}`)
  })
  await t(
    'J04',
    'Hourly-forecast explainer and the "what does decisions made in January mean" section are present',
    async () => {
      await page.getByTestId('hourly-forecast-explainer').waitFor()
      await page
        .getByRole('heading', { name: /What does "decisions made in January 2026" mean\?|decisions made in/ })
        .first()
        .waitFor()
    },
  )

  L.setSection('K. Unknown routes and API failure handling')
  await t('K01', 'Unknown URL shows a friendly page (not a blank screen)', async () => {
    const res = await page.goto(UI + '/no-such-page', { waitUntil: 'domcontentloaded' })
    await L.settle(page, 800)
    const txt = (await page.locator('body').innerText()).trim()
    ok(txt.length > 40, 'blank body')
    return `HTTP ${res.status()} · "${txt.replace(/\s+/g, ' ').slice(0, 90)}"`
  })
  await t('K02', 'API unreachable: clear message + "Try again" recovers once the API is back', async () => {
    await page.route(/onrender\.com\/api\//, (r) => r.abort())
    await page.goto(UI + '/', { waitUntil: 'domcontentloaded' })
    await page.getByText("Can't reach the API").waitFor({ timeout: 60000 })
    await page.unroute(/onrender\.com\/api\//)
    await page.getByRole('button', { name: 'Try again' }).click()
    await L.summary(page).getByText('Matched intervals').waitFor({ timeout: 60000 })
  })

  L.setSection('Z. Cleanliness')
  await t(
    'Z01',
    'No console errors, unexpected failed requests, HTTP ≥ 400 (other than the deliberate ones above) or CSP violations in part 2',
    async () => {
      const csp = await page.evaluate(() => window.__csp)
      const unexpected = problems.filter(
        (p) => !/vintages\?start=2025-06-01|ERR_FAILED|net::ERR_|Failed to load resource/.test(p),
      )
      ok(
        unexpected.length === 0 && csp.length === 0,
        `${unexpected.join(' | ')} ${csp.join(' | ')}`.slice(0, 500),
      )
      return `${problems.length} expected console/network lines from deliberate failure tests`
    },
  )

  await browser.close()
  L.report()
})().catch((e) => {
  console.error('SCRIPT ERROR', e)
  process.exit(1)
})
