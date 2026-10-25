// UAT suite: Timeline: tooltip, hindsight toggle, zoom handles, click-through to vintages.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L

;(async () => {
  const { browser, page, problems } = await L.launch()

  L.setSection('E. Timeline')
  await L.openDashboard(page)
  const tl = page.locator('section[aria-labelledby="timeline-h"]')
  await t('E01', 'Chart draws actual + forecast lines; footnote says "No gaps"', async () => {
    ok((await tl.locator('.recharts-line path').count()) >= 2, 'expected ≥2 line paths')
    await tl.getByText('No gaps in this selection.').waitFor()
  })
  await t(
    'E02',
    'Hover tooltip shows time, actual, forecast at cutoff, error with direction, and publication time',
    async () => {
      const wrap = tl.locator('.recharts-wrapper')
      await wrap.scrollIntoViewIfNeeded()
      const box = await wrap.boundingBox()
      await page.mouse.move(box.x + box.width * 0.4, box.y + 150)
      await page.mouse.move(box.x + box.width * 0.41, box.y + 150)
      const tip = tl.locator('.recharts-tooltip-wrapper')
      await tip.getByText('Forecast at cutoff').waitFor()
      const txt = await tip.innerText()
      ok(
        /Actual/.test(txt) && /Error \(F − A\)/.test(txt) && /Published/.test(txt),
        txt.replace(/\n/g, ' | '),
      )
      return txt.replace(/\n/g, ' | ').slice(0, 150)
    },
  )
  await t(
    'E03',
    'Hindsight toggle is opt-in: unchecked by default, adds a clearly-labelled dashed series when checked, removes it again',
    async () => {
      const box = tl.getByLabel(/Compare with latest published forecast/)
      ok(!(await box.isChecked()), 'should default to off')
      eq(await tl.getByText(/hindsight, not usable/).count(), 0)
      await box.check()
      await tl
        .getByText(/hindsight, not usable/)
        .first()
        .waitFor()
      await box.uncheck()
      await page.waitForFunction(
        () =>
          !/hindsight, not usable/.test(document.querySelector('[aria-labelledby="timeline-h"]').textContent),
      )
    },
  )
  await t(
    'E04',
    'Zoom handles (Brush): two handles under the chart; dragging one zooms the plot and does NOT navigate away (regression)',
    async () => {
      const line = tl.locator('.recharts-line path').first()
      const handles = tl.locator('.recharts-brush-traveller')
      eq(await handles.count(), 2, 'brush handles')
      const before = await line.getAttribute('d')
      const first = await handles.nth(0).boundingBox()
      await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
      await page.mouse.down()
      await page.mouse.move(first.x + 300, first.y + first.height / 2, { steps: 10 })
      await page.mouse.up()
      await until(async () => ok((await line.getAttribute('d')) !== before, 'plot did not zoom'))
      await page.waitForTimeout(500)
      ok(!/\/vintages/.test(page.url()), `navigated away: ${page.url()}`)
      await tl.getByText('Wind generation timeline').first().waitFor()
    },
  )
  await t('E05', 'Clicking a point opens the vintages of that exact half-hour', async () => {
    await L.openDashboard(page)
    const wrap = tl.locator('.recharts-wrapper')
    await wrap.scrollIntoViewIfNeeded()
    const box = await wrap.boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + 150)
    await page.mouse.move(box.x + box.width * 0.51, box.y + 150)
    await page.mouse.click(box.x + box.width * 0.51, box.y + 150)
    await page.waitForURL(/\/vintages\?.*start=/)
    await page.getByText('Used at decision time', { exact: true }).first().waitFor()
  })

  L.setSection('Z. Cleanliness')
  await t(
    'Z04',
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
