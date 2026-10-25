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

**ADR-021 — Hourly forecasts are mapped onto half-hourly actuals explicitly, by a configurable rule (`FORECAST_ALIGNMENT`).**
*Context:* the first live check (2026-10-25) showed WINDFOR `startTime` on whole hours only, while FUELHH is half-hourly. The
original matcher joined on an identical `startTime`, which would have left every `:30` half-hour without a forecast (50 %
coverage, "insufficient data" on a dataset that is in fact complete). *Decision:* `hold` (default) applies each forecast hour to
both half-hours it covers; `exact` keeps the strict join (half missing). Neither interpolates, neither looks ahead, both apply
the publication cutoff to the held value, and the hindsight series uses the same block. The block length is derived from the
measured grid (`quality.forecast_profile.start_resolution_minutes`) and restricted to 30 or 60 minutes. Every analysis response
states the rule (`forecast_alignment`, `forecast_block_minutes`, a plain-language note), the UI shows it next to the numbers and on
the Methodology and Vintages pages, and the CSV export names the forecast hour each row used. *Alternatives rejected:* averaging
actuals to hours (changes the unit of analysis away from settlement periods, which the half-hour breakdowns need); interpolating
a `:30` forecast (invents a number). *Consequence:* *n* counts half-hours that come in pairs sharing one forecast, so the effective
sample is about half of *n*; stated in the docs. Measured impact on January 2026: headline MAE moves by under 1 % between `hold`,
`exact` and an independent hourly-mean calculation (docs/09). *Open assumption:* which part of the hour a value describes is not
stated by Elexon and cannot be inferred from the data.

**ADR-022 — A recorded publication time can only delay an actual's availability, never advance it.** FUELHH rows are normally
stamped at the period end (2,012 of 2,016), so the stamp says little about real latency, but four were stamped up to 145 minutes
later. The persistence baseline treats an actual as available at `max(period end + lag, publishTime)`: conservative by construction,
and it removes the need to trust the stamp when it is early.

**ADR-023 — Contract tests run on a recorded real delivery day.** `backend/tests/fixtures/real/` holds one day of real FUELHH and
WINDFOR responses (with provenance and the exact queries). `test_real_recorded_responses.py` pins the facts the rules depend on
(hourly grid, the eight publication times, 07:30 in force and 09:30 ten minutes late at the 09:20 cutoff). It asserts properties of
a frozen recording, not promises about the future; `verify-upstream` is the live check.

**ADR-024 — Analytics responses are cached as rendered bytes and revalidated with ETags (`ResponseCacheMiddleware`).** Every analytics
body is a pure function of (snapshot, settings, query), so keeping the compressed JSON skips pandas, Pydantic and gzip on repeat requests, and
`If-None-Match` is answered with `304` without running anything. Keys include a version made of the snapshot fingerprint, the analysis
settings and a per-process id (so a refresh or a redeploy can never yield a stale `304`). Bounded to 256 entries / 32 MB (LRU); only HTTP 200
is stored, errors are `no-store`; the middleware sits *inside* CORS so cached responses carry the asking origin's CORS headers and the cache
never stores them. *Alternatives rejected:* caching Python objects only (still pays serialisation); an external cache (new infrastructure for
a 120 KB dataset); `max-age` only (no way to revalidate cheaply). *Measured motivation* (Render free plan, 2026-10-25, `curl` from the build sandbox through its proxy, a handful of requests per view, so indicative rather than a benchmark): an uncached
response took ~0.3–1.0 s (summary ~0.9 s, time series 0.6–1.0 s, accuracy 0.3–0.7 s) and ~3.1 s for the decision-timing view, against ~0.25 s for a cached response,
which is the same as `/api/health`, i.e. the network round trip. After a start-up pre-warm the dashboard's own first-load requests were all cache hits (`X-Cache: HIT`).

**ADR-025 — Start-up pre-warm of the default dashboard views.** After the snapshot loads, a background task requests the dashboard's first-load
URLs for both readings of "January" through the real ASGI stack, populating the cache before the first visitor. It is best-effort (failures are
logged and ignored) and does not delay health checks. Below-the-fold analysis (decision timing) is loaded by the browser only when scrolled near,
so it never competes with the first-load requests on a slow server.

**ADR-026 — Per-client rate limiting in the application, with an explicit trust trade-off.** A token bucket (default 300 requests/min, burst 60)
protects the CPU of a small host from one noisy client; health checks and CORS preflights are exempt; `0` disables. The client key is the first
`X-Forwarded-For` hop (else the socket peer). That can be spoofed to evade *a client's own* limit but cannot be used to exhaust anyone else's; the
alternative (right-most hop) would put all users in one bucket on a platform with two proxies, turning a protection into an outage. Network-level
abuse is left to the edge (Render sits behind Cloudflare). Documented in `SECURITY.md`.

**ADR-027 — A strict Content-Security-Policy for the UI, tested in a real browser.** `default-src 'self'; script-src 'self'; style-src 'self'`
with no `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`, and `connect-src` limited to `'self'` (plus, on Vercel, the exact origin of
the deployed API: no wildcard, so it must be changed in `csp.ts` and `vercel.json` if the API is deployed under another name). The policy is defined once (`frontend/csp.ts`), applied to the Vite preview server used by the browser tests (so a policy that
breaks the app fails CI, and a spec fails on any `securitypolicyviolation`), and a unit test keeps `vercel.json` and `nginx.conf.template` identical
to it. The API sends a deny-all CSP except on its Swagger page, plus `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and
HSTS (over HTTPS). *Cost:* tests that inject a `<style>` tag (wide-font layout) must bypass CSP in their own context.

**ADR-028 — Decision-time sensitivity as a first-class view (`/api/cutoff-sensitivity`).** The brief makes the decision cutoff the central
assumption, so the product shows how much it matters: the same analysis with only the cutoff moved to each regular publication run (a run is a
publication time seen on ≥ 25 % of days, which keeps one-off releases out). Each point reuses the exact selection rule, window and eligible set of
the headline KPIs, and the selected point equals the headline (tested). Later runs are labelled hindsight. The narrative sentences are generated
from the numbers and never assert a cause.

**ADR-029 — Compose services run least-privilege.** Read-only root filesystem with explicit tmpfs scratch space, all capabilities dropped,
`no-new-privileges`. The one-shot `ingest`/`verify` tools write to bind mounts and are excluded.

