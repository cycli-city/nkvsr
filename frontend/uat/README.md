# Acceptance test (UAT) against a deployed instance

80 browser checks (plus 17 API checks) that drive **every control** of the deployed app in a real Chromium, the way a user would: the app shell,
selection controls, KPI tiles, decision brief, timeline (hover, hindsight toggle, zoom, click-through), accuracy panel,
decision-timing panel, Intervals explorer (every filter, sort, pagination, search, CSV download), Vintages, Methodology,
API-failure recovery, phone and tablet layouts, and keyboard-only use; the API suite covers the endpoints, validation errors, CORS, the disabled admin endpoint, ETag/304 and security headers. They also fail on any console error, failed request or
Content-Security-Policy violation.

```bash
cd frontend
npx playwright install chromium              # once
UAT_UI=https://<ui-host> UAT_API=https://<api-host> npm run uat
```

Defaults point at the deployment documented in the README. Optional variables: `PW_CHROMIUM_PATH` (a specific Chromium),
`UAT_PROXY` (an HTTP proxy for the browser), `UAT_OUT_DIR` (where to write the JSON results, default the temp directory).

Notes

- These tests run against **real data**, so many assertions use the committed January 2026 snapshot's numbers (MAE 2,042 MW, 1,488
  half-hours, …). If the snapshot is re-ingested, update those expectations (they are written next to each check).
- The first request after the free-tier API has been idle can take about a minute; the suite waits for it.
- The results of the run recorded for submission are in [`docs/11-UAT-REPORT.md`](../docs/11-UAT-REPORT.md). The hermetic, CI-run
  browser suite is `npm run test:e2e` (Playwright on a labelled synthetic snapshot); this suite complements it by testing the
  real deployment.
