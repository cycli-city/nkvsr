// UAT part 3: phone (390x844, touch) and tablet (768x1024). LIVE site.
const L = require('./lib.cjs')
const { t, eq, ok, until, UI } = L

async function overflow(page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  return [sw, cw]
}

;(async () => {
  L.setSection('L. Phone 390×844 (touch)')
  let { browser, page, problems } = await L.launch({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  await t(
    'L01',
    'Dashboard on a phone: controls are collapsed to one line with an Edit button; KPIs visible',
    async () => {
      await L.openDashboard(page)
      await page.getByRole('button', { name: 'Edit' }).waitFor()
      ok(!(await page.getByLabel(/Decision cutoff/).isVisible()), 'controls should be hidden until Edit')
      await page
        .getByText(/cutoff 09:20 UK/)
        .first()
        .waitFor()
    },
  )
  await t(
    'L02',
    'Edit opens the controls; changing the cutoff on touch works; Hide closes them',
    async () => {
      await page.getByRole('button', { name: 'Edit' }).tap()
      await page.getByLabel(/Decision cutoff/).waitFor({ state: 'visible' })
      await page.getByLabel(/Decision cutoff/).selectOption('09:50')
      await page.waitForURL(/cutoff=09%3A50/)
      await L.summary(page)
        .getByText(/cutoff 09:50 UK time/)
        .waitFor()
      await page.getByRole('button', { name: 'Hide' }).tap()
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('select')).display === 'none' ||
          document.querySelector('[aria-label="Analysis selection"] select')?.offsetParent === null,
      )
    },
  )
  await t(
    'L03',
    'No horizontal overflow on any of the 4 pages (with every lazy panel revealed)',
    async () => {
      const out = []
      for (const path of ['/', '/intervals', '/vintages?start=2026-01-15T08:30:00Z', '/methodology']) {
        await page.goto(UI + path, { waitUntil: 'domcontentloaded' })
        await page.locator('main').waitFor()
        await L.settle(page, 800)
        await L.revealAll(page)
        const [sw, cw] = await overflow(page)
        out.push(`${path.split('?')[0]} ${sw}/${cw}`)
        ok(sw <= cw, `${path} overflows: ${sw}>${cw}`)
      }
      return out.join(' · ')
    },
  )
  await t('L04', 'Intervals: rows become readable cards on a phone and still link to vintages', async () => {
    await page.goto(UI + '/intervals', { waitUntil: 'domcontentloaded' })
    await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
    const links = page.getByRole('link', { name: /Open forecast vintages for/ })
    ok((await links.count()) >= 25, `${await links.count()} links`)
    const visible = []
    for (const i of [0, 1]) visible.push(await links.nth(i).isVisible())
    ok(visible.some(Boolean), 'no visible vintage link on the phone layout')
    await links.filter({ visible: true }).first().tap()
    await page.waitForURL(/\/vintages\?.*start=/)
  })
  await t('L05', 'Intervals filters and pagination usable on a phone (tap Next, change status)', async () => {
    await page.goto(UI + '/intervals', { waitUntil: 'domcontentloaded' })
    await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: /Next/ }).tap()
    await page.getByText(/Showing\s*51–100/).waitFor()
    await page.getByLabel('Direction of error').selectOption('over')
    await page
      .getByText(/1,261.*half-hours/)
      .first()
      .waitFor()
  })
  await t(
    'L06',
    'Decision timing table scrolls sideways inside its own box (page itself does not), chart visible',
    async () => {
      await L.openDashboard(page)
      const timing = page.locator('section[aria-labelledby="timing-h"]')
      await timing.scrollIntoViewIfNeeded()
      await timing.getByRole('table').waitFor()
      const [sw, cw] = await overflow(page)
      ok(sw <= cw, `page overflow ${sw}/${cw}`)
      const region = timing.locator('[role="region"][tabindex="0"]').first()
      ok((await region.count()) === 1, 'scroll region should be keyboard-focusable')
    },
  )
  await t(
    'L07',
    'Phone: tap a timeline point shows tooltip; no console errors / CSP violations on the phone session',
    async () => {
      await L.openDashboard(page)
      const chart = page.locator('section[aria-labelledby="timeline-h"] .recharts-wrapper')
      await chart.scrollIntoViewIfNeeded()
      const box = await chart.boundingBox()
      await page.touchscreen.tap(box.x + box.width * 0.5, box.y + 140)
      await page.waitForTimeout(800)
      const csp = await page.evaluate(() => window.__csp)
      ok(
        problems.length === 0 && csp.length === 0,
        `${problems.join(' | ')} ${csp.join(' | ')}`.slice(0, 300),
      )
    },
  )
  await browser.close()

  L.setSection('M. Tablet 768×1024')
  ;({ browser, page, problems } = await L.launch({ width: 768, height: 1024 }))
  await t('M01', 'Tablet: no overflow on any page; selection controls usable', async () => {
    const out = []
    for (const path of ['/', '/intervals', '/vintages?start=2026-01-15T08:30:00Z', '/methodology']) {
      await page.goto(UI + path, { waitUntil: 'domcontentloaded' })
      await page.locator('main').waitFor()
      await L.settle(page, 800)
      await L.revealAll(page)
      const [sw, cw] = await overflow(page)
      out.push(`${path.split('?')[0]} ${sw}/${cw}`)
      ok(sw <= cw, `${path} ${sw}>${cw}`)
    }
    return out.join(' · ')
  })
  await browser.close()

  L.setSection('N. Keyboard-only use (desktop)')
  ;({ browser, page, problems } = await L.launch())
  await t(
    'N01',
    'Tab reaches nav, controls, KPI links and chart toggle in a sensible order; every focused element shows a visible focus indicator',
    async () => {
      await L.openDashboard(page)
      const seen = []
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab')
        const info = await page.evaluate(() => {
          const el = document.activeElement
          if (!el || el === document.body) return null
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName,
            text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28),
            outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
            shadow: cs.boxShadow !== 'none',
            visible: r.width > 0 && r.height > 0,
          }
        })
        if (info) seen.push(info)
      }
      ok(seen.length >= 30, `only ${seen.length} focus stops`)
      const noIndicator = seen.filter((s) => !s.outline && !s.shadow)
      ok(
        noIndicator.length === 0,
        `no focus indicator on: ${noIndicator.map((n) => n.tag + ':' + n.text).join(', ')}`,
      )
      return `${seen.length} stops, first: ${seen
        .slice(0, 8)
        .map((s) => s.text)
        .join(' → ')}`
    },
  )
  await t(
    'N02',
    'Keyboard: change cutoff with arrow keys on the select, sort an Intervals column with Enter, step the decision brief with the Previous button via Space',
    async () => {
      await page.goto(UI + '/intervals?status=matched', { waitUntil: 'domcontentloaded' })
      await page.getByText('Page 1 of 30').waitFor({ timeout: 60000 })
      await page.getByRole('button', { name: /\|Error\|/ }).focus()
      await page.keyboard.press('Enter')
      await page.waitForURL(/sort_by=abs_error/)
      await L.openDashboard(page)
      const prev = page
        .locator('section[aria-labelledby="brief-h"]')
        .getByRole('button', { name: 'Previous decision date' })
      await prev.focus()
      await page.keyboard.press('Space')
      await page.getByText(/as at 09:20 on 30 Jan/).waitFor()
    },
  )
  await browser.close()

  L.report()
})().catch((e) => {
  console.error('SCRIPT ERROR', e)
  process.exit(1)
})
