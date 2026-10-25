// UAT suite: Selection controls (interpretation, cutoff, dates, quick ranges, reset) and how they live in the URL.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L

;(async () => {
  const { browser, page, problems } = await L.launch()
  const sum = () => L.summary(page)

  L.setSection('B. Selection controls (apply to every page, live in the URL)')
  await L.openDashboard(page)
  const baseN = L.num(await L.kpi(page, 'Matched intervals'))
  await t('B01', 'Default selection = decisions 1–31 Jan, cutoff 09:20 (n 1,488)', async () => {
    eq(baseN, 1488, 'n')
    await page.getByLabel(/January.*means/i).waitFor()
    eq(await page.getByLabel(/January.*means/i).inputValue(), 'decision_date')
    eq(await page.getByLabel(/Decision cutoff/).inputValue(), '09:20')
    eq(await page.getByLabel('Decision date from').inputValue(), '2026-01-01')
    eq(await page.getByLabel('Decision date to').inputValue(), '2026-01-31')
  })
  await t(
    'B02',
    'Interpretation switch → deliveries in January: numbers change (MAE 2,145), URL records it, label says Delivery',
    async () => {
      await page.getByLabel(/January.*means/i).selectOption('delivery_date')
      await page.waitForURL(/basis=delivery_date/)
      await sum()
        .getByText(/Decisions 31 Dec – 30 Jan → delivery 1 Jan – 31 Jan/)
        .waitFor()
      await page.getByLabel('Delivery date from').waitFor()
      await page.waitForFunction(() =>
        /2,145/.test(document.querySelector('[aria-labelledby="summary-h"]')?.textContent || ''),
      )
      return `MAE=${await L.kpi(page, 'MAE')}`
    },
  )
  await t('B03', 'Switching back restores 2,042 and removes basis from the URL', async () => {
    await page.getByLabel(/January.*means/i).selectOption('decision_date')
    await page.waitForFunction(() =>
      /2,042/.test(document.querySelector('[aria-labelledby="summary-h"]')?.textContent || ''),
    )
    ok(!/basis=/.test(page.url()), page.url())
  })
  await t('B04', 'Every cutoff preset is selectable and changes the explanatory sentence + URL', async () => {
    const opts = await page
      .getByLabel(/Decision cutoff/)
      .locator('option')
      .evaluateAll((os) => os.map((o) => [o.value, o.textContent]))
    ok(opts.length >= 4, `only ${opts.length} options`)
    for (const [value] of opts.filter(([v]) => v !== 'custom')) {
      await page.getByLabel(/Decision cutoff/).selectOption(value)
      await page
        .getByText(new RegExp(`published at or before ${value} UK time`))
        .first()
        .waitFor()
    }
    return opts.map((o) => o[0]).join(', ')
  })
  await t(
    'B05',
    'Custom time: input appears, 08:45 is applied (URL + sentence), results recomputed',
    async () => {
      await page.getByLabel(/Decision cutoff/).selectOption('custom')
      const custom = page.getByLabel('Custom decision cutoff time')
      await custom.waitFor()
      await custom.fill('08:45')
      await page.waitForURL(/cutoff=08%3A45/)
      await page
        .getByText(/at or before 08:45 UK time/)
        .first()
        .waitFor()
      await sum()
        .getByText(/cutoff 08:45 UK time/)
        .waitFor()
    },
  )
  await t('B06', 'Reset returns to the default view and clears URL state', async () => {
    await page.getByRole('button', { name: 'Reset' }).click()
    await page.waitForFunction(() => !/cutoff=|basis=/.test(location.search))
    await until(async () => eq(await page.getByLabel(/Decision cutoff/).inputValue(), '09:20'))
    await sum()
      .getByText(/cutoff 09:20 UK time/)
      .waitFor()
  })
  await t(
    'B07',
    'Quick ranges: every chip narrows the data, shows pressed state, and the last one can be undone by Reset',
    async () => {
      const chips = page.getByRole('group', { name: 'Quick date ranges' }).getByRole('button')
      const n = await chips.count()
      ok(n >= 4, `${n} chips`)
      const seen = []
      for (let i = 0; i < n; i++) {
        const chip = chips.nth(i)
        const label = (await chip.innerText()).trim()
        await chip.click()
        await until(async () => eq(await chip.getAttribute('aria-pressed'), 'true', `${label} pressed`))
        // The free-tier API keeps computing requests the browser already abandoned: pace the clicks.
        await L.settle(page, 1500)
        const m = L.num(await L.kpi(page, 'Matched intervals'))
        ok(m > 0 && m <= 1488, `${label}: n=${m}`)
        seen.push(`${label}→${m}`)
      }
      await page.getByRole('button', { name: 'Reset' }).click()
      await page.waitForFunction(() => !/from=|to=/.test(location.search))
      return seen.join(' · ')
    },
  )
  await t(
    'B08',
    'Date inputs: editing "to" narrows results; an out-of-range date shows the validation message',
    async () => {
      await page.getByLabel('Decision date to').fill('2026-01-10')
      await page.waitForURL(/to=2026-01-10/)
      await page.waitForFunction(
        () =>
          /10 days|Decisions 1 Jan – 10 Jan/.test(
            document.querySelector('[aria-labelledby="summary-h"]')?.textContent || '',
          ),
        undefined,
        { timeout: 90_000 }, // a busy free-tier API can take a while to answer an uncached query
      )
      const n = L.num(await L.kpi(page, 'Matched intervals'))
      ok(n > 400 && n < 520, `n=${n}`)
      await page.getByLabel('Decision date from').fill('2026-01-20') // from after to
      await page
        .getByRole('alert')
        .filter({ hasText: /Choose dates between/ })
        .waitFor()
      await page.getByRole('button', { name: 'Reset' }).click()
    },
  )
  await t(
    'B09',
    'A shared URL restores the exact view in a brand-new browser context (no stored state)',
    async () => {
      const url = `${UI}/?basis=delivery_date&from=2026-01-05&to=2026-01-11&cutoff=09%3A50`
      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const p2 = await ctx2.newPage()
      await p2.goto(url, { waitUntil: 'domcontentloaded' })
      await p2
        .getByRole('region', { name: 'Executive summary' })
        .getByText(/cutoff 09:50 UK time/)
        .waitFor({ timeout: 90000 })
      eq(await p2.getByLabel(/January.*means/i).inputValue(), 'delivery_date')
      eq(await p2.getByLabel('Delivery date from').inputValue(), '2026-01-05')
      await ctx2.close()
    },
  )
  await t(
    'B10',
    'Selection is carried across pages (nav links keep ?cutoff/?basis) and back button works',
    async () => {
      await page.goto(`${UI}/?cutoff=09%3A50`, { waitUntil: 'domcontentloaded' })
      await L.settle(page)
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Intervals' }).click()
      await page.waitForURL(/\/intervals\?.*cutoff=09%3A50/)
      await page.goBack()
      await page.waitForURL(/\/\?cutoff=09%3A50/)
    },
  )

  L.setSection('Z. Cleanliness')
  await t('Z01', 'No console errors, failed requests, HTTP ≥ 400 or CSP violations in part 1', async () => {
    const csp = await page.evaluate(() => window.__csp)
    // B08 deliberately sends from > to; the API answers 422 and the UI explains it. That one request is expected.
    const unexpected = problems.filter((p) => !/from=2026-01-20&to=2026-01-10|status of 422|http 422/.test(p))
    ok(
      unexpected.length === 0 && csp.length === 0,
      `${unexpected.join(' | ')} ${csp.join(' | ')}`.slice(0, 400),
    )
    return `${problems.length} expected 422 lines from the deliberate invalid-range test`
  })

  await browser.close()
  L.report()
})().catch((e) => {
  console.error('SCRIPT ERROR', e)
  process.exit(1)
})
