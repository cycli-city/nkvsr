# Project Status & Hand-off Notes

_Update this file at the end of each work block. It is the first thing to read after `00-PROJECT-CONTEXT.md`._

## Current state

| Phase | State |
|---|---|
| 1 Data/domain validation | **Partially blocked**: Elexon hosts denied by the sandbox egress policy. Domain assumptions written; `verify-upstream` tool built and unit-tested against a mock transport, **never run live**. |
| 2 Plan/architecture/docs | Done (docs 00-08, DECISIONS) |
| 3 Backend | **Done**: engine, ingestion, API, CLI. 252 tests, ruff + mypy strict clean. |
| 4 Frontend | **Done**: dashboard, intervals, vintages, methodology. 68 Vitest + 39 Playwright/axe tests. |
| 5 Docker/CI/README | **Done** except real CI execution: images built, run, and Compose stack verified (on synthetic data); README complete. |
| 6 QA + demo kit | QA largely done (browser-verified); `docs/08-DEMO-GUIDE.md` written. Final full re-run + delivery report pending. |
| 7 Deploy + report | **Not done**: needs the user's Vercel/Render accounts; `docs/06-DEPLOYMENT.md` is the runbook. |

## Open blockers needing the user

0. **`git push` is denied (HTTP 403)**: "Claude doesn't have GitHub access to cycli-city/nkvsr". Reads work
   (`git ls-remote`, GitHub MCP), writes do not. Fix: install the Claude GitHub App on the repository
   (<https://github.com/apps/claude/installations/select_target>) or reconnect GitHub at
   <https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1>. Until then all work is committed
   locally on `claude/zen-bohr-nfa0ly` only (remote has just `main`). A `git bundle` backup is produced at milestones.
   (Pushing `.github/workflows/*` additionally needs the `workflow` permission.)
1. **Elexon access**: allow `data.elexon.co.uk` for the session, *or* run `make verify-upstream && make ingest` on a
   connected machine and commit `data/snapshots/current/` + `docs/generated/` + `backend/tests/fixtures/real/`.
2. **Deployment**: Vercel + Render accounts (user action). Runbook: `docs/06-DEPLOYMENT.md`.
3. **Video**: recording/upload is a user action; script + checklist in `docs/08-DEMO-GUIDE.md`.

## Verified-by-execution log (only things actually run in this environment)

| Check | Result |
|---|---|
| `pytest backend/tests` | 252 passed (180 unit, 62 API, 10 mocked-Elexon ingestion e2e) |
| `ruff check`, `ruff format --check`, `mypy app` (strict) | clean |
| Backend + frontend mutation checks | each deliberate bug caught (see `docs/07-TESTING.md`) |
| `tsc --noEmit` (strict), `eslint`, `prettier --check` | clean |
| `vitest run` | 68 passed |
| `playwright test` (Chromium, production build, real API on synthetic data) | 39 passed (incl. axe WCAG 2.1 A/AA on 4 pages) |
| Responsive overflow matrix | no horizontal overflow at 320/390/768/1024/1280/1440 px on any page |
| `docker build` backend + web (sandbox-trust variant, see below) | built; API image 691 MB, web image 75 MB |
| Containers: non-root, healthy; prod refuses synthetic; dev loads it | confirmed |
| `docker compose up` (synthetic override, prebuilt images) | both services healthy; browser -> nginx -> API verified; deep links work |
| YAML/JSON validation of CI, compose, render, heroku, vercel | valid |

**NOT verified (cannot be from this sandbox):** anything involving the live Elexon API (real field names beyond the three
in the brief, parameter names, units, forecast resolution/cadence/horizon, rate limits, whether Jan 2026 history exists);
GitHub Actions execution; Vercel/Render deployment; real cold-start timings; Heroku config.

## Environment facts / recipes (for resuming in a fresh sandbox)

* Python 3.13 (project supports >=3.11; image uses 3.12), Node 22.22, uv, Docker 29, Playwright + Chromium preinstalled.
* PyPI / npm / GitHub API / Docker Hub reachable. Elexon, Vercel, bmrs.elexon.co.uk are not.
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
* Working branch: `claude/zen-bohr-nfa0ly` (never push elsewhere). No PR unless the user asks.
