// API-level acceptance checks against the deployed API: endpoints, validation, error envelope, CORS, admin guard, ETag, headers.
const { request } = require('@playwright/test')
const L = require('../lib.cjs')
const { t, eq, ok } = L

const Q = 'basis=decision_date&from=2026-01-01&to=2026-01-31&cutoff=09:20'

;(async () => {
  const api = await request.newContext({
    baseURL: L.API,
    proxy: process.env.UAT_PROXY ? { server: process.env.UAT_PROXY } : undefined,
    timeout: 90000,
  })
  const get = (path, headers) => api.get(path, { headers })
  const json = async (path) => (await get(path)).json()

  L.setSection('P. API checks (deployed API)')
  await t('P01', 'GET /api/health → 200, data_loaded true', async () => {
    const r = await get('/api/health')
    eq(r.status(), 200, 'status')
    eq((await r.json()).data_loaded, true, 'data_loaded')
  })
  await t(
    'P02',
    'GET /api/metadata → real data (elexon_live, not synthetic), MW, hold alignment, both interpretations, three cutoff presets',
    async () => {
      const m = await json('/api/metadata')
      eq(m.provenance.provenance, 'elexon_live', 'provenance')
      eq(m.provenance.is_synthetic, false, 'is_synthetic')
      eq(m.provenance.unit, 'MW', 'unit')
      eq(m.forecast_alignment, 'hold', 'alignment')
      eq(m.bases.map((b) => b.id).join(), 'decision_date,delivery_date', 'bases')
      eq(m.cutoff_presets.length, 3, 'presets')
    },
  )
  await t('P03', 'GET /api/docs serves Swagger UI', async () => {
    const r = await get('/api/docs')
    eq(r.status(), 200, 'status')
    ok((await r.text()).includes('swagger-ui'), 'no swagger-ui')
  })
  await t('P04', 'GET /api/openapi.json lists the 11 documented paths', async () => {
    const d = await json('/api/openapi.json')
    eq(Object.keys(d.paths).length, 11, 'paths')
  })
  await t(
    'P05',
    'summary, timeseries, accuracy, cutoff-sensitivity → 200 for the default window',
    async () => {
      for (const ep of ['summary', 'timeseries', 'accuracy', 'cutoff-sensitivity'])
        eq((await get(`/api/${ep}?${Q}`)).status(), 200, ep)
    },
  )
  await t('P06', 'GET /api/intervals → 200, total 1,488', async () => {
    eq((await json('/api/intervals?page=1&page_size=5&status=matched')).total, 1488, 'total')
  })
  await t('P07', 'GET /api/intervals/export → CSV with 1,488 data rows + header', async () => {
    const r = await get('/api/intervals/export?status=matched')
    eq(r.status(), 200, 'status')
    ok((r.headers()['content-type'] || '').includes('text/csv'), 'content-type')
    eq((await r.text()).trim().split('\n').length, 1489, 'lines')
  })
  await t(
    'P08',
    'GET /api/forecast-vintages → 200 and exactly one publication used at the decision time',
    async () => {
      const v = await json('/api/forecast-vintages?start=2026-01-12T01:00:00Z&cutoff=09:20')
      eq(Math.round(v.selected.forecast_mw), 20942, 'used forecast')
    },
  )
  await t('P09', 'GET /api/decision-brief → 200', async () => {
    eq((await get('/api/decision-brief?decision_date=2026-01-31&cutoff=09:20')).status(), 200, 'status')
  })
  await t(
    'P10',
    'invalid cutoff (25:99) → 422 with the standard error envelope naming the field',
    async () => {
      const r = await get('/api/summary?cutoff=25:99')
      eq(r.status(), 422, 'status')
      const b = await r.json()
      eq(b.error.code, 'invalid_request', 'code')
      eq(b.error.details[0].field, 'cutoff', 'field')
    },
  )
  await t('P11', 'range outside the analysis window → 422 with an explanatory message', async () => {
    const r = await get('/api/summary?from=2025-01-01&to=2025-01-05')
    eq(r.status(), 422, 'status')
    ok(/outside the analysis window/.test((await r.json()).error.message), 'message')
  })
  await t('P12', 'unknown route → 404 in the same envelope', async () => {
    const r = await get('/api/does-not-exist')
    eq(r.status(), 404, 'status')
    eq((await r.json()).error.code, 'not_found', 'code')
  })
  await t('P13', 'POST /api/admin/refresh with no admin token configured → 404 admin_disabled', async () => {
    const r = await api.post('/api/admin/refresh')
    eq(r.status(), 404, 'status')
    eq((await r.json()).error.code, 'admin_disabled', 'code')
  })
  await t('P14', 'wrong HTTP method → 405', async () => {
    eq((await api.delete('/api/summary')).status(), 405, 'status')
  })
  await t(
    'P15',
    'CORS: the UI origin is echoed; an arbitrary origin gets no Access-Control-Allow-Origin',
    async () => {
      const good = await get(`/api/summary?${Q}`, { Origin: L.UI })
      eq(good.headers()['access-control-allow-origin'], L.UI, 'allowed origin')
      const bad = await get(`/api/summary?${Q}`, { Origin: 'https://evil.example' })
      eq(bad.headers()['access-control-allow-origin'], undefined, 'foreign origin')
    },
  )
  await t('P16', 'CORS preflight from the UI origin succeeds', async () => {
    const r = await api.fetch('/api/summary', {
      method: 'OPTIONS',
      headers: { Origin: L.UI, 'Access-Control-Request-Method': 'GET' },
    })
    eq(r.status(), 200, 'status')
    eq(r.headers()['access-control-allow-origin'], L.UI, 'allow-origin')
  })
  await t(
    'P17',
    'conditional request with the ETag → 304 (no recomputation); security headers present',
    async () => {
      const first = await get(`/api/summary?${Q}`)
      const etag = first.headers().etag
      ok(etag, 'no etag')
      eq((await get(`/api/summary?${Q}`, { 'If-None-Match': etag })).status(), 304, 'conditional status')
      const h = first.headers()
      eq(h['x-content-type-options'], 'nosniff', 'nosniff')
      eq(h['x-frame-options'], 'DENY', 'x-frame-options')
      eq(h['referrer-policy'], 'no-referrer', 'referrer-policy')
      ok(/default-src 'none'/.test(h['content-security-policy']), 'csp')
      ok(/max-age/.test(h['strict-transport-security']), 'hsts')
    },
  )

  await api.dispose()
  L.report()
})().catch((e) => {
  console.error('SCRIPT ERROR', e)
  process.exit(1)
})
