# 07 — Testing & quality evidence

Only things that were **actually run** are claimed. Counts are as of this commit and will drift; the commands are authoritative.

## Layers

| Layer | Tool | Count (at writing) | What it protects |
|---|---|---|---|
| Backend domain & ingestion unit tests | pytest | 238 | time/DST maths, cutoff rule, **rate limiter and response cache in isolation (burst, refill, per-client budgets, ETag/304, LRU bounds, stale-data protection)**, vintage selection, **hourly-forecast alignment (hold/exact, no look-ahead, no interpolation)**, matching, metric formulas, baselines (leakage, late publication), normalisation, retry/backoff, snapshot integrity, settings |
| Backend API + integration | pytest + FastAPI TestClient | 120 (100 API + 20 integration) | closed-form metrics through the API (also on an hourly-forecast snapshot), **decision-time sensitivity with closed-form answers per cutoff, cache + CORS isolation, pre-warm, rate limit, security headers**, validation & error envelope, CORS, empty/corrupt/synthetic-in-production states, admin guard, **mocked-Elexon → snapshot → API end-to-end** (half-hourly and hourly feeds), failure keeps previous snapshot, **contract tests on a recorded real Elexon delivery day** |
| Frontend logic & integration | Vitest + Testing Library | 98 | UK-time formatting incl. BST/DST, URL state, API client + error mapping, whole-app flows against a typed mock API, chart-index helper, decision-timing panel (lazy loading, reading text), **security headers kept identical across Vercel / nginx / dev preview** |
| End-to-end + accessibility | Playwright (Chromium) + axe-core | 48 | real browser vs real API + production build: drill-downs, interpretations, filters/sort/CSV, vintage invariants, API-down/slow/error/no-data, no horizontal overflow at 320–1280 px, keyboard use, WCAG 2.1 A/AA, **no CSP violation while using every page and chart** |
| Live acceptance (UAT) | Playwright library, `frontend/uat/` | 85 browser + 17 API | every control of the **deployed** site on real data, phone/tablet layouts, keyboard-only use; fails on console errors, failed requests and CSP violations (see `docs/11-UAT-REPORT.md`) |
| Static quality | ruff · mypy `--strict` · ESLint · Prettier · `tsc --strict` | – | style, types, hooks rules, generated-API-type drift (CI `contract` job) |
| Container smoke test | docker / compose | manual + CI `docker` job | image builds, non-root, health, nginx proxy, production-refuses-synthetic |

```bash
make test        # backend pytest + frontend Vitest
make lint        # ruff, mypy, eslint, prettier
make e2e         # Playwright (needs a Chromium; see PW_CHROMIUM_PATH in frontend/playwright.config.ts)
make check       # everything CI runs except e2e + docker
```

## Determinism

* No test calls the live Elexon API. Upstream behaviour is simulated with `httpx.MockTransport` (client tests, ingestion e2e), and
  `tests/integration/test_real_recorded_responses.py` replays **one real delivery day recorded from the live API** (`tests/fixtures/real/`).
* "Exact" fixtures have closed-form answers (actual 1000 MW; decision-time forecast 1100 MW; a *later* revision 1010 MW). A wrong
  vintage choice therefore produces a wrong **number** (MAE would be 10 instead of 100), not just a wrong flag.
* Fixtures are labelled *test data*; the synthetic dev snapshot is a separate, guarded artefact and is never used for evidence.

## Risk → test map

