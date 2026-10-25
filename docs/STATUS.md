# Project Status & Hand-off Notes

_Update this file at the end of each work block. It is the first thing to read after `00-PROJECT-CONTEXT.md`._

## Current state

| Phase | State |
|---|---|
| 1 Data/domain validation | **Partially blocked** — Elexon hosts denied by sandbox egress policy. Domain assumptions written. |
| 2 Plan/architecture/docs | Done (docs 00–04, DECISIONS) |
| 3 Backend | **Done** (engine, ingestion, API, CLI, 242 tests) — live-Elexon behaviour still unverified |
| 4 Frontend | not started |
| 5 Docker/CI/README | not started |
| 6 QA + demo kit | not started |
| 7 Deploy + report | not started (needs user credentials; vercel.com unreachable from sandbox) |

## Open blockers needing the user

1. **Elexon access** — allow `data.elexon.co.uk` (and ideally `bmrs.elexon.co.uk`) in the environment's
   Network access settings, *or* run `make verify-upstream && make ingest` locally and commit
   `data/snapshots/current/`.
2. **Deployment** — Vercel + Render accounts/credentials (user action).
3. **Video** — recording/upload is a user action; scripts + guide are prepared.

## Verified-by-execution log (only things actually run)

_Only things actually executed and observed in this environment:_

| Date (sandbox) | Check | Result |
|---|---|---|
| 2026-10-25 | `pytest backend/tests` | **242 passed** |
| 2026-10-25 | `ruff check` / `ruff format --check` | clean |
| 2026-10-25 | `mypy app` (strict) | no issues, 32 files |
| 2026-10-25 | Mutation checks (flip `<=`→`<`, `backward`→`nearest`, error sign, trailing-mean lag) | each caught by ≥1 test |
| 2026-10-25 | API run against **synthetic dev** snapshot: all endpoints, error envelopes, CORS allow/deny, admin guard, CSV | behaved as specified |
| 2026-10-25 | Ingestion end-to-end through a **mocked** Elexon transport → Parquet snapshot → API | closed-form metrics reproduced |

**NOT verified (cannot be from this sandbox):** anything involving the live Elexon API — real field names beyond
the three in the brief, query-parameter names, units, forecast resolution/cadence/horizon, rate limits, whether
January 2026 history is available. See `04-DATA-SOURCE-VERIFICATION.md`.

## Environment facts

* Python 3.13, Node 22, uv, Docker 29 (daemon must be started manually: `nohup dockerd &`), Playwright+Chromium available.
* PyPI / npm / GitHub API / Docker Hub reachable. Elexon, Vercel not.
* Working branch: `claude/zen-bohr-nfa0ly` (never push elsewhere). No PR unless the user asks.
