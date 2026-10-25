# 01 — Implementation Plan

Effort budget: ~16 h equivalent. Priority = **correct, verifiable, end-to-end** over breadth.

## Phases

| Phase | Output | Exit criteria |
|---|---|---|
| 1. Validate data & domain | `04-DATA-SOURCE-VERIFICATION.md`, `02-DOMAIN-ASSUMPTIONS.md` | Every upstream assumption marked VERIFIED / UNVERIFIED; interpretation decisions written down |
| 2. Plan & architecture | `01`, `03`, `DECISIONS.md`, `STATUS.md` | Module map + API contract fixed |
| 3. Backend engine | `backend/` with tests | `pytest` green; `ruff` + `mypy` clean; every domain rule from the brief has a test |
| 4. Frontend | `frontend/` | `tsc`, `eslint`, `vitest`, `vite build` green; every panel driven by real API responses |
| 5. Packaging & docs | Dockerfiles, Compose, CI, README, `.env.example`, deploy configs | `docker compose up` works and the UI talks to the API |
| 6. QA & demo kit | Playwright pass, bug fixes, `10-DEMO-GUIDE.md` | Screenshots reviewed; empty/error states exercised |
| 7. Deploy & report | Public URLs (if credentials allow) | URLs opened & verified, otherwise exact instructions |

## Build order inside the backend (risk-first)

1. `domain/timeutil.py` — London-local day/interval maths incl. DST (everything depends on it).
2. `domain/vintage.py` — decision cutoff + latest-eligible selection (`merge_asof`, no join explosion).
3. `domain/matching.py`, `domain/metrics.py`, `domain/baselines.py`, `domain/breakdowns.py`.
4. `elexon/normalize.py` + `contract.py` — parsing, dedupe, quality report (tested with deterministic JSON).
5. `elexon/client.py` — chunked, retried, timeout-bounded httpx client (tested with `httpx.MockTransport`).
6. `store/` — Parquet snapshot + manifest + refresh state; synthetic dev generator (guarded).
7. `services/analysis/` (one module per endpoint) and API routers/schemas; error handling; CORS.
8. CLI: `ingest`, `verify-upstream`, `generate-synthetic-dev`, `export-openapi`.

## Frontend build order

1. Tooling (Vite, TS strict, Tailwind v4, ESLint, Vitest), design tokens, layout shell.
2. Generated API types (`openapi-typescript`) + thin typed client + TanStack Query hooks.
3. URL-synchronised analysis state (basis, range, cutoff) so views are shareable/linkable.
4. Panels: provenance bar → KPI summary → timeline → decision brief → accuracy → interval explorer → vintages → methodology.
5. States: loading skeletons, empty, upstream-down, API cold-start ("waking the server"), schema-mismatch.

## Definition of done (per feature)

Typed → tested → documented → visible in UI with units → failure state designed.
