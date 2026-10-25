// Shared harness for the acceptance test (UAT). Drives a real Chromium against the DEPLOYED site (or any URL):
//   UAT_UI=https://<ui>  UAT_API=https://<api>  node uat/run-all.cjs
// Optional: PW_CHROMIUM_PATH (use a specific Chromium), UAT_PROXY (http proxy URL), UAT_OUT_DIR (where to write the json results).
const { chromium } = require('@playwright/test')
const UI = process.env.UAT_UI || 'https://windscope-uk-sand.vercel.app'
const API = process.env.UAT_API || 'https://windscope-api-5joc.onrender.com'
const results = []
let section = ''

function log(id, ok, desc, detail = '') {
  results.push({ section, id, ok, desc, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? '  — ' + detail : ''}`)
}

async function t(id, desc, fn) {
  try {
    const detail = await fn()
    log(id, true, desc, typeof detail === 'string' ? detail : '')
  } catch (e) {
    log(
      id,
      false,
      desc,
      String(e.message || e)
        .split('\n')[0]
        .slice(0, 220),
    )
  }
}
function eq(actual, expected, what = 'value') {
  if (actual !== expected)
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
// Poll until fn() returns without throwing (assertion that waits for React to re-render).
async function until(fn, ms = 8000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  throw last
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg)
}
const setSection = (s) => {
  section = s
  console.log(`\n=== ${s} ===`)
}

async function launch({ width = 1440, height = 900, ...ctxOpts } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    proxy: process.env.UAT_PROXY ? { server: process.env.UAT_PROXY } : undefined,
  })
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, ...ctxOpts })
  const page = await ctx.newPage()
  const problems = []
  page.setDefaultTimeout(45000)
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`))
  // ERR_ABORTED = the app cancelled an in-flight request on purpose (user changed the selection / navigated).
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText !== 'net::ERR_ABORTED')
      problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/__expected')) problems.push(`http ${r.status()}: ${r.url()}`)
  })
  await page.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    )
  })
  return { browser, ctx, page, problems }
}

const settle = async (page, ms = 350) => {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(ms)
}
const summary = (page) => page.getByRole('region', { name: 'Executive summary' })
async function openDashboard(page, search = '') {
  await page.goto(`${UI}/${search}`, { waitUntil: 'domcontentloaded' })
  await summary(page).getByText('Matched intervals').waitFor({ timeout: 90000 })
  await summary(page)
    .getByText(/Data sufficient|Partial data|Insufficient data/)
    .waitFor()
  await settle(page)
}
async function kpi(page, label) {
  const tile = summary(page).locator('p', { hasText: label }).first().locator('xpath=..')
  return (await tile.locator('p').nth(1).innerText()).trim()
}
const num = (s) =>
  Number(
    String(s)
      .replace(/[^\d.−-]/g, '')
      .replace('−', '-'),
  )
const revealAll = async (page) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await settle(page, 700)
  await page.evaluate(() => window.scrollTo(0, 0))
}

function report() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exitCode = failed.length ? 1 : 0
  if (failed.length) {
    console.log('FAILED:')
    failed.forEach((f) => console.log(`  ${f.id} ${f.desc} — ${f.detail}`))
  }
  const dir = process.env.UAT_OUT_DIR || require('os').tmpdir()
  const name = `windscope-uat-${require('path').basename(process.argv[1] || 'run', '.cjs')}.json`
  require('fs').writeFileSync(require('path').join(dir, name), JSON.stringify(results, null, 1))
}

module.exports = {
  UI,
  API,
  launch,
  t,
  eq,
  ok,
  until,
  setSection,
  settle,
  summary,
  openDashboard,
  kpi,
  num,
  revealAll,
  report,
  results,
  log,
}
