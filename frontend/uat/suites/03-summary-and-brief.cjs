// UAT suite: Executive summary tiles and info tips, and the decision brief.
const L = require('../lib.cjs')
const { t, eq, ok, until, UI } = L

;(async () => {
  const { browser, page, problems } = await L.launch()
  const sum = () => L.summary(page)

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
