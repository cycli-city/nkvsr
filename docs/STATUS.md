# Project Status & Hand-off Notes

_Update this file at the end of each work block. It is the first thing to read after `00-PROJECT-CONTEXT.md`._

## Current state

| Phase | State |
|---|---|
| 1 Data/domain validation | **Done.** `make verify-upstream` PASS against the live Elexon API (2026-10-25); real January 2026 data ingested and committed. Two findings changed the product: WINDFOR is **hourly** (ADR-021) and the 09:30 publication lands 10 min after the 09:20 cutoff on every day. Still assumptions: WINDFOR unit and scope, hour semantics. See `04-DATA-SOURCE-VERIFICATION.md`. |
| 2 Plan/architecture/docs | Done (docs 00-09, DECISIONS ADR-001…023) |
| 3 Backend | **Done**: engine, ingestion, API, CLI. 298 tests, ruff + mypy strict clean. |
| 4 Frontend | **Done**: dashboard, intervals, vintages, methodology. 75 Vitest + 43 Playwright/axe tests. |
| 5 Docker/CI/README | **Done**: images built/run, Compose verified (on synthetic data), CI green on GitHub (run 3), README reflects real results. |
| 6 QA + demo kit | **Done**: browser-verified on the real snapshot (0 axe violations on 4 pages, no console errors); `08-DEMO-GUIDE.md` filled with real numbers; `09-REAL-DATA-FINDINGS.md`. |
| 7 Deploy + report | **Not done**: needs the user's Vercel/Render accounts; `docs/06-DEPLOYMENT.md` is the runbook. |

## Open items needing the user

1. **Deployment**: Vercel + Render accounts (user action). Runbook: `docs/06-DEPLOYMENT.md`. README §15 URLs stay "not deployed yet" until opened and verified in incognito.
2. **Video**: recording/upload is a user action; script, real numbers and checklist in `docs/08-DEMO-GUIDE.md`.
3. **Submission form** and incognito check of every URL (user action).
4. *(Optional, domain)* Ask Elexon/NESO whether WINDFOR covers the same scope as FUELHH WIND, and its unit; that would explain or rule out the +1.7 GW bias (`docs/09` §2).

Resolved earlier: the `git push` 403 (GitHub access reconnected) and the Elexon network block (host allowed).

## Verified-by-execution log (only things actually run in this environment)

| Check | Result |
|---|---|
| `make verify-upstream` against the live API | **PASS** (FUELHH 48 rows, WINDFOR 876 rows); evidence in `docs/generated/elexon-verification.md` |
| `make ingest` (live, January 2026 window) | 2,016 actuals + 18,664 forecast rows in ~5 s; coverage 1,536/1,536 half-hours; snapshot committed |
| `pytest backend/tests` | 298 passed (unit, API incl. hourly-forecast API tests, mocked-Elexon ingestion e2e incl. an hourly feed, recorded-real-response contract tests) |
| `ruff check`, `ruff format --check`, `mypy app` (strict) | clean |
| Backend + frontend mutation checks | each deliberate bug caught (see `docs/07-TESTING.md`), incl. forecast-hour rounding and the publication-time rule |
| Engine vs an independent pandas calculation (hourly-mean comparison) | bias identical (+1,747.9 MW); MAE within 0.2 % |
| `tsc --noEmit` (strict), `eslint`, `prettier --check` | clean |
| OpenAPI document and generated TypeScript types vs backend | in sync |
| `vitest run` | 75 passed |
| `playwright test` (Chromium, production build, real API on the labelled synthetic snapshot) | 43 passed (incl. axe WCAG 2.1 A/AA on 4 pages and the wide-font overflow checks) |
| **Browser on the REAL snapshot** (API in `APP_ENV=production`, production UI build) | 4 pages: 0 axe violations, no console/network errors, no synthetic banner, figures match the engine |
| Responsive overflow matrix | no horizontal overflow at 320/390/768/1024/1280/1440 px on any page, also under a wide fallback font |
| `docker build` backend + web (sandbox-trust variant, see below) | built earlier; API image 691 MB, web image 75 MB (not rebuilt with the real snapshot locally; CI builds it) |
| Containers: non-root, healthy; prod refuses synthetic; dev loads it | confirmed earlier |
| `docker compose up` (synthetic override, prebuilt images) | both services healthy; browser -> nginx -> API verified; deep links work |
| YAML/JSON validation of CI, compose, render, heroku, vercel | valid |
| GitHub Actions run 2 (`90c4fef`) | 4 of 5 jobs passed; the Playwright job failed 1 test (`/intervals` 1 px wider than a 320 px viewport on the runner's wider fallback font). Reproduced locally, fixed, test added |
| GitHub Actions run 3 (`b78b322`) <https://github.com/cycli-city/nkvsr/actions/runs/40209280779> | **All 5 jobs passed** (Backend, Frontend, API contract, Docker + Compose smoke, Playwright + axe) |

Runs after run 3 are not recorded here until observed; check the Actions tab of the repository.

**NOT verified:** WINDFOR unit and scope against FUELHH (assumed MW, scope unknown); which part of the hour an hourly value
describes; DST days on real data (January is all GMT: handled and unit-tested only); Vercel/Render deployment; real cold-start
timings; Heroku config; behaviour of Elexon under heavy load (rate limits were not stressed).

## Environment facts / recipes (for resuming in a fresh sandbox)

* Python 3.13 (project supports >=3.11; image uses 3.12), Node 22.22, uv, Docker 29, Playwright + Chromium preinstalled.
* PyPI / npm / GitHub API / Docker Hub reachable. `data.elexon.co.uk` and `bmrs.elexon.co.uk` became reachable once the
  environment's network policy allowed them (earlier they returned 403 on CONNECT); `www.elexon.co.uk` (docs site) and Vercel are not.
* **Docker daemon must be started manually:** `nohup dockerd > /tmp/claude-0/dockerd/dockerd.log 2>&1 &`
* **Docker builds in this sandbox** need `--network host` AND the sandbox CA (TLS interception). Never commit this:
  copy `/root/.ccr/ca-bundle.crt` to `.sandbox-ca.crt` (gitignored; also into `frontend/`), generate throw-away Dockerfile
  variants by inserting `COPY .sandbox-ca.crt /etc/sandbox-ca.crt` + `ENV PIP_CERT=... SSL_CERT_FILE=...` (python) or
  `NODE_EXTRA_CA_CERTS=...` (node) after the builder `FROM`, build with `docker build --network host -f <variant> ...`,
  then delete the CA copies. Bridge networking/iptables do not work: run containers with `--network host`, or reach
  Compose containers by IP.
* **Playwright:** the pinned `@playwright/test` wants a newer Chromium build than preinstalled; run with
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium E2E_PYTHON=backend/.venv/bin/python npx playwright test`.
* **Shell gotcha:** `pkill -f "<pattern>"` kills its own shell if the command text contains the pattern (exit 144). Use the
  `[u]vicorn` trick and never put the pattern text in the same command as a heredoc containing it.
* **Fonts matter for layout tests:** the app sets no font family, so CI's fallback font is wider than this sandbox's Inter; the
  wide-font overflow tests (DejaVu Sans) guard against that.
* Working branch: `claude/zen-bohr-nfa0ly` (never push elsewhere). No PR unless the user asks.
