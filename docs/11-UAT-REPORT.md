# 11 — User-acceptance test (UAT) report

Every control of the **deployed** application was exercised in a real Chromium browser against the **real January 2026 data**, the way a
user would, and again at phone and tablet size and with the keyboard only. This report is the record of that run; the tests are in
[`frontend/uat/`](../frontend/uat/README.md) (`npm run uat`) so anyone can repeat it.

| | |
|---|---|
| Run | 2026-10-25, against the final deployment: UI build served by Vercel after the last redeploy, API on Render at the branch head |
| UI | <https://windscope-uk-sand.vercel.app> |
| API | <https://windscope-api-5joc.onrender.com> |
| Browser checks | **80 of 80 passed** (8 browser suites in `frontend/uat/suites/`; the whole acceptance test is `npm run uat` from `frontend/`) |
| API checks | **17 of 17 passed** (`suites/09-api-checks.cjs`) |
| Every browser run also fails on | any console error, failed request, HTTP ≥ 400 (other than the deliberate invalid-input tests) or Content-Security-Policy violation |

## What this does and does not prove

* It **does** prove that each control on the live site works and produces the numbers documented in `docs/09-REAL-DATA-FINDINGS.md`.
* It was run by a script in a fresh browser profile, through the build sandbox's proxy. It is **not** a human in an incognito window:
  the owner still has to open each submitted URL in incognito (`docs/06-DEPLOYMENT.md` §6).
* Only Chromium was used; no real assistive technology; no load test. Assertions use the January 2026 snapshot's numbers, so they must be
  updated if the snapshot is re-ingested.

## Defects found by this UAT (and fixed before the final run)

| # | Defect | Impact | Fix | Regression test |
|---|---|---|---|---|
| 1 | Dragging a **zoom handle** under the timeline and releasing over the plot was reported by the browser as a click on the chart, so the app navigated away to the Vintages page instead of zooming | Zooming the timeline (a feature the page invites you to use) threw the user off the dashboard | `TimelineChart` remembers that the press began on the zoom control and ignores the click that follows (commit `d8fd151`) | `e2e/dashboard.spec.ts`, "dragging a zoom handle zooms the timeline and does not navigate away": **fails without the fix, passes with it** (verified) |
| 2 | After zooming from a month to a week the time axis still used date-only labels, so it read "9 Jan, 9 Jan, 10 Jan, 10 Jan" | Ambiguous axis exactly when the user is looking closely | Labels follow the zoom window and include the time up to ten days (commit `b3e33c0`) | same e2e test (asserts a label with a time) **fails without the change**, plus unit tests for the thresholds |

Everything else found during the run was a mistake in a test script (timing, ambiguous selectors), not in the application.

## Behaviour worth knowing (not defects)

* Typing an invalid range (*from* after *to*) in the controls makes the API answer 422; the UI explains it and offers a way back. The 422 shows
  once in the browser console. The API's validation is the source of truth, so the front end does not duplicate it.
* After a click-through from the timeline and *Back*, the dashboard returns to where it was, but the Decision brief's date and the timeline zoom reset
  (they are component state, not URL state).
* The first request after the free-tier API has been idle can take about a minute; the UI says so while it waits.

## Results

### A. App shell

| ID | Check | Result | Observed |
|---|---|---|---|
| A01 | Dashboard loads on a hard URL with real (non-synthetic) data and a page title | ✅ pass | title="WindScope UK — Day-ahead wind forecast analytics" |
| A02 | Brand + tagline are shown | ✅ pass |  |
| A03 | Provenance bar: source, FUELHH + WINDFOR links to Elexon docs, unit, refresh time | ✅ pass | https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/s… |
| A04 | Data-quality note link jumps to Methodology #quality | ✅ pass |  |
| A05 | Footer: licence link opens Elexon licence in a new tab; scope disclaimer present | ✅ pass |  |
| A06 | Skip link is the first tab stop and moves focus to main content | ✅ pass |  |
| A07 | Primary nav: Dashboard / Intervals / Vintages / Methodology each navigate and mark the active page | ✅ pass |  |

### B. Selection controls (apply to every page, live in the URL)

