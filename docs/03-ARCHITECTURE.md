# 03 — Architecture

## System overview

```mermaid
flowchart LR
  subgraph Elexon["Elexon Insights (BMRS) API — read only"]
    FH["/datasets/FUELHH/stream (WIND)"]
    WF["/datasets/WINDFOR/stream"]
  end

  subgraph Backend["FastAPI backend (Python)"]
    CL["elexon.client\nhttpx · timeouts · retries · chunking"]
    NZ["elexon.normalize + contract\nvalidate · dedupe · quality report"]
    ST[("Snapshot store\nParquet + manifest.json\n(bounded, in-memory view)")]
    DOM["domain\ntimeutil · vintage · matching\nmetrics · baselines · breakdowns"]
    SV["services.analysis"]
    API["api routers + Pydantic schemas\n/api/* · OpenAPI"]
  end

  subgraph Frontend["React + TS + Tailwind (Vite)"]
    QC["typed API client\n(openapi-typescript) + TanStack Query"]
    UI["Dashboard · Intervals · Vintages · Methodology"]
  end

  FH --> CL
  WF --> CL
  CL --> NZ --> ST
  ST --> SV
  DOM --> SV --> API --> QC --> UI
```

## Key design decisions (see `DECISIONS.md` for rationale)

* **Ingest once, serve from a snapshot.** Elexon is only contacted by the ingestion pipeline (CLI, optional
  startup auto-ingest, or token-guarded refresh endpoint). Request handlers never call Elexon. This keeps the
  API fast, deterministic, immune to upstream outages, and bounded in memory. The snapshot is labelled with
  provenance + retrieval time; if a refresh fails the app keeps serving the last good snapshot and says so.
* **Pure domain layer.** `app/domain/*` has no I/O and no FastAPI imports: DataFrames/arrays in, results out.
  This is where the correctness risk lives, so it is exhaustively unit-tested with deterministic fixtures.
* **One adapter for upstream specifics.** Dataset names, parameter names, chunk sizes and field contracts live
  in `app/elexon/endpoints.py` and `contract.py`. If the live schema differs from the documentation-based
  assumptions, the fix is confined to those files and the contract check fails loudly (never silently).
* **UTC everywhere internally**, `Europe/London` only at the edges (delivery-day grouping, cutoff
  construction, UI formatting).
* **Decision-time vs hindsight kept separate** in every response: `forecast_mw` (eligible at cutoff) and
  `latest_forecast_mw` (latest published, hindsight) are distinct fields; metrics use the former only.

## Backend module map

```
backend/app/
  main.py            app factory, lifespan (load snapshot), CORS, exception handlers
  config.py          pydantic-settings (env-driven)
  errors.py          typed application errors → consistent JSON error envelope
  domain/            timeutil · vintage · matching · metrics · baselines · breakdowns · windows
  elexon/            endpoints · client · normalize · contract
  store/             snapshot (parquet+manifest) · dataset (in-memory view) · synthetic (dev only)
  services/          analysis (query → results) · ingestion (fetch→normalise→persist)
  api/               schemas · deps · routes/*
  cli.py             ingest · verify-upstream · generate-synthetic-dev · export-openapi
```

## API surface

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness + whether a dataset is loaded |
| `GET /api/metadata` | Provenance, snapshot manifest, last refresh/attempt, bases + windows, cutoff presets, units, thresholds |
| `GET /api/summary` | Executive KPIs: metrics, coverage, data-quality status, baseline skill, over/under split |
| `GET /api/timeseries` | Per-interval forecast (at cutoff) / latest forecast / actual / error |
| `GET /api/accuracy` | Breakdowns: daily, by settlement period, day/night, histogram, largest errors |
| `GET /api/intervals` | Paginated, sortable, filterable interval table (+ CSV export) |
| `GET /api/forecast-vintages` | All publications for one delivery interval + selected-at-cutoff marker |
| `GET /api/decision-brief` | The forecast set visible at one decision cutoff for the next delivery day |
| `POST /api/admin/refresh` | Token-guarded re-ingest (disabled unless `ADMIN_TOKEN` set) |

Common query parameters: `basis` (`decision_date`|`delivery_date`), `from`, `to` (dates in the basis' date
type), `cutoff` (`HH:MM` Europe/London). Errors: `{"error": {"code", "message", "details"}}`.

## Frontend structure

```
frontend/src/
  api/         client.ts · schema.d.ts (generated) · hooks.ts
  state/       analysis params in URL (basis, from, to, cutoff)
  components/  layout · ui primitives · charts · tables · states
  pages/       Dashboard · Intervals · Vintages · Methodology
  lib/         formatting (UK time, MW) · errors
```

## Deployment topology

```
Vercel (static Vite build)  ──HTTPS──▶  Render/other (Docker, FastAPI + committed Parquet snapshot)
                                              └─(optional, off by default)─▶ Elexon API
```

The snapshot is baked into the backend image, so the hosted demo never depends on Elexon being reachable and
never serves anything but labelled, previously retrieved data.
