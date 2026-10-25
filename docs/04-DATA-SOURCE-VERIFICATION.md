# 04 — Elexon Data-Source Verification

> **Status: live verification BLOCKED in the authoring environment.**
> `data.elexon.co.uk` and `bmrs.elexon.co.uk` are denied by the session's egress policy (HTTP 403 on
> CONNECT; DNS failure from the web-fetch tool). Everything below marked **UNVERIFIED** is a documented
> expectation, *not* an observation. Run `make verify-upstream` on a machine with internet access (or allow
> the host for the session): it records the real schema/behaviour into `docs/generated/` and
> `backend/tests/fixtures/real/`, after which this table should be updated.

## Checklist

| Item | Expected (source) | Status |
|---|---|---|
| Base URL | `https://data.elexon.co.uk/bmrs/api/v1` (Elexon Insights Solution; legacy BMRS was retired in 2024 — Modo changelog) | UNVERIFIED |
| Authentication | None believed required for dataset stream endpoints | UNVERIFIED |
| Stream endpoint behaviour | Lightweight JSON, "no restrictions or limits on data return" (Elexon developer portal text) | SOURCED |
| `FUELHH` fields | `startTime`, `generation`, `fuelType` (brief); also expected `publishTime`, `settlementDate`, `settlementPeriod`, `dataset` | brief-confirmed (3), others UNVERIFIED |
| `FUELHH` filter params | `settlementDateFrom`, `settlementDateTo`, `fuelType=WIND` | UNVERIFIED |
| `WINDFOR` fields | `startTime`, `publishTime`, `generation` (brief) | brief-confirmed |
| `WINDFOR` filter params | `publishDateTimeFrom`, `publishDateTimeTo` | UNVERIFIED |
| Units | MW (FUELHH = half-hourly average MW per Elexon glossary) | SOURCED (FUELHH) / UNVERIFIED (WINDFOR) |
| Timestamp format | ISO‑8601 UTC with `Z` | UNVERIFIED |
| Forecast resolution | Half-hourly (legacy WINDFOR hourly) | UNVERIFIED — detected at ingest |
| Forecast horizon / publish cadence | Unknown | UNVERIFIED — measured at ingest, reported in data-quality panel |
| Rate limits | Unknown | UNVERIFIED — client retries 429/5xx with backoff + `Retry-After` |
| History coverage for Jan 2026 | Presumed available (archive is multi-year) | UNVERIFIED |
| Response envelope | Stream: bare JSON array; non-stream: `{"data": [...]}` | UNVERIFIED — client accepts both |

## How the code defends against these unknowns

1. **`elexon/endpoints.py`** is the only place that knows paths/parameter names.
2. **`elexon/contract.py`** checks required fields/types on the first response page and raises
   `UpstreamSchemaError` (surfaced to `/api/metadata` and the UI) instead of guessing.
3. **`elexon/normalize.py`** parses defensively (unknown extra fields ignored; bad rows counted by reason).
4. **`python -m app.cli verify-upstream`** performs a small real request for each dataset and writes:
   observed field names/types, sample rows, timestamp format, resolution, publish cadence/horizon, duplicate
   counts, response headers (incl. rate-limit headers), and captures raw samples as test fixtures.
5. Units are asserted by name in the manifest (`unit: "MW"`) and shown in the UI; if verification contradicts
   this, the conversion lives in exactly one function (`normalize.to_mw`).

## Reproducing the verification

```bash
cp .env.example .env
make verify-upstream     # needs internet access to data.elexon.co.uk
make ingest              # builds data/snapshots/current from the real API
```