| ID | Check | Result | Observed |
|---|---|---|---|
| B01 | Default selection = decisions 1–31 Jan, cutoff 09:20 (n 1,488) | ✅ pass |  |
| B02 | Interpretation switch → deliveries in January: numbers change (MAE 2,145), URL records it, label says Delivery | ✅ pass | MAE=2,145 MW |
| B03 | Switching back restores 2,042 and removes basis from the URL | ✅ pass |  |
| B04 | Every cutoff preset is selectable and changes the explanatory sentence + URL | ✅ pass | 09:20, 09:50, 08:00, custom |
| B05 | Custom time: input appears, 08:45 is applied (URL + sentence), results recomputed | ✅ pass |  |
| B06 | Reset returns to the default view and clears URL state | ✅ pass |  |
| B07 | Quick ranges: every chip narrows the data, shows pressed state, and the last one can be undone by Reset | ✅ pass | Full period→1488 · 1 Jan – 7 Jan→1488 · 8 Jan – 14 Jan→1488 · 15 Jan – 21 Jan→1488 · 22 Jan – 28 Jan→1488 · 29 Jan – 31 Jan→1488 |
| B08 | Date inputs: editing "to" narrows results; an out-of-range date shows the validation message | ✅ pass |  |
| B09 | A shared URL restores the exact view in a brand-new browser context (no stored state) | ✅ pass |  |
| B10 | Selection is carried across pages (nav links keep ?cutoff/?basis) and back button works | ✅ pass |  |

### C. Executive summary

| ID | Check | Result | Observed |
|---|---|---|---|
| C01 | Six KPI tiles show the verified real values | ✅ pass | {"n":"1,488","cov":"100.0%","mae":"2,042 MW","rmse":"2,509 MW","bias":"+1,748 MW","skill":"−51%"} |
| C02 | Data-sufficiency badge says "Data sufficient"; scope line shows decision→delivery window | ✅ pass |  |
| C03 | Hourly-forecast note is visible and explains held (not interpolated) values | ✅ pass |  |
| C04 | Info tips: all six open with Enter/click, show the definition, and close with Escape | ✅ pass |  |
| C05 | Tile drill-downs: Matched→status=matched, MAE→largest first, Bias→over-forecasts; RMSE/persistence are not links | ✅ pass |  |
| C06 | "Jump to" chips scroll each section into view (Summary, Decision brief, Timeline, Accuracy, Decision timing) | ✅ pass | Decision timing → Accuracy → Timeline → Decision brief → Summary |

### D. Decision brief

| ID | Check | Result | Observed |
|---|---|---|---|
| D01 | Defaults to the last decision date (31 Jan) and shows the forecast set visible at 09:20 | ✅ pass |  |
| D02 | Previous ← / Next → step the decision date; Next is disabled at the end; date picker jumps to a date | ✅ pass |  |
| D03 | Brief chart draws the forecast line; "Open intervals" opens that single delivery day | ✅ pass |  |

### E. Timeline

| ID | Check | Result | Observed |
|---|---|---|---|
| E01 | Chart draws actual + forecast lines; footnote says "No gaps" | ✅ pass |  |
| E02 | Hover tooltip shows time, actual, forecast at cutoff, error with direction, and publication time | ✅ pass | Tue, 13 Jan 2026, 20:30 GMT \|  \| Actual \| 10,426 MW \| Forecast at cutoff \| 10,138 MW \| Error (F − A) \| −288 MW · under-forecast \| Published… |
| E03 | Hindsight toggle is opt-in: unchecked by default, adds a clearly-labelled dashed series when checked, removes it again | ✅ pass |  |
| E04 | Zoom handles (Brush): two handles under the chart; dragging one zooms the plot and does NOT navigate away (regression) | ✅ pass |  |
| E05 | Clicking a point opens the vintages of that exact half-hour | ✅ pass |  |

### Z. Cleanliness

| ID | Check | Result | Observed |
|---|---|---|---|
| Z01 | No console errors, failed requests, HTTP ≥ 400 or CSP violations in part 1 | ✅ pass | 0 expected 422 lines from the deliberate invalid-range test |
| Z01 | No console errors, unexpected failed requests, HTTP ≥ 400 (other than the deliberate ones above) or CSP violations in part 2 | ✅ pass | 8 expected console/network lines from deliberate failure tests |

### F. Forecast accuracy panel

