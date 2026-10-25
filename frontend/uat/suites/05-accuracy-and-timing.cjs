// UAT suite: Accuracy panel and the decision-timing panel.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L

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