| Risk (from the brief) | Where it is tested |
|---|---|
| Forecast published after the cutoff must be excluded; exactly-at-cutoff included | `test_vintage.py`, `test_api_exact.py::test_headline_metrics_use_the_decision_time_forecast_not_the_latest_revision` |
| Revisions must not inflate the sample | `test_many_revisions_do_not_inflate_row_count`, `test_one_row_per_expected_interval_even_with_many_vintages` |
| Duplicate / out-of-order / malformed records, WIND-only filter | `test_normalize.py`, `test_ingestion_e2e.py` |
| Missing actuals / forecasts counted, never filled | `test_matching.py`, `TestMissingData` |
| Bias sign convention; WAPE with zero denominator; empty input | `test_metrics.py` |
| DST: 23/25-hour days, BST cutoffs, settlement periods | `test_timeutil.py`, `format.test.ts` |
| No leakage in baselines | `test_baselines_breakdowns_windows.py` (tampering with future actuals changes nothing) |
| Interpretation ambiguity never mixed | `test_api_exact.py::test_delivery_basis_is_a_distinct_window…`, `pages/DashboardPage.test.tsx` basis switch, e2e |
| Upstream outage keeps serving the old snapshot | `TestFailureKeepsServingPreviousSnapshot` |
| Synthetic data must never reach production | `TestProductionSafeguards`, container check |
| Corrupt snapshot refused | `test_corrupt_snapshot_is_refused_not_served`, `TestSnapshot` |
| `.env.example` must not enable the admin endpoint | `test_env_example.py` |
| Retry/backoff, `Retry-After`, 4xx not retried, partial fetch never accepted | `test_elexon_client.py` |
| Hourly forecasts vs half-hourly actuals: every half-hour scored, never interpolated, never borrows the next hour, cutoff applies to the held value | `test_forecast_alignment.py`, `test_api_hourly_forecasts.py`, `test_ingestion_e2e.py` (hourly feed) |
| Real-feed facts the rules depend on (hourly grid, eight publications, 07:30 in force and 09:30 ten minutes late at 09:20) | `test_real_recorded_responses.py` |
| An actual published late cannot inform the persistence baseline early | `test_baselines_breakdowns_windows.py` |
| A cached response is never stale after a refresh or a redeploy; `304` only for the same content | `test_response_cache.py`, `test_api_cache_and_security.py` |
| Cached responses never carry another origin's CORS headers | `test_cors_headers_belong_to_the_asking_origin_even_on_cached_responses` |
| One noisy client cannot starve others; health checks are never limited | `test_rate_limit.py`, `test_api_cache_and_security.py::TestRateLimit` |
| The decision-time sensitivity equals the headline at the chosen cutoff and the closed form at every other | `test_api_sensitivity.py` |
| The UI's CSP is strict, identical on Vercel / nginx / preview, and the app works under it | `security-headers.test.ts`, `security.spec.ts` |

## Mutation checks (do the tests have teeth?)

Done by hand (script-assisted), each mutation reverted afterwards; every one made ≥ 1 test fail:

| Mutation | Caught by |
|---|---|
| `allow_exact_matches=True → False` (cutoff-equal publication dropped) | `test_publication_exactly_at_cutoff_is_eligible` |
| `direction="backward" → "nearest"` (would use post-cutoff forecasts) | vintage + API tests |
| error = actual − forecast | matching + API tests |
| WAPE returns 0 when Σactual = 0 | metrics tests |
| trailing-mean baseline shifted by 1 day (uses D−1) | baseline tests |
| cutoff on delivery day instead of D−1 | timeutil tests |
| frontend: ignore delivery-basis day shift / carry range across bases / wrong sign | `pages/DashboardPage.test.tsx`, `format.test.ts` |
| forecast block rounded **up** instead of down (a half-hour would take the next hour's forecast) | at least 12 tests across `test_forecast_alignment.py` and `test_api_hourly_forecasts.py` (the run was truncated at 12) |
| persistence baseline ignores a late publication time | `test_an_actual_published_late_is_not_used_before_its_publication_time` |
| response cache key ignores the snapshot version (stale data after a refresh) | `test_a_new_snapshot_version_invalidates_everything`, `test_a_refreshed_snapshot_invalidates_cached_responses_and_etags` |
| rate limiter always lets requests through | 4 tests in `test_rate_limit.py` and `test_api_cache_and_security.py` |
| error responses stored in the cache | `test_errors_are_never_cached_and_are_marked_no_store`, `test_errors_and_non_analytics_endpoints_are_not_cached` |
| CSP loosened/tightened wrongly (stylesheets blocked) | `security.spec.ts` fails on the first `securitypolicyviolation` |

## Defects the test layers found (and which layer found them)

| Defect | Found by |
|---|---|
| naive vs unparseable timestamps mis-classified in the quality report | unit tests |
| verification tool crashed on the very schema-drift case it exists to report | unit tests |
| timeline/daily-chart click-through never fired (Recharts 3 reports the index as a *string*) | **Playwright** (jsdom cannot hit-test) |
| invalid ARIA (`role=img` around a focusable SVG); 2.6:1 text contrast; unreachable scroll regions | **axe-core** |
| page 25 px wider than a 320 px phone (an `sr-only` label inside a table scroller) | Playwright overflow matrix |
| bind-mounted `./data` root-owned vs non-root container (could not write) | running the real **Compose** stack |
| nginx `add_header` in a `location` silently dropped security headers | header check on every route type |
| `.env.example` inline comment made Compose set `ADMIN_TOKEN` to the comment text (enabling the endpoint) | cross-parser check → `test_env_example.py` |
| Intervals pager 1 px wider than a 320 px phone on GitHub's runner (passed locally: the app sets no font family, so the CI machine's wider fallback font exposed it) | **GitHub Actions** (first CI run), then reproduced locally with DejaVu Sans; now covered by the "wide fallback font" overflow tests |
| **WINDFOR is hourly**: the matcher joined on identical start times, so every `:30` half-hour would have had no forecast (50 % coverage on complete data) | **the first live `verify-upstream` / `ingest` run**; fixed by ADR-021, now covered by unit, API, ingestion and real-recording tests |
| The strict CSP refused the layout tests' injected `<style>` tag | the browser suite, as soon as the CSP was applied to the preview server: it works as intended, so those tests now bypass CSP in their own context |
| A below-the-fold panel is invisible to audits that never scroll to it (lazy loading) | reviewing what the axe/overflow tests actually see; they now reveal the whole page first |
| A formatting inconsistency (hyphen vs typographic minus in one sentence) and a bare "0 MW" for an identical forecast | writing the unit test for the plain-language reading |
| Dragging a timeline zoom handle and releasing over the plot counted as a click on the chart and **navigated away** to the Vintages page | **the live acceptance test** (jsdom cannot drag; the earlier e2e never dragged a handle); regression test added, fails without the fix |
| After zooming to a week the axis still read "9 Jan, 9 Jan, 10 Jan, 10 Jan" (label format chosen from the whole month) | the same acceptance run; e2e + unit tests added |
| The first whole-app Vitest test timed out intermittently (Testing Library's default one-second wait for the code-split dashboard) when the machine was busy; 2 of 3 parallel runs failed | noticed as a single red run after a heavy backend run, then reproduced on purpose by running the suite three times in parallel; the async wait is now 5 s and the test timeout 15 s (6 of 6 parallel runs pass) |
| FUELHH `publishTime` is not always the period end (4 of 2,016 rows were stamped up to 145 min later), so a fixed lag alone could let a late value into the baseline | checking the real snapshot; fixed by ADR-022 |

## Not covered / not run — be honest about these

* **The live Elexon API** (schema, parameters, units, history). Needs `make verify-upstream` on a connected machine.
* **GitHub Actions**: run 2 (`90c4fef`) failed one Playwright test (Intervals pager overflow at 320 px, see the defects table);
  runs 3, 5 and 9 passed all 5 jobs (run 9 includes the hardened-container Compose smoke test), and the CodeQL and dependency-audit workflows passed on their
  first run. CI's browser and Compose jobs use the synthetic snapshot, never Elexon data.
* Cross-browser (only Chromium), screen-reader testing with real assistive tech, load testing, and real cold-start timing on Render.
* The Playwright suite runs against the synthetic snapshot (hourly, like the real feed), so it proves behaviour and invariants, not real-data results. The real snapshot was additionally driven through the production build by hand (4 pages: 0 axe violations, no console errors); that run is not part of CI.
* DST days are covered by unit tests only: January data contains no clock change.
* The browser suite runs the preview server with the same-origin CSP; the Vercel CSP (which also allows the Render API host) is checked by a
  unit test against `vercel.json` (now one exact API origin, no wildcard) and, after each deploy, by loading the live site and listening for violations (none after the last deploy).
* The rate limiter and cache are tested in-process; behaviour behind the real platform proxies (client-IP headers) is reasoned about and
  documented (ADR-026) but not load-tested.