| ID | Check | Result | Observed |
|---|---|---|---|
| F01 | Daily error trend, error distribution and half-hour-of-day charts all draw | ✅ pass |  |
| F02 | Day-vs-night table: day MAE 1,932 MW, night MAE 2,263 MW | ✅ pass |  |
| F03 | Baseline table: persistence 4,144 and trailing mean 4,414 vs forecast 2,042 (skill positive) | ✅ pass |  |
| F04 | Error profile: 85% over-forecast bar (aria label) and the empirical 80% range text, with its info tip | ✅ pass | 85% over-forecast, 15% under-forecast |
| F05 | Baseline info tips open and close | ✅ pass |  |
| F06 | Daily chart: hover shows tooltip; clicking a day bar opens the intervals of that day | ✅ pass |  |
| F07 | Largest errors table: 10 rows; the worst is 12 Jan 01:00 (+6,894 MW); each row links to its vintages | ✅ pass | 12 Jan, 01:00 20,942 14,048 ▲ +6,894 11 Jan, 07:30 Vintages → |

### G. Decision timing panel ("Does the decision time matter?")

| ID | Check | Result | Observed |
|---|---|---|---|
| G01 | Panel loads lazily: nothing is requested until it scrolls into view | ✅ pass |  |
| G02 | Table: 9 runs; "Yours" on 09:20 (07:30 run, MAE 2,042, bias +1,748); 09:30 and later are "Hindsight only" | ✅ pass |  |
| G03 | Reading text: states that 09:30 could not have informed the bid; last run −10.4% MAE; bias +1,748 → +1,603 | ✅ pass |  |
| G04 | Chart: bars (blue before / teal yours / grey after) + bias line + legend of four items; tooltip on hover | ✅ pass |  |
| G05 | Changing the cutoff to 12:00 moves "Yours" to 12:00 and rewrites the reading | ✅ pass |  |

### H. Intervals explorer

| ID | Check | Result | Observed |
|---|---|---|---|
| H01 | Loads 1,488 half-hours, 50 per page, "Showing 1–50 of 1,488", Page 1 of 30 | ✅ pass |  |
| H02 | Pagination: Next/Previous work; Previous disabled on page 1, Next disabled on the last page | ✅ pass |  |
| H03 | Rows per page: 25 / 100 / 250 change the page size and page count | ✅ pass |  |
| H04 | Every sortable column header sorts (aria-sort flips ascending/descending) and the first rows are really ordered | ✅ pass |  |
| H05 | Status filter: Matched 1,488 · Any missing data → friendly empty state (no gaps in this window) with Clear button | ✅ pass | All intervals \| Matched only \| Any missing data \| Missing forecast \| Missing actual \| Missing both |
| H06 | Direction filter: over-forecast only = 1,261 rows, all positive; under-forecast = 227, all negative | ✅ pass |  |
| H07 | Minimum \|error\| filter: ≥ 5,000 MW leaves a short list whose rows all meet the threshold | ✅ pass | 50 rows ≥ 5,000 MW |
| H08 | Search: "2026-01-12 01:00" finds exactly that half-hour; "Sat" finds only Saturdays; nonsense → empty state; Clear filters resets | ✅ pass | 240 half-hours · delivery 2 Jan – 1 Feb · cutoff 09:20 UK ti |
| H09 | Row action "Vintages →" opens the forecast vintages of exactly that half-hour | ✅ pass |  |
| H10 | CSV export: real file download, header states the sign convention, 1,488 data rows for the whole window | ✅ pass | windscope_decision_date_2026-01-02_2026-02-01.csv · 1488 rows · header: start_time_utc,local_time,settlement_period,decision_cutoff_utc,forecast_va… |
| H11 | CSV export honours filters (over-forecast only → 1,261 rows) | ✅ pass |  |

### I. Forecast vintages

| ID | Check | Result | Observed |
|---|---|---|---|
| I01 | Empty state offers the largest miss; following it loads that half-hour | ✅ pass |  |
| I02 | 12 Jan 01:00: used 20,942 (07:30 run), latest 21,226, actual 14,048, error +6,894 | ✅ pass |  |
| I03 | Publication table: exactly one "Used at decision time"; later runs are "After cutoff"; superseded earlier runs are labelled | ✅ pass |  |
| I04 | Vintage chart draws the dots and the red cutoff line; hover shows a tooltip | ✅ pass |  |
| I05 | ← Previous / Next → half-hour buttons step by 30 minutes and update the heading + URL | ✅ pass |  |
| I06 | Picker: choosing a date + half-hour and pressing "Show vintages" loads it | ✅ pass |  |
| I07 | A half-hour outside the data window gives a clear, non-crashing message | ✅ pass | No data for delivery date 2025-06-01; coverage is 2026-01-01..2026-02-01 |
| I08 | Hourly-forecast hold note explains why the :30 half-hour reuses the hour's forecast | ✅ pass |  |

### J. Methodology

