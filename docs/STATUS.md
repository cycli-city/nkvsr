# Project Status & Hand-off Notes

_Update this file at the end of each work block. It is the first thing to read after `00-PROJECT-CONTEXT.md`._

## Current state

| Phase | State |
|---|---|
| 1 Data/domain validation | **Done.** `make verify-upstream` PASS against the live Elexon API (2026-10-25); real January 2026 data ingested and committed. Two findings changed the product: WINDFOR is **hourly** (ADR-021) and the 09:30 publication lands 10 min after the 09:20 cutoff on every day. Still assumptions: WINDFOR unit and scope, hour semantics. See `04-DATA-SOURCE-VERIFICATION.md`. |
| 2 Plan/architecture/docs | Done (docs 00-10, DECISIONS ADR-001…029; requirement-by-requirement proof in `10-REQUIREMENTS-TRACEABILITY.md`) |
| 3 Backend | **Done**: engine, ingestion, API, CLI, response cache + ETag, rate limit, security headers, pre-warm, decision-time sensitivity. 358 tests, ruff + mypy strict clean. |
| 4 Frontend | **Done**: dashboard (incl. "Does the decision time matter?"), intervals, vintages, methodology; strict CSP. 98 Vitest + 48 Playwright/axe tests + an 85-check (+17 API) live acceptance suite (`docs/11-UAT-REPORT.md`). |
| 5 Docker/CI/README | **Done**: images built/run, Compose verified (read-only, no capabilities), CI green on GitHub, CodeQL + dependency audit + Dependabot configured, README reflects real results. |
| 6 QA + demo kit | **Done**: browser-verified on the real snapshot (0 axe violations on 4 pages, no console errors); `08-DEMO-GUIDE.md` filled with real numbers; `09-REAL-DATA-FINDINGS.md`. |
| 7 Deploy + report | **Deployed and verified (2026-10-25)**: API on Render, UI on Vercel (see "Deployment" below); **merged to `main` via PR #1**, so the public repository shows the project. Remaining, user-side: literal incognito check of each URL, the video (run sheet in `docs/08`) and the form. |

## Open items needing the user

0a. **GitHub repository settings** (no tool in the build environment can change them; 2 minutes in the browser, or one command with the GitHub CLI):
   ```bash
   gh repo edit cycli-city/nkvsr \
     --description "Day-ahead wind forecast accuracy analytics for GB power procurement (Elexon FUELHH + WINDFOR). React + TypeScript, FastAPI + pandas, Docker." \
     --homepage "https://windscope-uk-sand.vercel.app" \
     --add-topic wind-power,energy,forecasting,elexon,fastapi,react,typescript,pandas,docker,data-visualization \
     --enable-wiki=false
   ```
   Also useful: *Settings → Code security*: enable private vulnerability reporting, Dependabot alerts and secret scanning; *Settings → General*: automatically delete head branches.
