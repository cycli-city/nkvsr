# 10 — Requirements traceability

Every requirement of the brief (as restated in [`00-PROJECT-CONTEXT.md`](00-PROJECT-CONTEXT.md) §3–§6), where it is implemented,
and what proves it. "Proof" names things that were **actually run**; "Not proven" says what is still an assumption or a user action.
Commands that reproduce the proof are in [`07-TESTING.md`](07-TESTING.md).

## 1. Business problem

| Requirement | Implemented in | Proof | Not proven |
|---|---|---|---|
| See the latest forecast available **when the day-ahead decision has to be made** | `backend/app/domain/vintage.py` (`select_at_cutoff`: latest publication with `publishTime <= cutoff` on D−1, per forecast block) · dashboard timeline + decision brief | `tests/unit/test_vintage.py`, `tests/unit/test_forecast_alignment.py`, `tests/api/test_api_exact.py` (closed form: the decision-time forecast gives MAE 100; wrongly using the *later* revision would give 10, so a wrong vintage fails on the number) · mutation checks (`<=`→`<`, `backward`→`nearest`) | Whether a real buyer's deadline is earlier than the 09:20 gate closure (stated as an upper bound in the UI) |
| **Quantify** the forecast's accuracy | `domain/metrics.py`, `domain/matching.py`, `services/analysis/` (`summary.py`, `accuracy.py`, `core.py`), executive summary + accuracy panels | `tests/unit/test_metrics.py`, `tests/api/test_api_exact.py` (hand-computed values), independent pandas cross-check (`docs/09` §4: bias identical to the decimal) | — |
| Say what the number is **not** | Methodology page, README §1/§16, banner text on the dashboard | `pages/MethodologyPage.test.tsx`, `pages.spec.ts` | — |

## 2. Hard scope limits

| Requirement | Implemented in | Proof |
|---|---|---|
| Elexon BMRS **only**, national **WIND** only | `backend/app/elexon/{endpoints,contract,normalize}.py` (FUELHH filtered to `fuelType = WIND` twice, upstream and client-side); no other data source in `pyproject.toml` / `package.json` | `tests/unit/test_normalize.py`, `tests/integration/test_ingestion_e2e.py`, recorded real responses (`tests/integration/test_real_recorded_responses.py`) |
| FUELHH fields `startTime`, `generation`; WINDFOR fields `startTime`, `publishTime`, `generation` | `elexon/contract.py` (schema), `docs/04-DATA-SOURCE-VERIFICATION.md` | `make verify-upstream` PASS against the live API on 2026-10-25 (`docs/generated/elexon-verification.md`) |
| **Real** data (or a transparent reason) | `data/snapshots/current/` — 2,016 actuals + 18,664 forecast rows, `provenance = elexon_live`, SHA-256 in the manifest | Live ingest 2026-10-25; the deployed API reports `elexon_live` and the same numbers as the committed snapshot |
| Synthetic data only in tests / a loud dev mode, never in production | `store/synthetic.py`, `store/dataset.py`, red banner in the UI | `TestProductionSafeguards`, container check (production refuses it), Playwright test for the banner |
| Purchase decisions made in **January 2026** (ambiguous) | `basis = decision_date` (default) and `delivery_date`, never mixed (`domain/windows.py`, ADR-006) | `test_api_exact.py::test_delivery_basis_is_a_distinct_window…`, `src/pages/*.test.tsx` basis switch, `dashboard.spec.ts` |
| Stack: React + TypeScript + Vite + Tailwind + Recharts; Python + FastAPI + Pydantic + pandas/numpy + httpx + pytest | `frontend/`, `backend/` | `tsc --strict`, `mypy --strict`, CI |
| Docker + Compose; Vercel for the UI and a Python host for the API | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `frontend/vercel.json`, `render.yaml` | Real containers built and run (health, non-root, read-only root); CI `docker` job; **live**: UI on Vercel and API on Render, checked anonymously (`docs/STATUS.md`) |

## 3. Acceptance criteria (`00-PROJECT-CONTEXT.md` §6)

