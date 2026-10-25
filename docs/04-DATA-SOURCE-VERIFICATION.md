# 04 — Elexon Data-Source Verification

> **Status: verified live on 2026-10-25** with `python -m app.cli verify-upstream` (overall **PASS**) and
> a full `python -m app.cli ingest` of the January 2026 window. The raw evidence is committed:
> [`docs/generated/elexon-verification.md`](generated/elexon-verification.md) (observed fields, types, headers,
> measured facts, sample rows) and `backend/tests/fixtures/real/` (recorded real responses used by
> `tests/integration/test_real_recorded_responses.py`).
>
> Earlier revisions of this file listed everything as UNVERIFIED because the authoring sandbox could not reach
> Elexon. That is no longer true; the table below says what was **observed**, what comes from Elexon's own
> API description, and what is still an **assumption**.

Legend: **OBSERVED** = seen in a real response; **ELEXON DOC** = stated in Elexon's OpenAPI document
(<https://data.elexon.co.uk/swagger/v1/swagger.json>, read 2026-10-25); **ASSUMPTION** = not established by either.

## Checklist

| Item | Finding | Status |
|---|---|---|
| Base URL | `https://data.elexon.co.uk/bmrs/api/v1` answers HTTP 200 | OBSERVED |
| Authentication | None needed for the `stream` endpoints (requests carried no key) | OBSERVED |
| `FUELHH` request | `GET /datasets/FUELHH/stream?settlementDateFrom=…&settlementDateTo=…&fuelType=WIND` returns only WIND rows | OBSERVED |
| `FUELHH` fields | `dataset, fuelType, generation, publishTime, settlementDate, settlementPeriod, startTime` | OBSERVED |
| `FUELHH` meaning / unit | "average MW values over 30 minutes for each category" | ELEXON DOC (and magnitudes 7–15 GW are consistent with MW) |
| `FUELHH` `publishTime` | `startTime + 30 min` (the period's end) in 2,012 of 2,016 rows, so it mostly says nothing about real availability latency; four rows carry a later stamp (56, 86, 116 and 145 min after the start). The persistence baseline honours a later stamp (it is conservative); none of the four fell near a cutoff, so no result changed | OBSERVED |
| `WINDFOR` request | `GET /datasets/WINDFOR/stream?publishDateTimeFrom=…&publishDateTimeTo=…` (the window is on **publish** time) | OBSERVED |
| `WINDFOR` fields | `dataset, generation, publishTime, startTime` | OBSERVED |
| `WINDFOR` unit | The API description says only "wind generation forecast data". Magnitudes (3.8–17.4 GW in the probe) are consistent with MW and with FUELHH, but no unit is stated | **ASSUMPTION** (MW) |
| `WINDFOR` scope vs `FUELHH` WIND | Not stated in the API description (e.g. whether embedded wind is included). The forecast exceeds actuals by ~1.7 GW on average, which may be partly definitional | **UNKNOWN** — not claimed either way |
| Timestamp format | ISO-8601 UTC with `Z`, parseable in every row of both datasets | OBSERVED |
| Response envelope | Bare JSON array (no `data` wrapper) | OBSERVED |
| **Forecast resolution** | **Hourly**: `startTime` falls on `:00` in every row (mode of step = 60 min). FUELHH is half-hourly. See ADR-021 | **OBSERVED** |
| Which part of the hour a value represents | Not stated; the data cannot settle it (five candidate alignments differ by < 30 MW MAE because wind moves slowly) | **ASSUMPTION** — value applies to the hour starting at `startTime` |
| Publication cadence | 8 per day in January: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC (one 11:30 run appeared at 12:25). 272 distinct publications from 2025-12-30 to 2026-02-01 | OBSERVED |
| Horizon per publication | Up to 73 hourly rows: from about 25 h *before* the publication to about 66 h after it. Rows with `startTime` earlier than `publishTime` exist | OBSERVED |
| Publication vs the 09:20 cutoff | The latest publication at or before 09:20 is **always 07:30** (age 1.83 h); the next is **always 09:30**, ten minutes after the cutoff — on all 31 days | OBSERVED |
| History coverage, Jan 2026 | Complete: 1,536 / 1,536 half-hours of actuals and a forecast for every half-hour (hourly forecasts held) | OBSERVED |
| Duplicates / bad rows | None in this window (0 duplicates, 0 unparseable timestamps, 0 non-numeric values, 0 negatives) | OBSERVED |
| Rate limits | No rate-limit headers on responses; the full ingestion (about 5 s, a handful of requests) saw no 429. Behaviour under heavy load is unknown | OBSERVED (light use only) |
| DST behaviour | Not exercised by this data (January is all GMT). Handled and unit-tested in the code, not verified against real DST-day responses | **NOT VERIFIED** |

## What changed in the code because of what was observed

1. **Hourly forecasts.** The engine used to match a forecast to a half-hour only on an identical `startTime`,
   which would have left every `:30` half-hour without a forecast (50 % coverage). It now maps each half-hour
   to the forecast hour that contains it (`FORECAST_ALIGNMENT=hold`, default) or, with `exact`, leaves those
   half-hours missing. Nothing is interpolated either way. Details: ADR-021, `docs/02-DOMAIN-ASSUMPTIONS.md`.
2. The ingestion manifest records the measured forecast grid (`quality.forecast_profile.start_resolution_minutes`)
   and which blocks cover the window; the UI states the rule next to the numbers.
3. A contract test now runs the engine over a recorded real delivery day, so a change in the upstream shape
   fails a test instead of silently changing results.

## How the code defends against the remaining unknowns

1. **`elexon/endpoints.py`** is the only place that knows paths/parameter names.
2. **`elexon/contract.py`** checks required fields/types on the first response page and raises
   `UpstreamSchemaError` (surfaced to `/api/metadata` and the UI) instead of guessing.
3. **`elexon/normalize.py`** parses defensively (unknown extra fields ignored; bad rows counted by reason).
4. **`python -m app.cli verify-upstream`** re-checks all of the above against the live API on demand.
5. Units are stated in the manifest (`unit: "MW"`) and shown in the UI; the `WINDFOR` unit remains an assumption
   (listed above), and a conversion, if ever needed, would live in one function.

## Reproducing the verification

```bash
cp .env.example .env
make verify-upstream     # needs internet access to data.elexon.co.uk; rewrites docs/generated/
make ingest              # builds data/snapshots/current from the real API
```
