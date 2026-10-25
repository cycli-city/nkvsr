# Backend: FastAPI + pandas analytics API

Serves the decision-time forecast analysis from a checksummed Parquet snapshot of Elexon FUELHH and WINDFOR data. Request
handlers never call Elexon; only the ingestion CLI does.

```bash
make setup           # from the repository root: virtualenv + dependencies
make dev             # API on a clearly-labelled SYNTHETIC snapshot (no network needed)
make api             # API on the real snapshot in data/snapshots/current
make test-backend    # pytest (358 tests); `make lint` adds ruff + mypy --strict
```

Interactive docs at `http://localhost:8000/api/docs`; configuration is environment-driven (`../.env.example`, README section 12).

## Layout (`app/`)

| Path | Responsibility | Knows about |
|---|---|---|
| `domain/` | **Pure analytics**, no I/O: time zones, cutoff rule, forecast vintages, matching, metrics, baselines, breakdowns | pandas only |
| `elexon/` | The **only** upstream-aware code: endpoints, schema contract, retrying HTTP client, normalisation | httpx |
| `store/` | Snapshot read/write with SHA-256 manifest, the in-memory `Dataset`, guarded synthetic dev data | Parquet |
| `services/analysis/` | Turns a validated request into a typed response; **one module per endpoint** (see its `__init__.py` map) | `domain`, `store`, `api.schemas` |
| `services/` | `ingestion` (fetch, validate, atomically swap the snapshot), `verification` (probe the live API), `prewarm` | `elexon`, `store` |
| `api/routes/` | Thin FastAPI routers (`analysis`, `system`) and `deps.py` (parameter validation into a `Ctx`) | `services` |
| `api/schemas/` | Pydantic response models by endpoint family: the contract the UI's TypeScript types are generated from | pydantic |
| `api/middleware/` | Pure-ASGI `rate_limit`, `response_cache` (ETag/304), shared helpers | starlette |
| `main.py`, `config.py`, `errors.py`, `cli.py` | App factory and security headers, settings, error envelope, `python -m app.cli` | everything |

Dependencies point downward: `domain` imports nothing from the rest of the app, which is why the risky logic is unit-testable without HTTP or disk.

## One request, end to end

`GET /api/summary?basis=…&from=…&to=…&cutoff=09:20` → `routes/analysis.py` → `deps.py` resolves and validates the window into a `Ctx` →
`AnalysisService.summary` → `services/analysis/summary.py` takes the cached matched table from `core.py` (built by `domain.matching`
using `domain.vintage.select_at_cutoff`) → computes metrics with `domain.metrics` → returns `api.schemas.SummaryResponse`. The response cache
middleware stores the rendered bytes keyed on the snapshot version.

## Where do I change…?

| I want to… | Touch |
|---|---|
| add or change a metric | `domain/metrics.py` (+ its test), a field in `api/schemas/`, the endpoint module in `services/analysis/`, then `make openapi` |
| add an endpoint | route in `api/routes/analysis.py`, models in `api/schemas/`, `services/analysis/<name>.py` + a method on `service.py`, add its path to `CACHEABLE_PATHS` in `main.py` if it is a pure function of the snapshot |
| change the cutoff presets or the sort/filter vocabulary | `services/analysis/constants.py` |
| change how forecasts are chosen at the cutoff | `domain/vintage.py` (read ADR-004 and ADR-021 first) |
| add a setting | `config.py`, `../.env.example`, the README table (`tests/unit/test_env_example.py` guards the example file) |
| follow an upstream schema change | `elexon/endpoints.py`, `elexon/contract.py`, `elexon/normalize.py`; run `make verify-upstream` |

## Tests (`tests/`)

| Folder | What | Notes |
|---|---|---|
| `unit/` | domain rules, metric formulas, normalisation, client retries, rate limiter and response cache, settings, snapshot integrity | closed-form fixtures: a wrong vintage gives a wrong *number* |
| `api/` | the real app through `TestClient`: exact metrics, errors, CORS, caching and headers, hourly forecasts, decision-time sensitivity | |
| `integration/` | mocked-Elexon to snapshot to API, and contract tests on one **recorded real delivery day** (`fixtures/real/`) | no test calls the live Elexon API |

Conventions: `None` means "unavailable", never zero; error is `forecast − actual`; everything is UTC internally and London time only at the edges.