| ID | Check | Result | Observed |
|---|---|---|---|
| J01 | All seven sections render with their headings and substantial content | ✅ pass |  |
| J02 | Data-quality report shows the real ingestion counts (2,016 actuals / 18,664 forecast rows), provenance elexon_live | ✅ pass | Source: Elexon BMRS (Insights Solution API) · FUELHH, WINDFOR · national WIND · MW |
| J03 | Deep link /methodology#quality scrolls the quality section into view | ✅ pass |  |
| J04 | Hourly-forecast explainer and the "what does decisions made in January mean" section are present | ✅ pass |  |

### K. Unknown routes and API failure handling

| ID | Check | Result | Observed |
|---|---|---|---|
| K01 | Unknown URL shows a friendly page (not a blank screen) | ✅ pass | HTTP 200 · "Skip to main content WindScope UK Day-ahead wind forecast analytics Dashboard Intervals Vi" |
| K02 | API unreachable: clear message + "Try again" recovers once the API is back | ✅ pass |  |

### L. Phone 390×844 (touch)

| ID | Check | Result | Observed |
|---|---|---|---|
| L01 | Dashboard on a phone: controls are collapsed to one line with an Edit button; KPIs visible | ✅ pass |  |
| L02 | Edit opens the controls; changing the cutoff on touch works; Hide closes them | ✅ pass |  |
| L03 | No horizontal overflow on any of the 4 pages (with every lazy panel revealed) | ✅ pass | / 390/390 · /intervals 390/390 · /vintages 390/390 · /methodology 390/390 |
| L04 | Intervals: rows become readable cards on a phone and still link to vintages | ✅ pass |  |
| L05 | Intervals filters and pagination usable on a phone (tap Next, change status) | ✅ pass |  |
| L06 | Decision timing table scrolls sideways inside its own box (page itself does not), chart visible | ✅ pass |  |
| L07 | Phone: tap a timeline point shows tooltip; no console errors / CSP violations on the phone session | ✅ pass |  |

### M. Tablet 768×1024

| ID | Check | Result | Observed |
|---|---|---|---|
| M01 | Tablet: no overflow on any page; selection controls usable | ✅ pass | / 768/768 · /intervals 768/768 · /vintages 768/768 · /methodology 768/768 |

### N. Keyboard-only use (desktop)

| ID | Check | Result | Observed |
|---|---|---|---|
| N01 | Tab reaches nav, controls, KPI links and chart toggle in a sensible order; every focused element shows a visible focus indicator | ✅ pass | 40 stops, first: Skip to main content → Dashboard → Intervals → Vintages → Methodology → FUELHH → WINDFOR → 1 data-quality note |
| N02 | Keyboard: change cutoff with arrow keys on the select, sort an Intervals column with Enter, step the decision brief with the Previous button via Space | ✅ pass |  |

### P. API checks (deployed API)

| ID | Check | Result | Observed |
|---|---|---|---|
| P01 | GET /api/health → 200, data_loaded true | ✅ pass |  |
| P02 | GET /api/metadata → real data (elexon_live, not synthetic), MW, hold alignment, both interpretations, three cutoff presets | ✅ pass |  |
| P03 | GET /api/docs serves Swagger UI | ✅ pass |  |
| P04 | GET /api/openapi.json lists the 11 documented paths | ✅ pass |  |
| P05 | summary, timeseries, accuracy, cutoff-sensitivity → 200 for the default window | ✅ pass |  |
| P06 | GET /api/intervals → 200, total 1,488 | ✅ pass |  |
| P07 | GET /api/intervals/export → CSV with 1,488 data rows + header | ✅ pass |  |
| P08 | GET /api/forecast-vintages → 200 and exactly one publication used at the decision time | ✅ pass |  |
| P09 | GET /api/decision-brief → 200 | ✅ pass |  |
| P10 | invalid cutoff (25:99) → 422 with the standard error envelope naming the field | ✅ pass |  |
| P11 | range outside the analysis window → 422 with an explanatory message | ✅ pass |  |
| P12 | unknown route → 404 in the same envelope | ✅ pass |  |
| P13 | POST /api/admin/refresh with no admin token configured → 404 admin_disabled | ✅ pass |  |
| P14 | wrong HTTP method → 405 | ✅ pass |  |
| P15 | CORS: the UI origin is echoed; an arbitrary origin gets no Access-Control-Allow-Origin | ✅ pass |  |
| P16 | CORS preflight from the UI origin succeeds | ✅ pass |  |
| P17 | conditional request with the ETag → 304 (no recomputation); security headers present | ✅ pass |  |
