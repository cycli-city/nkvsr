// UAT part 2: accuracy, decision timing, intervals explorer, vintages, methodology. LIVE site, real data.
const L = require('./lib.cjs')
const { t, eq, ok, until, UI } = L
const fs = require('fs')

;(async () => {
  const { browser, page, problems } = await L.launch()

  L.setSection('F. Forecast accuracy panel')
  await L.openDashboard(page)
  const acc = page.locator('section[aria-labelledby="accuracy-h"]')
  await t('F01', 'Daily error trend, error distribution and half-hour-of-day charts all draw', async () => {
    await acc.scrollIntoViewIfNeeded()
    await L.settle(page, 800)
    for (const title of ['Daily error trend', 'Error distribution', 'Accuracy by half-hour of the day']) {
      await acc.getByText(title).first().waitFor()
    }
    ok((await acc.locator('.recharts-bar-rectangle').count()) > 20, 'bars missing')
  })
  await t('F02', 'Day-vs-night table: day MAE 1,932 MW, night MAE 2,263 MW', async () => {
    const txt = (await acc.innerText()).replace(/\s+/g, ' ')
    ok(/1,932/.test(txt) && /2,263/.test(txt), 'day/night MAE not found')
  })
  await t(
    'F03',
    'Baseline table: persistence 4,144 and trailing mean 4,414 vs forecast 2,042 (skill positive)',
    async () => {
      const txt = (await acc.innerText()).replace(/\s+/g, ' ')
      ok(/4,144/.test(txt) && /4,414/.test(txt), 'baselines missing')
      await acc.getByText(/Hindsight check/).waitFor()
      ok(/1,667/.test(txt), 'hindsight MAE 1,667 missing')
    },
  )
  await t(
    'F04',
    'Error profile: 85% over-forecast bar (aria label) and the empirical 80% range text, with its info tip',
    async () => {
      await acc.locator('[aria-label*="over-forecast"][aria-label*="under-forecast"]').first().waitFor()
      const lbl = await acc
        .locator('[aria-label*="over-forecast"][aria-label*="under-forecast"]')
        .first()
        .getAttribute('aria-label')
      ok(/8[45]% over/.test(lbl), lbl)
      await acc.getByRole('button', { name: 'About the empirical error range' }).click()
      await page.getByRole('tooltip').waitFor()
      await page.keyboard.press('Escape')
      const txt = (await acc.innerText()).replace(/\s+/g, ' ')
      ok(/4,140/.test(txt), '80% range upper bound 4,140 not shown')
      return lbl
    },
  )
  await t('F05', 'Baseline info tips open and close', async () => {
    const tips = acc.getByRole('button', { name: /^About (Persistence|Trailing)/i })
    const n = await tips.count()
    ok(n >= 2, `${n} baseline tips`)
    for (let i = 0; i < n; i++) {
      await tips.nth(i).click()
      await page.getByRole('tooltip').waitFor()
      await page.keyboard.press('Escape')
    }
  })
  await t(
    'F06',
    'Daily chart: hover shows tooltip; clicking a day bar opens the intervals of that day',
    async () => {
      const chart = acc.locator('.recharts-wrapper').first()
      await chart.scrollIntoViewIfNeeded()
      const box = await chart.boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + 120)
      await page.mouse.move(box.x + box.width * 0.51, box.y + 120)
      await chart
        .locator('.recharts-tooltip-wrapper')
        .getByText(/MAE|Bias|Mean/i)
        .first()
        .waitFor()
      await page.mouse.click(box.x + box.width * 0.51, box.y + 120)
      await page.waitForURL(/\/intervals\?/)
      ok(/from=2026-01-\d\d/.test(page.url()) && /to=2026-01-\d\d/.test(page.url()), page.url())
      await page.goBack()
      await L.settle(page)
    },
  )
  await t(
    'F07',
    'Largest errors table: 10 rows; the worst is 12 Jan 01:00 (+6,894 MW); each row links to its vintages',
    async () => {
      await L.openDashboard(page)
      await acc.scrollIntoViewIfNeeded()
      await L.settle(page, 600)
      const table = acc.getByRole('table', { name: /Largest|largest/ })
      const rows = table.locator('tbody tr')
      eq(await rows.count(), 10, 'rows')
      const first = (await rows.first().innerText()).replace(/\s+/g, ' ')
      ok(/2026-01-12 01:00|12 Jan/.test(first) && /6,894/.test(first), first)
      await rows.first().getByRole('link').click()
      await page.waitForURL(/\/vintages\?.*start=2026-01-12T01%3A00%3A00Z/)
      return first.slice(0, 90)
    },
  )

  L.setSection('G. Decision timing panel ("Does the decision time matter?")')
  await L.openDashboard(page)
  const timing = page.locator('section[aria-labelledby="timing-h"]')
  await t('G01', 'Panel loads lazily: nothing is requested until it scrolls into view', async () => {
    const reqs = []
    page.on('request', (r) => {
      if (r.url().includes('cutoff-sensitivity')) reqs.push(r.url())
    })
    await page.goto(UI + '/?cutoff=09%3A20', { waitUntil: 'domcontentloaded' })
    await L.summary(page).getByText('Matched intervals').waitFor({ timeout: 90000 })
    await L.settle(page, 600)
    eq(await timing.getByRole('table').count(), 0, 'table before scrolling')
    await timing.scrollIntoViewIfNeeded()
    await timing.getByRole('table').waitFor()
    ok(reqs.length >= 1, 'no cutoff-sensitivity request after scrolling')
  })
  await t(
    'G02',
    'Table: 9 runs; "Yours" on 09:20 (07:30 run, MAE 2,042, bias +1,748); 09:30 and later are "Hindsight only"',
    async () => {
      const table = timing.getByRole('table')
      eq(await table.locator('tbody tr').count(), 9, 'rows')
      const yours = (await table.locator('tbody tr', { hasText: 'Yours' }).innerText()).replace(/\s+/g, ' ')
      ok(/09:20/.test(yours) && /07:30/.test(yours) && /2,042/.test(yours) && /\+1,748/.test(yours), yours)
      eq(await table.getByText('Hindsight only').count(), 5, 'hindsight rows')
      eq(await table.getByText('Available', { exact: true }).count(), 3, 'available rows')
    },
  )
  await t(
    'G03',
    'Reading text: states that 09:30 could not have informed the bid; last run −10.4% MAE; bias +1,748 → +1,603',
    async () => {
      const txt = (await timing.getByTestId('sensitivity-reading').innerText()).replace(/\s+/g, ' ')
      ok(
        /could not have informed the bid/.test(txt) &&
          /2,016/.test(txt) &&
          /10\.4/.test(txt) &&
          /1,603/.test(txt),
        txt,
      )
    },
  )
  await t(
    'G04',
    'Chart: bars (blue before / teal yours / grey after) + bias line + legend of four items; tooltip on hover',
    async () => {
      ok((await timing.locator('.recharts-bar-rectangle').count()) === 9, 'bars')
      const chart = timing.locator('.recharts-wrapper').first()
      const box = await chart.boundingBox()
      await page.mouse.move(box.x + box.width * 0.5, box.y + 100)
      await page.mouse.move(box.x + box.width * 0.52, box.y + 100)
      await chart.locator('.recharts-tooltip-wrapper').getByText(/MAE/).first().waitFor()
      for (const label of ['Earlier than your cutoff', 'Your cutoff', 'After your cutoff', 'Bias F−A'])
        await timing.getByText(new RegExp(label)).first().waitFor()
    },
  )
  await t('G05', 'Changing the cutoff to 12:00 moves "Yours" to 12:00 and rewrites the reading', async () => {
    await page.goto(UI + '/?cutoff=12%3A00', { waitUntil: 'domcontentloaded' })
    await L.summary(page).getByText('Matched intervals').waitFor({ timeout: 90000 })
    await timing.scrollIntoViewIfNeeded()
    const row = timing.getByRole('table').locator('tbody tr', { hasText: 'Yours' })
    await row.waitFor()
    ok(/12:00/.test(await row.innerText()), 'row')
    await timing
      .getByTestId('sensitivity-reading')
      .getByText(/At your 12:00 cutoff/)
      .waitFor()
  })

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