0. *(Done)* The project is on `main` (PR #1, merge commit `49d4288`); Render builds `main`.
1. **Incognito check** of the two URLs below (the owner disabled Vercel Authentication, which had put a login page in front of the UI). Then the **video** and the **form**.
2. **Video**: recording/upload is a user action; script, real numbers and checklist in `docs/08-DEMO-GUIDE.md`.
3. **Submission form** and incognito check of every URL (user action).
4. *(Optional, domain)* Ask Elexon/NESO whether WINDFOR covers the same scope as FUELHH WIND, and its unit; that would explain or rule out the +1.7 GW bias (`docs/09` §2).

Resolved earlier: the `git push` 403 (GitHub access reconnected) and the Elexon network block (host allowed).

## Deployment (done 2026-10-25 via the Render and Vercel APIs)

| Part | Where | State observed |
|---|---|---|
| API (Docker, free plan, Frankfurt) | <https://windscope-api-5joc.onrender.com> · service `srv-dbf3jjks728c73e07dgg` · builds branch `main` with auto-deploy (switched from the feature branch after PR #1 was merged) | deploy **live**; its log reads `Loaded snapshot (elexon_live): 2016 actuals, 18664 forecast rows`; health checks return 200; env `APP_ENV=production`, `AUTO_INGEST_ON_START=true`, `CORS_ORIGINS` = the two UI aliases below; the admin refresh endpoint is **disabled** (no `ADMIN_TOKEN`) |
| UI (Vite build uploaded with the Vercel CLI, no Git link) | <https://windscope-uk-sand.vercel.app> (a second production alias exists and is also allowed by the API's CORS list) · project `windscope-uk` | deployment **READY**, production target, aliases assigned, `VITE_API_BASE_URL` present in the build environment, normal Vite build log |

**Verified after the owner disabled Vercel Authentication and allowed the two domains** (script run from this environment with a fresh
Chromium profile, no cookies or storage; 28 checks, all pass): API `/api/health` (`data_loaded: true`), `/api/metadata` (`elexon_live`,
not synthetic), `/api/docs`, `/api/summary` equals the committed snapshot (n 1,488, MAE 2,042, bias +1,748); CORS allows both UI aliases
and refuses an arbitrary origin; `POST /api/admin/refresh` returns 404 (disabled); UI has no login wall, shows the real numbers, no
synthetic banner, the hourly-forecast note and the licence link, charts draw, `/intervals`, `/vintages?start=…` and `/methodology` load
on a hard refresh, switching the interpretation changes URL and numbers (to 2,145 MW) and a pasted URL restores the view, axe WCAG
2.1 A/AA reports 0 violations, security headers present, no horizontal scroll at 390 px on all four pages, no console errors or
failed requests. One check initially failed (numbers read before the slow free-tier API had answered); re-tested with a proper
wait: the numbers updated in 656 ms. This is **not literally incognito**: the owner still checks each URL in an incognito window.
Redeploying the UI: `cd frontend && npx vercel@65.2.0 deploy --prod --yes --scope <team> --build-env VITE_API_BASE_URL=<render url>`
(needs a Vercel token in `VERCEL_TOKEN`); the API redeploys itself on every push to the branch.

**Redeployed later the same day with the performance/security work** (UI via the Vercel CLI, API by the push). Checked again from a fresh
browser profile through the sandbox proxy, 13 checks, all passing: real numbers, no synthetic banner, the new "Does the decision time
matter?" panel loads when scrolled to (9 cutoffs, "Yours" on 09:20, reading quotes 2,042 and 1,830 MW), **no `securitypolicyviolation` on
any of the four pages under the live strict CSP**, axe WCAG 2.1 A/AA 0 violations with every panel revealed, no overflow at 390 px, no
console errors or failed requests. API: security headers and the new endpoint present; the dashboard's own first-load requests are
cache hits (`X-Cache: HIT`, ~0.25 s, the network round trip) right after start-up, an unseen cutoff costs ~0.3–1.0 s (decision-timing view ~3 s), and
a conditional request returns `304`. The Vercel CSP now allows exactly one cross-origin host, the API's (not `*.onrender.com`).

## Verified-by-execution log (only things actually run in this environment)

| Check | Result |
|---|---|
| `make verify-upstream` against the live API | **PASS** (FUELHH 48 rows, WINDFOR 876 rows); evidence in `docs/generated/elexon-verification.md` |
| `make ingest` (live, January 2026 window) | 2,016 actuals + 18,664 forecast rows in ~5 s; coverage 1,536/1,536 half-hours; snapshot committed |
| `pytest backend/tests` | 358 passed: 238 unit + 100 API + 20 integration (hourly-forecast alignment, middleware, cache/security, decision-time sensitivity, mocked-Elexon ingestion e2e, recorded-real-response contract tests) |
| `ruff check`, `ruff format --check`, `mypy app` (strict) | clean |
| Backend + frontend mutation checks | each deliberate bug caught (see `docs/07-TESTING.md`), incl. forecast-hour rounding and the publication-time rule |
| Engine vs an independent pandas calculation (hourly-mean comparison) | bias identical (+1,747.9 MW); MAE within 0.2 % |
| `tsc --noEmit` (strict), `eslint`, `prettier --check` | clean |
| OpenAPI document and generated TypeScript types vs backend | in sync |
| `vitest run` | 98 passed |
| `playwright test` (Chromium, production build, real API on the labelled synthetic snapshot) | 48 passed (incl. axe WCAG 2.1 A/AA on 4 pages with every lazy panel revealed, the wide-font overflow checks and a no-CSP-violation sweep of every page) |
| **Browser on the REAL snapshot** (API in `APP_ENV=production`, production UI build) | 4 pages: 0 axe violations, no console/network errors, no synthetic banner, figures match the engine |
| Responsive overflow matrix | no horizontal overflow at 320/390/768/1024/1280/1440 px on any page, also under a wide fallback font |
| `docker build` backend + web (sandbox-trust variant, see below) | built earlier; API image 691 MB, web image 75 MB (not rebuilt with the real snapshot locally; CI builds it) |
| Containers: non-root, healthy; prod refuses synthetic; dev loads it | confirmed earlier |
| `docker compose up` (synthetic override, prebuilt images) | both services healthy; browser -> nginx -> API verified; deep links work |
| YAML/JSON validation of CI, compose, render, vercel | valid |
| GitHub Actions run 2 (`90c4fef`) | 4 of 5 jobs passed; the Playwright job failed 1 test (`/intervals` 1 px wider than a 320 px viewport on the runner's wider fallback font). Reproduced locally, fixed, test added |
| GitHub Actions run 3 (`b78b322`) <https://github.com/cycli-city/nkvsr/actions/runs/40209280779> | **All 5 jobs passed** (Backend, Frontend, API contract, Docker + Compose smoke, Playwright + axe) |
| GitHub Actions run 4 (`fed7444`, docs only) and **run 5 (`3682682`, hourly-forecast handling + real snapshot)** <https://github.com/cycli-city/nkvsr/actions/runs/40214087088> | both succeeded; run 5: **all 5 jobs passed**, including the Docker build with the real snapshot baked into the API image |
| GitHub Actions **run 9 (`e8ccab6`, security + performance + decision-timing work)** <https://github.com/cycli-city/nkvsr/actions/runs/40220710921> | **All 5 jobs passed**, including the Compose smoke test on the hardened (read-only, no-capability) containers and 47 Playwright tests |
| **CodeQL** (Python + JavaScript/TypeScript, `security-extended`) <https://github.com/cycli-city/nkvsr/actions/runs/40220711135> and **Dependency audit** (`npm audit`, `pip-audit`) <https://github.com/cycli-city/nkvsr/actions/runs/40220710904> | both workflows ran on `e8ccab6` and succeeded (new workflows; first runs) |
| **Structural refactor** (PR #10, merge commit `c5a4874`): largest application module 259 lines (was about 1,000), one concern per module, a README in `backend/`, `frontend/` and `docs/` | Before merging: 358 backend tests, ruff + mypy strict clean, **OpenAPI document byte-identical** to before, 98 Vitest (14 files), 48 Playwright, eslint/tsc/prettier clean. On `main`: CI <https://github.com/cycli-city/nkvsr/actions/runs/40232619151> and CodeQL <https://github.com/cycli-city/nkvsr/actions/runs/40232619090> **succeeded**; Render live on `c5a4874`; UI redeployed from the same source. Live acceptance run afterwards: **85 of 85 browser + 17 of 17 API checks** (`docs/11-UAT-REPORT.md`). |

Runs after run 9 touch documentation and one CSP value (see "Deployment"); check the Actions tab of the repository for them.

**NOT verified:** WINDFOR unit and scope against FUELHH (assumed MW, scope unknown); which part of the hour an hourly value
describes; DST days on real data (January is all GMT: handled and unit-tested only); real cold-start timing on the free tier
(a cold wake-up was not timed); behaviour of the API under heavy load (the rate limiter and cache are tested in-process only).

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
* Working branch: `claude/zen-bohr-nfa0ly`; `main` is the default branch and holds the project since PR #1 (merged on the owner's request). After a merge, restart the working branch from `main`. No PR unless the user asks.
