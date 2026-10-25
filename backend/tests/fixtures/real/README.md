# Recorded real Elexon responses

These files are **real responses** from the Elexon BMRS Insights API (`https://data.elexon.co.uk/bmrs/api/v1`),
recorded on 2026-10-25, not synthetic data. They are Elexon data, used under the
[BMRS open data licence](https://www.elexon.co.uk/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/)
(attribution: "Contains BMRS data © Elexon Limited copyright and database right 2026").

| File | Query | Notes |
|---|---|---|
| `fuelhh_2026-01-15.json` | `GET /datasets/FUELHH/stream?settlementDateFrom=2026-01-15&settlementDateTo=2026-01-15&fuelType=WIND` | all 48 half-hours, unmodified |
| `windfor_for_2026-01-15.json` | `GET /datasets/WINDFOR/stream?publishDateTimeFrom=2026-01-14T00:00Z&publishDateTimeTo=2026-01-15T00:00Z` | **filtered** after download to rows whose `startTime` is on 2026-01-15 (192 of 584 rows) to keep the file small; rows themselves are unmodified |

Used by `tests/integration/test_real_recorded_responses.py`. Re-record with the two requests above if the
upstream shape ever changes; `python -m app.cli verify-upstream` reports such changes.

`fuelhh_sample.json` / `windfor_sample.json` (3-row samples) are rewritten by every `verify-upstream` run.
