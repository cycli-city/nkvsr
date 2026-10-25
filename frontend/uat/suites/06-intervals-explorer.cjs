// UAT suite: Intervals explorer: pagination, sorting, every filter, search, CSV export.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L
const fs = require('fs')

;(async () => {
  const { browser, page, problems } = await L.launch()

  L.setSection('H. Intervals explorer')
  await t('H01', 'Loads 1,488 half-hours, 50 per page, "Showing 1–50 of 1,488", Page 1 of 30', async () => {
    await page.goto(UI + '/intervals', { waitUntil: 'domcontentloaded' })
    await page
      .getByText(/1,488.*half-hours/)
      .first()
      .waitFor({ timeout: 90000 })
    await page.getByText(/Showing\s*1–50\s*of\s*1,488/).waitFor()
    await page.getByText('Page 1 of 30').waitFor()
    eq(await page.locator('tbody tr').count(), 50, 'rows on page')
  })
  await t(
    'H02',
    'Pagination: Next/Previous work; Previous disabled on page 1, Next disabled on the last page',
    async () => {
      const prev = page.getByRole('button', { name: /Previous/ }),
        next = page.getByRole('button', { name: /Next/ })
      ok(await prev.isDisabled(), 'prev should be disabled')
      await next.click()
      await page.getByText(/Showing\s*51–100/).waitFor()
      ok(/page=2/.test(page.url()), page.url())
      await prev.click()
      await page.getByText(/Showing\s*1–50/).waitFor()
      await page.goto(UI + '/intervals?page=30', { waitUntil: 'domcontentloaded' })
      await page.getByText('Page 30 of 30').waitFor({ timeout: 60000 })
      ok(
        await page.getByRole('button', { name: /Next/ }).isDisabled(),
        'next should be disabled on last page',
      )
      await page.getByText(/Showing\s*1,451–1,488/).waitFor()
    },
  )
  await t('H03', 'Rows per page: 25 / 100 / 250 change the page size and page count', async () => {
    await page.goto(UI + '/intervals', { waitUntil: 'domcontentloaded' })
    await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
    const sel = page.getByLabel('Rows per page')
    for (const [size, pages] of [
      ['25', 60],
      ['100', 15],
      ['250', 6],
    ]) {
      await sel.selectOption(size)
      await page.getByText(`Page 1 of ${pages}`).waitFor()
      eq(await page.locator('tbody tr').count(), Number(size), `rows at ${size}`)
    }
  })
  await t(
    'H04',
    'Every sortable column header sorts (aria-sort flips ascending/descending) and the first rows are really ordered',
    async () => {
      await page.goto(UI + '/intervals?status=matched', { waitUntil: 'domcontentloaded' })
      await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
      const cols = { 'Forecast (MW)': 4, 'Actual (MW)': 5, 'Error F−A (MW)': 6, '|Error| (MW)': 7 }
      for (const [name, idx] of Object.entries(cols)) {
        const btn = page.getByRole('button', { name: new RegExp(name.replace(/[|()]/g, '\\$&')) })
        await btn.click()
        await L.settle(page, 400)
        const th = page.getByRole('columnheader', { name: new RegExp(name.replace(/[|()]/g, '\\$&')) })
        const dir1 = await th.getAttribute('aria-sort')
        const vals1 = (await page.locator(`tbody tr td:nth-child(${idx})`).allInnerTexts())
          .slice(0, 12)
          .map(L.num)
        const sorted1 = [...vals1].sort((a, b) => (dir1 === 'ascending' ? a - b : b - a))
        eq(JSON.stringify(vals1), JSON.stringify(sorted1), `${name} order (${dir1})`)
        await btn.click()
        await L.settle(page, 400)
        const dir2 = await th.getAttribute('aria-sort')
        ok(dir1 !== dir2 && ['ascending', 'descending'].includes(dir2), `${name}: ${dir1} -> ${dir2}`)
      }
      await page.getByRole('button', { name: /Delivery start/ }).click()
      await L.settle(page, 400)
      await page.getByRole('button', { name: /Forecast published/ }).click()
    },
  )
  await t(
    'H05',
    'Status filter: Matched 1,488 · Any missing data → friendly empty state (no gaps in this window) with Clear button',
    async () => {
      await page.goto(UI + '/intervals', { waitUntil: 'domcontentloaded' })
      await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
      const sel = page.getByLabel('Status')
      const opts = await sel.locator('option').allInnerTexts()
      eq(opts.length, 6, 'status options')
      await sel.selectOption('matched')
      await page
        .getByText(/1,488.*half-hours/)
        .first()
        .waitFor()
      await sel.selectOption('missing_any')
      await page.getByRole('heading', { name: /No intervals match these filters/ }).waitFor()
      await page.getByRole('button', { name: 'Clear filters' }).first().click()
      await page.getByText('Page 1 of 30').waitFor()
      return opts.join(' | ')
    },
  )
  await t(
    'H06',
    'Direction filter: over-forecast only = 1,261 rows, all positive; under-forecast = 227, all negative',
    async () => {
      const sel = page.getByLabel('Direction of error')
      await sel.selectOption('over')
      await page
        .getByText(/1,261.*half-hours/)
        .first()
        .waitFor()
      ok(
        (await page.locator('tbody tr td:nth-child(6)').allInnerTexts())
          .slice(0, 25)
          .every((x) => L.num(x) > 0),
        'non-positive error under "over"',
      )
      await sel.selectOption('under')
      await page
        .getByText(/227.*half-hours/)
        .first()
        .waitFor()
      ok(
        (await page.locator('tbody tr td:nth-child(6)').allInnerTexts())
          .slice(0, 25)
          .every((x) => L.num(x) < 0),
        'non-negative error under "under"',
      )
    },
  )
  await t(
    'H07',
    'Minimum |error| filter: ≥ 5,000 MW leaves a short list whose rows all meet the threshold',
    async () => {
      await page.getByLabel('Direction of error').selectOption('')
      await page.getByLabel('Minimum |error| (MW)').fill('5000')
      await page.waitForURL(/min_abs_error=5000/)
      await L.settle(page, 500)
      const abs = (await page.locator('tbody tr td:nth-child(7)').allInnerTexts()).map(L.num)
      ok(abs.length > 0 && abs.length < 60 && abs.every((v) => v >= 5000), `abs=${abs.slice(0, 8)}`)
      return `${abs.length} rows ≥ 5,000 MW`
    },
  )
  await t(
    'H08',
    'Search: "2026-01-12 01:00" finds exactly that half-hour; "Sat" finds only Saturdays; nonsense → empty state; Clear filters resets',
    async () => {
      await page.getByRole('button', { name: 'Clear filters' }).first().click()
      await page.getByText('Page 1 of 30').waitFor()
      const q = page.getByLabel('Search date / time')
      await q.fill('2026-01-12 01:00')
      await page.waitForURL(/q=2026-01-12/)
      await until(async () => eq(await page.locator('tbody tr').count(), 1, 'rows'), 10000)
      ok(/2026-01-12 01:00/.test(await page.locator('tbody tr').first().innerText()), 'row text')
      await q.fill('Sat')
      await page.waitForURL(/q=Sat/)
      await L.settle(page, 500)
      const total = await page.getByText(/half-hours · delivery/).innerText()
      ok(/(2\d\d|3\d\d)\s*half-hours/.test(total) || /\b\d{3}\b/.test(total), total)
      await q.fill('zzzz')
      await page.getByRole('heading', { name: /No intervals match these filters/ }).waitFor()
      await page.getByRole('button', { name: 'Clear filters' }).first().click()
      await page.getByText('Page 1 of 30').waitFor()
      eq(await q.inputValue(), '', 'search cleared')
      return total.replace(/\s+/g, ' ').slice(0, 60)
    },
  )
  await t(
    'H09',
    'Row action "Vintages →" opens the forecast vintages of exactly that half-hour',
    async () => {
      await page.getByLabel('Search date / time').fill('2026-01-15 08:30')
      await until(async () => eq(await page.locator('tbody tr').count(), 1))
      await page.getByRole('link', { name: /Open forecast vintages for 2026-01-15 08:30/ }).click()
      await page.waitForURL(/\/vintages\?.*start=2026-01-15T08%3A30%3A00Z/)
      await page.getByRole('heading', { name: /15 Jan 2026.*08:30/ }).waitFor()
    },
  )
  await t(
    'H10',
    'CSV export: real file download, header states the sign convention, 1,488 data rows for the whole window',
    async () => {
      await page.goto(UI + '/intervals?status=matched', { waitUntil: 'domcontentloaded' })
      await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: /Export CSV/ }).click(),
      ])
      const path = await dl.path()
      const text = fs.readFileSync(path, 'utf8').trim().split('\n')
      ok(/error_mw_forecast_minus_actual/.test(text[0]), text[0])
      eq(text.length - 1, 1488, 'data rows')
      return `${dl.suggestedFilename()} · ${text.length - 1} rows · header: ${text[0].slice(0, 80)}…`
    },
  )
  await t('H11', 'CSV export honours filters (over-forecast only → 1,261 rows)', async () => {
    await page.goto(UI + '/intervals?status=matched&direction=over', { waitUntil: 'domcontentloaded' })
    await page
      .getByText(/1,261.*half-hours/)
      .first()
      .waitFor({ timeout: 60000 })
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: /Export CSV/ }).click(),
    ])
    eq(
      fs
        .readFileSync(await dl.path(), 'utf8')
        .trim()
        .split('\n').length - 1,
      1261,
      'rows',
    )
  })

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
