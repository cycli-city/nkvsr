# Data snapshots

`current/` holds the **real Elexon snapshot** served by the API (Parquet + `manifest.json`).
It is produced by `make ingest` (or `python -m app.cli ingest`) on a machine that can reach
`data.elexon.co.uk`, then committed so hosted deployments never depend on Elexon being reachable.

| File | Meaning |
|---|---|
| `current/actuals.parquet` | FUELHH national WIND outturn (`start_utc`, `actual_mw`, `actual_publish_utc`) |
| `current/forecasts.parquet` | every WINDFOR publication (`start_utc`, `publish_utc`, `forecast_mw`) |
| `current/manifest.json` | provenance, retrieval time, query parameters, row counts, data-quality report, SHA-256 checksums |

* Synthetic development data is **never** written here (see `make synthetic`, which writes to `data/dev/`, git-ignored).
* The API verifies the checksums at start-up and refuses a tampered or partial snapshot.
* Data licence/attribution: *Contains BMRS data © Elexon Limited copyright and database right.*
