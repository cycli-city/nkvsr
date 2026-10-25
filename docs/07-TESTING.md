# 07 — Testing & quality evidence

Only things that were **actually run** are claimed. Counts are as of this commit and will drift; the commands are authoritative.

## Layers

| Layer | Tool | Count (at writing) | What it protects |
|---|---|---|---|
| Backend domain & ingestion unit tests | pytest | 176 | time/DST maths, cutoff rule, vintage selection, matching, metric formulas, baselines (leakage), normalisation, retry/backoff, snapshot integrity, settings |
| Backend API + integration | pytest + FastAPI TestClient | 72 (62 API + 10 ingestion e2e) | closed-form metrics through the API, validation & error envelope, CORS, empty/corrupt/synthetic-in-production states, admin guard, **mocked-Elexon → snapshot → API end-to-end**, failure keeps previous snapshot |
| Frontend logic & integration | Vitest + Testing Library | 68 | UK-time formatting incl. BST/DST, URL state, API client + error mapping, whole-app flows against a typed mock API, chart-index helper |
| End-to-end + accessibility | Playwright (Chromium) + axe-core | 39 | real browser vs real API + production build: drill-downs, interpretations, filters/sort/CSV, vintage invariants, API-down/slow/error/no-data, no horizontal overflow at 320–1280 px, keyboard use, WCAG 2.1 A/AA |
| Static quality | ruff · mypy `--strict` · ESLint · Prettier · `tsc --strict` | – | style, types, hooks rules, generated-API-type drift (CI `contract` job) |
| Container smoke test | docker / compose | manual + CI `docker` job | image builds, non-root, health, nginx proxy, production-refuses-synthetic |

```bash
make test        # backend pytest + frontend Vitest
make lint        # ruff, mypy, eslint, prettier
make e2e         # Playwright (needs a Chromium; see PW_CHROMIUM_PATH in frontend/playwright.config.ts)
make check       # everything CI runs except e2e + docker
```

## Determinism

* No test calls the live Elexon API. Upstream behaviour is simulated with `httpx.MockTransport` (client tests, ingestion e2e).
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
| Interpretation ambiguity never mixed | `test_api_exact.py::test_delivery_basis_is_a_distinct_window…`, `app.test.tsx` basis switch, e2e |
| Upstream outage keeps serving the old snapshot | `TestFailureKeepsServingPreviousSnapshot` |
| Synthetic data must never reach production | `TestProductionSafeguards`, container check |
| Corrupt snapshot refused | `test_corrupt_snapshot_is_refused_not_served`, `TestSnapshot` |
| `.env.example` must not enable the admin endpoint | `test_env_example.py` |
| Retry/backoff, `Retry-After`, 4xx not retried, partial fetch never accepted | `test_elexon_client.py` |

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
| frontend: ignore delivery-basis day shift / carry range across bases / wrong sign | `app.test.tsx`, `format.test.ts` |

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

## Not covered / not run — be honest about these

* **The live Elexon API** (schema, parameters, units, history). Needs `make verify-upstream` on a connected machine.
* **GitHub Actions** has not executed the workflow (the push was blocked); each job's commands were run locally, and the YAML validated.
* Cross-browser (only Chromium), screen-reader testing with real assistive tech, load testing, and real cold-start timing on Render.
* The Playwright suite runs against the synthetic snapshot, so it proves behaviour and invariants, not real-data results.