| # | Criterion | Implemented in | Proof |
|---|---|---|---|
| 1 | Real data, or an explanation | See §2 above | Live verification + committed snapshot |
| 2 | **Publication time vs delivery time** clearly distinguished | Separate fields in every response (`start_time` = delivery interval, `forecast_publish_time` / `latest_publish_time` = publication); UI labels "published" vs "for"; vintages page; `docs/02` | `test_vintage.py`, `src/pages/*.test.tsx`, vintage Playwright invariants |
| 3 | Decision-time reconstruction, latest eligible, no duplicate inflation | `pd.merge_asof(by=block start, backward, allow_exact_matches=True)` | `test_many_revisions_do_not_inflate_row_count`, `test_one_row_per_expected_interval_even_with_many_vintages` |
| 4 | "Latest now" vs "available at the cutoff" never conflated | `forecast_mw` (decision time) and `latest_forecast_mw` (hindsight) are separate everywhere; hindsight is opt-in and labelled | `test_api_exact.py`, `dashboard.spec.ts` ("hindsight comparison is opt-in and clearly labelled"), the sensitivity panel labels later runs "Hindsight only" |
| 5 | MAE, RMSE, bias, WAPE, means, n, coverage, missing counts on **one eligible set**, tested | `domain/metrics.py`, `services/analysis/` (`summary.py`, `accuracy.py`, `core.py`) | `test_metrics.py` (sign convention, WAPE with zero denominator, empty input) · API closed-form tests · mutation checks |
| 6 | Breakdowns: delivery day, half-hour of day, day/night, error distribution, over/under, largest errors | `domain/breakdowns.py`, accuracy panel | `test_baselines_breakdowns_windows.py`, `src/pages/*.test.tsx`, `dashboard.spec.ts` |
| 7 | Baseline comparison **without leakage** | `domain/baselines.py` (persistence = last actual complete **and published** at the cutoff; trailing 7-day mean over D−8…D−2) | Tampering with future actuals changes nothing; an actual published late cannot inform the baseline early (`test_baselines_breakdowns_windows.py`) |
| 8 | Executive summary, timeline, accuracy analysis, interval explorer, vintage comparison, methodology | `frontend/src/pages/*`, `components/panels/*` | `dashboard.spec.ts`, `pages.spec.ts`, `src/pages/*.test.tsx` |
| 9 | Typed React frontend; FastAPI backend; OpenAPI docs; CORS restricted; timeouts + retries; bounded memory | `frontend/src/api/schema.d.ts` is **generated** from the backend's OpenAPI (CI `contract` job fails on drift); `/api/docs`; `CORS_ORIGINS` allow-list; `elexon/client.py` (connect/read timeouts, 4 retries with backoff, `Retry-After`); `MAX_RANGE_DAYS`, bounded cache/limiter tables, paged intervals | `test_api_errors_and_system.py` (CORS allow / deny / preflight; range limit), `test_elexon_client.py`, `test_response_cache.py` (LRU bounds) |
| 10 | Docker Compose runs locally; `.env.example`; CI | `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml` | Compose stack run for real (browser → nginx → API); `test_env_example.py`; CI green (see `docs/STATUS.md`) |
| 11 | README with the 17 required sections; demo script, tech walkthrough, recording guide | `README.md` §1–§17, `docs/08-DEMO-GUIDE.md` | Read against the brief; real numbers in the guide were produced by the engine |
| 12 | **AI assistance disclosed** | README §17 | — |
| 13 | Verified deployment links **or** exact instructions | README §15, `docs/06-DEPLOYMENT.md` | Anonymous browser checks of both URLs (28 checks) |

## 4. Deliverables

| Deliverable | State |
|---|---|
| Public GitHub repo, anonymous name `nkvsr`, README | Built. Authored history carries the repo owner's GitHub identity; **the two initial `main` commits and the PR merge commit carry the owner's e-mail address as author** (GitHub's "keep my email address private" setting only affects future commits; removing it from the past would need a history rewrite) |
| Deployment ("Vercel or Heroku") | **UI on Vercel; the Python API on Render** (free Docker service). This is a deliberate reading of the brief: Vercel's Python runtime is size-constrained and stateless for pandas/pyarrow (ADR-012) and Heroku has no free tier. Live and checked by 97 acceptance checks (`docs/11-UAT-REPORT.md`); the free tier sleeps (documented, the UI explains the wait) |
| ≤ 10-minute unlisted YouTube video (customer pitch + technical review) | **User action**: an exact scene-by-scene run sheet (tabs, clicks, narration, timings ≈ 8:21 in total) is in `docs/08-DEMO-GUIDE.md`; every Part 1 click was rehearsed on the live site |
| Submission form; incognito check of every URL | **User action** (checklist in `docs/08-DEMO-GUIDE.md` §9) |

## 5. Beyond the brief (and why)

| Addition | Why it earns its place |
|---|---|
| Hourly-forecast alignment (`hold` / `exact`), ADR-021 | **The live feed forced it**: WINDFOR is hourly, FUELHH half-hourly; a naive join would have scored only 50 % of intervals |
| Persistence availability = max(period end + lag, publish stamp), ADR-022 | 4 of 2,016 real actuals were stamped up to 145 min late; a fixed lag would have leaked them |
| "Does the decision time matter?" (`/api/cutoff-sensitivity`), ADR-028 | Answers the natural follow-up for a buyer: would waiting for a later run have helped? (Modestly: MAE −10 %, bias barely moves.) |
| Response cache + ETag + start-up pre-warm, ADR-024/025 | Every response is a pure function of (snapshot, query); results are served in milliseconds and a cold free-tier host is warm for the first visitor |
| Rate limit, security headers, strict CSP, hardened containers, Dependabot, CodeQL, dependency audits, `SECURITY.md`, ADR-026/027/029 | Project-level security that can be demonstrated, with its limits stated |
| Accessibility (axe WCAG 2.1 A/AA on every page) and a no-overflow matrix 320–1440 px (also under a wide fallback font) | Found real defects (see the defect table in `07-TESTING.md`) |

## 6. Known gaps (stated, not hidden)

* WINDFOR's **unit** (assumed MW) and **scope** relative to FUELHH WIND are not stated by Elexon; the +1.7 GW bias may be partly definitional (`docs/09` §2).
* Which part of the hour an hourly WINDFOR value describes is assumed to be the hour starting at `startTime`.
* January 2026 is entirely GMT: **DST handling is unit-tested only**.
* Cross-browser (only Chromium), real assistive-technology testing, load testing and real cold-start timing on the free tier were not done.
* Behaviour of the rate limiter behind each platform's proxy is reasoned about (ADR-026), not load-tested.
