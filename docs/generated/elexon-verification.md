# Elexon live verification (generated)

* Run at: `2026-10-25T16:52:51.215032+00:00`
* Base URL: `https://data.elexon.co.uk/bmrs/api/v1`
* Probe delivery day: `2026-01-15`
* Overall: **PASS**

Everything below was *observed in a real response*. Update `docs/04-DATA-SOURCE-VERIFICATION.md` from these facts, and adjust `app/elexon/endpoints.py` / `contract.py` if anything differs.

## FUELHH

* Request: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?settlementDateFrom=2026-01-15&settlementDateTo=2026-01-15&fuelType=WIND`
* HTTP status: `200`
* Envelope: bare array
* Records: 48
* Fields observed: `dataset, fuelType, generation, publishTime, settlementDate, settlementPeriod, startTime`
* Field types (first record): `{"dataset": "str", "fuelType": "str", "generation": "int", "publishTime": "str", "settlementDate": "str", "settlementPeriod": "int", "startTime": "str"}`
* startTime is ISO-8601 UTC 'Z': `True`
* Headers: `{"date": "Sun, 25 Oct 2026 16:52:51 GMT", "content-type": "application/json; charset=utf-8", "content-encoding": "gzip"}`
* Rate-limit headers: `{}`
* Measured facts:
  * `startTime_min`: `2026-01-15 00:00:00+00:00`
  * `startTime_max`: `2026-01-15 23:30:00+00:00`
  * `generation_min`: `7183.0`
  * `generation_max`: `14602.0`
  * `generation_median`: `9774.5`
  * `unparseable_startTime`: `0`
  * `non_numeric_generation`: `0`
  * `distinct_fuelType`: `['WIND']`
  * `startTime_step_minutes_mode`: `30.0`
  * `duplicate_startTime`: `0`
  * `has_publishTime`: `True`
* Sample records:

```json
[
  {
    "dataset": "FUELHH",
    "publishTime": "2026-01-16T00:00:00Z",
    "startTime": "2026-01-15T23:30:00Z",
    "settlementDate": "2026-01-15",
    "settlementPeriod": 48,
    "fuelType": "WIND",
    "generation": 7407
  },
  {
    "dataset": "FUELHH",
    "publishTime": "2026-01-15T23:30:00Z",
    "startTime": "2026-01-15T23:00:00Z",
    "settlementDate": "2026-01-15",
    "settlementPeriod": 47,
    "fuelType": "WIND",
    "generation": 7258
  },
  {
    "dataset": "FUELHH",
    "publishTime": "2026-01-15T23:00:00Z",
    "startTime": "2026-01-15T22:30:00Z",
    "settlementDate": "2026-01-15",
    "settlementPeriod": 46,
    "fuelType": "WIND",
    "generation": 7431
  }
]
```

## WINDFOR

* Request: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=2026-01-14T00%3A00Z&publishDateTimeTo=2026-01-15T12%3A00Z`
* HTTP status: `200`
* Envelope: bare array
* Records: 876
* Fields observed: `dataset, generation, publishTime, startTime`
* Field types (first record): `{"dataset": "str", "generation": "int", "publishTime": "str", "startTime": "str"}`
* startTime is ISO-8601 UTC 'Z': `True`
* Headers: `{"date": "Sun, 25 Oct 2026 16:52:51 GMT", "content-type": "application/json; charset=utf-8", "content-encoding": "gzip"}`
* Rate-limit headers: `{}`
* Measured facts:
  * `startTime_min`: `2026-01-13 21:00:00+00:00`
  * `startTime_max`: `2026-01-17 21:00:00+00:00`
  * `generation_min`: `3775.0`
  * `generation_max`: `17353.0`
  * `generation_median`: `9114.5`
  * `unparseable_startTime`: `0`
  * `non_numeric_generation`: `0`
  * `distinct_publishTime`: `12`
  * `publishTime_min`: `2026-01-14 02:30:00+00:00`
  * `publishTime_max`: `2026-01-15 09:30:00+00:00`
  * `publish_cadence_minutes_median`: `180.0`
  * `startTime_step_minutes_mode`: `60.0`
  * `lead_time_hours_min`: `-25.5`
  * `lead_time_hours_median`: `23.5`
  * `lead_time_hours_max`: `66.5`
  * `rows_per_start_median`: `12.0`
  * `published_after_start`: `158`
* Sample records:

```json
[
  {
    "dataset": "WINDFOR",
    "publishTime": "2026-01-15T09:30:00Z",
    "startTime": "2026-01-14T21:00:00Z",
    "generation": 16732
  },
  {
    "dataset": "WINDFOR",
    "publishTime": "2026-01-15T09:30:00Z",
    "startTime": "2026-01-14T22:00:00Z",
    "generation": 17022
  },
  {
    "dataset": "WINDFOR",
    "publishTime": "2026-01-15T09:30:00Z",
    "startTime": "2026-01-14T23:00:00Z",
    "generation": 16903
  }
]
```

## Units

The responses carry no unit field. Confirm in the Elexon documentation that `generation` is MW (FUELHH: half-hourly average MW) and compare magnitudes above against national wind capacity (a few thousand to ~15,000). Record the confirmation in `docs/04-DATA-SOURCE-VERIFICATION.md`.
