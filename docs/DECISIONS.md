# Architecture Decision Log

Format: **ID — Decision** · Context · Alternatives · Consequences.

**ADR-001 — Ingest to a Parquet snapshot; API never calls Elexon per request.**
Context: WINDFOR stores many forecast vintages per delivery interval; month-long vintage history is large
relative to a request, upstream may be slow/limited, hosting is ephemeral/free-tier. Alternatives: live proxy
per request (slow, fragile, rate-limit risk); SQL database (extra infrastructure with no clear benefit for a
single bounded month). Consequences: fast deterministic API, outage-resilient, reproducible demo; requires an
explicit ingest step and an honest "last refreshed" display.

**ADR-002 — Snapshot is committed to the repo and baked into the backend image (after real ingestion).**
Context: free hosts sleep and have ephemeral disks; January 2026 history is effectively immutable.
Consequences: hosted demo works without Elexon; data size must stay small (monitored); attribution required.

**ADR-003 — Pure domain layer, DataFrames in/out.** Highest-risk logic is unit-testable without HTTP or disk.

**ADR-004 — `merge_asof(by=startTime, direction='backward')` for vintage selection.**
Guarantees one forecast per delivery interval (no join explosion) and `publishTime <= cutoff` semantic via
`allow_exact_matches=True`; ties on identical publish times are removed before the join.

**ADR-005 — Default cutoff 09:20 Europe/London on D‑1, user-selectable.** Earliest GB day-ahead gate closure
=> leak-free for every GB day-ahead auction. See `02-DOMAIN-ASSUMPTIONS.md`.

**ADR-006 — `basis` parameter (`decision_date` default | `delivery_date`).** Resolves the brief's ambiguity
without mixing statistics. Both are served from one snapshot.

**ADR-007 — Signed error = forecast − actual.** Positive = over-forecast (shortfall risk for a buyer).

**ADR-008 — WAPE = Σ|e| / Σ actual, "unavailable" when Σ actual ≤ 0** (never 0, never infinity). MAPE is not
reported (undefined near zero wind).

**ADR-009 — Synthetic data only as a guarded dev snapshot.** Needed to build/QA the UI while Elexon is
unreachable from the build sandbox. Manifest `provenance="synthetic_dev"`; app refuses it when
`APP_ENV=production`; UI shows a persistent red banner; never committed to `data/snapshots/current`.

**ADR-010 — Frontend: Vite + React + TS strict + Tailwind v4 + Recharts + TanStack Query + React Router.**
TanStack Query gives caching/retry/loading states with little code; React Router gives linkable pages.
API types are generated from the backend OpenAPI document (`openapi-typescript`) so contract drift is a
compile error.

**ADR-011 — Analysis state lives in the URL** (basis, range, cutoff): shareable links, back button works,
KPI → table drill-down is just navigation.

**ADR-012 — Hosting: Vercel (frontend) + Docker web service (backend, e.g. Render).** Vercel's Python
runtime is size-constrained for pandas/pyarrow and stateless; a container keeps the same image used locally.
Free-tier cold start is handled by a "waking the API" UI state.

**ADR-013 — No database, no auth, no background scheduler in v1.** Out of scope; optional token-guarded refresh only.

**ADR-014 — Normalise every timestamp to `datetime64[ns, UTC]` at module boundaries.** pandas 3 parses ISO strings to
microsecond resolution and `merge_asof` rejects mixed units (and `.asi8` is unit-relative). One helper (`as_utc_ns`) is
used wherever timestamps enter the domain or snapshot layers. A regression here would silently break vintage selection.

**ADR-015 — Docker: no bind mount on the API service; snapshot baked into the image; tools run as the host user.**
The container is non-root (UID 10001); a root-owned host bind mount made it unable to write (found by running the real
stack). The vetted snapshot is data *about the build*, so it belongs in the image; `ingest`/`verify` are one-shot
`tools` profile services that write to `./data` as `HOST_UID`. Synthetic demo uses a tmpfs owned by the container user.

**ADR-016 — nginx fronts the SPA and proxies `/api` in Docker (single origin, no CORS); Vercel uses direct calls + CORS.**
`expires` (not `add_header`) is used for cache rules in locations, because a location-level `add_header` silently drops
server-level security headers. For Vercel, direct browser→API calls are preferred over a Vercel rewrite proxy, whose
timeout could be shorter than a free-tier cold start.

**ADR-017 — E2E runs on the synthetic snapshot and asserts invariants, not wind numbers.** It proves behaviour (sort
order, eligibility consistency between chart/table/summary, drill-downs, resilience, a11y) while remaining runnable
without network access. It is *not* evidence about real data.

**ADR-018 — Config hygiene.** `.env.example` has no inline comments after values (Compose parses `KEY=  # c` as
`KEY='# c'`, which once enabled the admin endpoint); a test guards this. `ADMIN_TOKEN` must be empty (disabled) or ≥ 16 chars.

**ADR-019 — Chart interaction goes through `activeIndexOf`.** Recharts 3 reports the active index as a *string*; unit tests
under jsdom cannot hit-test, so only the browser E2E layer catches this class of bug. Charts therefore never assume a numeric index.

**ADR-020 — Accessibility is enforced by tests (axe-core, WCAG 2.1 A/AA) rather than by intention.** Charts use an `sr-only`
text alternative instead of `role="img"` around a focusable SVG; scrolling regions are focusable and labelled; text colours
meet 4.5:1.
