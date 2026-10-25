# 05 — API reference

Interactive docs: `GET /api/docs` (Swagger UI) · machine-readable: `GET /api/openapi.json` (also exported to
`frontend/openapi.json`, from which the frontend's TypeScript types are generated).

All endpoints are `GET` except the optional refresh. Responses are JSON (`/api/intervals/export` is CSV), gzip-compressed
above 1 KB. Timestamps are ISO-8601 UTC (`…Z`); delivery *dates* are UK local calendar dates. Values that cannot be defined
are `null` ("unavailable") — never `0`.

## Common analysis parameters

Used by `summary`, `timeseries`, `accuracy`, `cutoff-sensitivity`, `intervals`, `intervals/export`.

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `basis` | `decision_date` \| `delivery_date` | `DEFAULT_BASIS` (`decision_date`) | How "January" is read. `from`/`to` are in this basis' own date type. |
| `from`, `to` | `YYYY-MM-DD` (inclusive) | the full analysis month | Must lie inside the analysis month and span ≤ `MAX_RANGE_DAYS`. |
| `cutoff` | `HH:MM` (Europe/London) | `DECISION_CUTOFF_LOCAL` (`09:20`) | Decision cutoff on the day before delivery. |

Every response that depends on these echoes them back in `analysis` (`decision_from/to`, `delivery_from/to`, `cutoff_local`,
`forecast_basis = "decision_time"`, `error_convention = "forecast_minus_actual"`) so a number can never be separated from the
interpretation that produced it.

## Endpoints

| Endpoint | Purpose | Notable fields |
|---|---|---|
| `GET /api/health` | Liveness | `status`, `version`, `data_loaded` |
| `GET /api/metadata` | Provenance and everything the UI needs to be honest: works with **no** dataset loaded | `data_available`, `load_error`, `refresh{status,last_attempt_at,last_success_at,error}`, `provenance{provenance,is_synthetic,source_name,retrieved_at,unit,attribution}`, `sources[]`, `bases[]`, `default_cutoff`, `cutoff_presets[]`, `thresholds`, `quality`, `warnings[]` |
| `GET /api/summary` | Executive KPIs | `coverage{expected,matched,missing_*,coverage}`, `data_status{status,message}`, `metrics{n,mae_mw,rmse_mw,bias_mw,wape,mean_*}`, `error_distribution`, `baselines[]`, `hindsight_latest`, `forecast_age` |
| `GET /api/timeseries` | One point per *expected* half-hour (gaps are `null`, never filled) | `start_time`, `actual_mw`, `forecast_mw` (at cutoff), `forecast_publish_time`, `latest_forecast_mw` (hindsight), `error_mw`, `match_status` |
| `GET /api/accuracy` | Breakdowns | `daily[]`, `by_slot[]` (48 UK wall-clock slots), `by_daypart[]` (day 07–23 / night), `histogram`, `error_distribution`, `largest_errors[]` |
| `GET /api/intervals` | Paginated explorer | + `page` (≥1), `page_size` (1–500), `sort_by` (`start_time`·`forecast`·`actual`·`error`·`abs_error`·`publish_time`·`forecast_age`), `sort_dir`, `status` (`all`·`matched`·`missing_any`·`missing_forecast`·`missing_actual`·`missing_both`), `direction` (`over`·`under`), `min_abs_error`, `q` (date/time/weekday/status search) |
| `GET /api/intervals/export` | The same filtered table as CSV (no paging) | header includes `error_mw_forecast_minus_actual` |
| `GET /api/cutoff-sensitivity` | The accuracy analysis repeated with only the cutoff moved: one point per regular WINDFOR publication run (times seen on ≥ 25 % of days) plus the selected cutoff | `run_times_local[]`, `points[]{cutoff_local,is_selected,is_run_time,run_used_local,n,coverage,mae_mw,rmse_mw,bias_mw,wape,median_forecast_age_h}`, `note` |
| `GET /api/forecast-vintages?start=<ISO with tz>&cutoff=` | Every stored publication for one half-hour | `vintages[]{publish_time,forecast_mw,lead_time_h,minutes_from_cutoff,eligible,selected}`, `selected`, `latest`, `explanation` (why a comparison cannot be shown) |
| `GET /api/decision-brief?decision_date=&cutoff=` | The forecast set visible at the cutoff for the *next* delivery day | `forecast_set{n_with_forecast,distinct_publications,first/last_publish_time,mean_mw,peak_*,trough_*,energy_mwh}`, `hindsight`, `points[]` |
| `POST /api/admin/refresh` | Re-ingest from Elexon. **Disabled (404) unless `ADMIN_TOKEN` is set**; requires header `X-Admin-Token` | `retrieved_at`, row counts, `warnings[]` |

## Caching, conditional requests and limits

The analytics endpoints (`summary`, `timeseries`, `accuracy`, `cutoff-sensitivity`, `intervals`, `intervals/export`,
`forecast-vintages`, `decision-brief`) are **pure functions of the snapshot and the query string**, so they are cached:

| Header | Meaning |
|---|---|
| `ETag: W/"…"` | Derived from (snapshot, settings, process, path, canonical query). Send it back as `If-None-Match` and an unchanged resource answers **`304`** *without running the endpoint*. |
| `Cache-Control: public, max-age=300` | Browsers may reuse a response for `BROWSER_CACHE_SECONDS` (default 300; `0` → `no-cache`, still revalidated by ETag). Errors are `no-store`. |
| `X-Cache: MISS \| HIT \| HIT-304` | Whether the server rendered the body, replayed it from memory, or answered a conditional request. For diagnostics. |

A new snapshot (a refresh) or a restart changes the ETag, so a client can never be told "304" for stale data. The cache holds at
most 256 rendered bodies / 32 MB (least-recently-used). `/api/metadata` and `/api/health` are never cached.

**Rate limit:** `RATE_LIMIT_PER_MINUTE` (default 300, burst 60) per client, keyed on the first `X-Forwarded-For` hop; beyond it the API
answers `429` with `{"error":{"code":"rate_limited",…}}` and `Retry-After` (CORS headers included so a browser can read it). `/api/health`
and CORS preflights are exempt; `0` disables it.

**Response headers on every API response:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, a deny-all `Content-Security-Policy` (not on the Swagger page, which loads
its script from a CDN) and, over HTTPS, `Strict-Transport-Security`.

## Errors

Every non-2xx response has the same shape, so clients need one handler:

```json
{ "error": { "code": "invalid_request", "message": "Range 2025-12-01..2026-01-05 is outside the analysis window …", "details": null } }
```

| HTTP | `code` | When |
|---|---|---|
| 429 | `rate_limited` | the client exceeded `RATE_LIMIT_PER_MINUTE`; honour `Retry-After` |
| 422 | `invalid_request` | bad parameter, reversed/oversized/out-of-window range, bad cutoff, unaligned `start` |
| 404 | `not_found` | unknown route; interval outside the loaded delivery coverage |
| 404 | `admin_disabled` | refresh endpoint called while `ADMIN_TOKEN` is unset |
| 401 | `unauthorized` | missing/wrong `X-Admin-Token` |
| 503 | `data_unavailable` | no valid snapshot loaded; `details.remedy` says how to fix it |
| 502 | `upstream_error` / `ingestion_failed` | refresh failed; the **previous snapshot keeps being served** |
| 500 | `internal_error` | unexpected; details are logged, not leaked |

## Behavioural guarantees (each backed by a test)

* KPIs use `publishTime ≤ cutoff` forecasts only; `latest_*` fields are hindsight and never enter a metric.
* One row per expected half-hour, however many forecast revisions exist.
* CORS allows only `CORS_ORIGINS`; other origins get no CORS headers (preflight → 400).
* A tampered or partial snapshot is refused (SHA-256 manifest check), and a failed refresh never replaces a good snapshot.
* `APP_ENV=production` refuses a snapshot whose provenance is `synthetic_dev`.

## Example (shape only — illustrative numbers, not results)

```bash
curl 'http://localhost:8000/api/summary?basis=decision_date&from=2026-01-05&to=2026-01-11&cutoff=09:20'
```
```jsonc
{
  "analysis": { "basis": "decision_date", "decision_from": "2026-01-05", "delivery_from": "2026-01-06", "cutoff_local": "09:20", … },
  "data_status": { "status": "sufficient", "message": "…" },
  "coverage": { "expected": 336, "matched": 336, "coverage": 1.0, … },
  "metrics": { "n": 336, "mae_mw": 0.0, "rmse_mw": 0.0, "bias_mw": 0.0, "wape": 0.0, … },
  "baselines": [ { "key": "persistence", "skill": 0.0, … }, { "key": "trailing_mean", … } ],
  "hindsight_latest": { "mae_mw": 0.0, "note": "… not available to the buyer at decision time …" }
}
```
