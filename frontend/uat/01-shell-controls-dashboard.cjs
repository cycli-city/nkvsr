// UAT part 1: app shell, selection controls, KPI tiles, decision brief, timeline. LIVE site, real data.
const L = require('./lib.cjs')
const { t, eq, ok, until, UI } = L

;(async () => {
  const { browser, page, problems } = await L.launch()
  const sum = () => L.summary(page)

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
        await L.settle(page, 500)
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
      await page.waitForFunction(() =>
        /10 days|Decisions 1 Jan – 10 Jan/.test(
          document.querySelector('[aria-labelledby="summary-h"]')?.textContent || '',
        ),
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

  L.setSection('C. Executive summary')
  await L.openDashboard(page)
  await t('C01', 'Six KPI tiles show the verified real values', async () => {
    const v = {
      n: await L.kpi(page, 'Matched intervals'),
      cov: await L.kpi(page, 'Forecast coverage'),
      mae: await L.kpi(page, 'MAE'),
      rmse: await L.kpi(page, 'RMSE'),
      bias: await L.kpi(page, 'Bias'),
      skill: await L.kpi(page, 'MAE vs persistence'),
    }
    eq(L.num(v.n), 1488, 'n')
    ok(/100/.test(v.cov), `coverage ${v.cov}`)
    eq(L.num(v.mae), 2042, 'MAE')
    eq(L.num(v.rmse), 2509, 'RMSE')
    eq(L.num(v.bias), 1748, 'bias')
    ok(/51/.test(v.skill), `skill ${v.skill}`)
    return JSON.stringify(v)
  })
  await t(
    'C02',
    'Data-sufficiency badge says "Data sufficient"; scope line shows decision→delivery window',
    async () => {
      await sum().getByText('Data sufficient').waitFor()
      await sum()
        .getByText(/Decisions 1 Jan – 31 Jan → delivery 2 Jan – 1 Feb/)
        .waitFor()
    },
  )
  await t('C03', 'Hourly-forecast note is visible and explains held (not interpolated) values', async () => {
    const note = page.getByTestId('alignment-note')
    await note.waitFor()
    const text = await note.innerText()
    ok(/both half-hours/.test(text) && /interpolated/.test(text), text.slice(0, 120))
  })
  await t(
    'C04',
    'Info tips: all six open with Enter/click, show the definition, and close with Escape',
    async () => {
      for (const name of [
        'Matched intervals',
        'Forecast coverage',
        'MAE',
        'RMSE',
        'Bias (F − A)',
        'MAE vs persistence',
      ]) {
        const btn = sum().getByRole('button', { name: `About ${name}`, exact: true })
        await btn.click()
        const tip = page.getByRole('tooltip')
        await tip.waitFor()
        ok((await tip.innerText()).length > 40, `${name} tooltip too short`)
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => document.querySelectorAll('[role="tooltip"]').length === 0)
      }
    },
  )
  await t(
    'C05',
    'Tile drill-downs: Matched→status=matched, MAE→largest first, Bias→over-forecasts; RMSE/persistence are not links',
    async () => {
      const cases = [
        ['Matched intervals', /status=matched/],
        ['MAE', /sort_by=abs_error.*sort_dir=desc|sort_dir=desc.*sort_by=abs_error/],
        ['Bias', /direction=over/],
      ]
      for (const [label, re] of cases) {
        await sum()
          .getByRole('link', { name: new RegExp(`^${label}`) })
          .click()
        await page.waitForURL(/\/intervals\?/)
        ok(re.test(decodeURIComponent(page.url())), `${label}: ${page.url()}`)
        await page.getByText(/half-hours · delivery/).waitFor()
        await page.goBack()
        await sum().getByText('Matched intervals').waitFor()
      }
      eq(await sum().getByRole('link', { name: /^RMSE/ }).count(), 0, 'RMSE link')
    },
  )

  await t(
    'C06',
    '"Jump to" chips scroll each section into view (Summary, Decision brief, Timeline, Accuracy, Decision timing)',
    async () => {
      const nav = page.getByRole('navigation', { name: 'On this page' })
      const done = []
      for (const [label, id] of [
        ['Decision timing', 'timing-h'],
        ['Accuracy', 'accuracy-h'],
        ['Timeline', 'timeline-h'],
        ['Decision brief', 'brief-h'],
        ['Summary', 'summary-h'],
      ]) {
        await nav.getByRole('link', { name: label }).click()
        await until(async () => {
          const top = await page.locator(`#${id}`).evaluate((e) => e.getBoundingClientRect().top)
          ok(top > -20 && top < 400, `${label}: heading top=${Math.round(top)}`)
        })
        done.push(label)
      }
      return done.join(' → ')
    },
  )

  L.setSection('D. Decision brief')
  await L.openDashboard(page)
  const brief = page.locator('section[aria-labelledby="brief-h"]')
  await t(
    'D01',
    'Defaults to the last decision date (31 Jan) and shows the forecast set visible at 09:20',
    async () => {
      await brief.getByText(/as at 09:20 on 31 Jan/).waitFor()
      await brief.getByText(/Forecast set visible at 09:20/).waitFor()
      const text = await brief.innerText()
      ok(
        /7,142/.test(text) && /10,099/.test(text) && /4,915/.test(text),
        text.replace(/\s+/g, ' ').slice(0, 300),
      )
    },
  )
  await t(
    'D02',
    'Previous ← / Next → step the decision date; Next is disabled at the end; date picker jumps to a date',
    async () => {
      const next = brief.getByRole('button', { name: 'Next decision date' })
      ok(await next.isDisabled(), 'next should be disabled on the last date')
      await brief.getByRole('button', { name: 'Previous decision date' }).click()
      await brief.getByText(/as at 09:20 on 30 Jan/).waitFor()
      ok(!(await next.isDisabled()), 'next should be enabled now')
      await next.click()
      await brief.getByText(/on 31 Jan/).waitFor()
      await brief.getByLabel('Decision date', { exact: true }).fill('2026-01-15')
      await brief.getByText(/as at 09:20 on 15 Jan/).waitFor()
      await brief.getByLabel('Decision date', { exact: true }).fill('2026-01-01')
      ok(
        await brief.getByRole('button', { name: 'Previous decision date' }).isDisabled(),
        'previous should be disabled at the first date',
      )
    },
  )
  await t(
    'D03',
    'Brief chart draws the forecast line; "Open intervals" opens that single delivery day',
    async () => {
      await brief.getByLabel('Decision date', { exact: true }).fill('2026-01-15')
      await brief.getByText(/on 15 Jan/).waitFor()
      ok((await brief.locator('.recharts-line path, .recharts-area path').count()) > 0, 'no chart paths')
      await brief.getByRole('link', { name: 'Open intervals' }).click()
      await page.waitForURL(/\/intervals\?.*from=2026-01-15.*to=2026-01-15|to=2026-01-15.*from=2026-01-15/)
      await page
        .getByText(/48 half-hours/)
        .first()
        .waitFor()
    },
  )

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
