# 09 — What the real January 2026 data shows

Every number below was produced by this repository's own engine from the **real Elexon snapshot** committed in
`data/snapshots/current/` (retrieved **2026-10-25 16:44 UTC**, FUELHH + WINDFOR, `provenance = elexon_live`).
Nothing here is synthetic. Numbers can move slightly if the snapshot is re-ingested (Elexon may revise data).

Reproduce any figure:

```bash
make api                                   # then, in another shell:
curl -s "http://localhost:8000/api/summary?basis=decision_date&cutoff=09:20" | jq .metrics
curl -s "http://localhost:8000/api/accuracy" | jq .by_daypart
```

Defaults used unless stated: basis `decision_date` (decisions 1–31 Jan → deliveries 2 Jan–1 Feb, 31 days,
**n = 1,488 half-hours**), cutoff 09:20 UK on D−1, `FORECAST_ALIGNMENT=hold`. Error = forecast − actual; positive =
over-forecast (less wind than predicted).

## 1. Headline accuracy

| Metric | Decision basis (2 Jan–1 Feb) | Delivery basis (1–31 Jan) |
|---|---|---|
| n (half-hours matched) / coverage | 1,488 / 100 % | 1,488 / 100 % |
| MAE | **2,042 MW** | 2,145 MW |
| RMSE | 2,509 MW | 2,616 MW |
| Bias (forecast − actual) | **+1,748 MW** (over-forecast) | +1,852 MW |
| WAPE (Σ\|e\| / Σ actual) | 18.1 % | 18.5 % |
| Mean forecast / mean actual | 13,031 / 11,284 MW | 13,433 / 11,581 MW |
| Hindsight: *latest* forecast MAE / bias | 1,667 / +1,486 MW | 1,772 / +1,597 MW |
| Baseline: persistence at cutoff — MAE (forecast's MAE is lower by) | 4,144 MW (**50.7 %**) | 4,140 MW (48.2 %) |
| Baseline: trailing 7-day mean — MAE (forecast's MAE is lower by) | 4,414 MW (**53.7 %**) | 4,432 MW (51.6 %) |

The two readings of "decisions made in January" differ by about 5 % in MAE, which is why both are offered and
never mixed. The forecast clearly beats both naive baselines. It is also **consistently too high**.

## 2. The forecast over-predicts, in 85 % of half-hours

* Over-forecast in **1,261 of 1,488** half-hours (84.7 %); under-forecast in 227. Mean miss when too high:
  **+2,236 MW**; when too low: −964 MW. Largest over-forecast **+6,894 MW**; largest under-forecast −3,835 MW.
* Signed error percentiles: P05 −1,105 · P50 **+1,592** · P95 +5,310 MW. Absolute error: median 1,688 · P90 4,140 MW.
* Only 4 of 31 delivery days had a negative bias (5, 10, 14 and 19 January; −56, −86, −84 and −730 MW).
* Night (23:00–07:00) is worse than day: MAE 2,263 vs 1,932 MW, bias +2,185 vs +1,529 MW.
* Worst days (all over-forecast): 28 Jan (MAE 5,375 MW), 12 Jan (4,868), 11 Jan (4,802). Best: 19 Jan (743),
  16 Jan (801), 9 Jan (851).
* Largest single misses are all on 12 Jan between 00:00 and 02:30: e.g. 01:00 forecast **20,942 MW** vs actual 14,048 MW.

**How to read this (and what not to).** For the wind component alone, a buyer who sized day-ahead purchases from this
forecast would have found less wind than expected in most half-hours. A bias of ~1.7 GW is about 15 % of mean
output, which is large. Two explanations cannot be separated with this data: (a) a genuine forecast bias in this
month, and (b) a **definition mismatch** between the two datasets — Elexon describes FUELHH as generation
connected to the transmission system from operational metering, and does not say whether WINDFOR covers the same
scope (e.g. embedded wind). Even the *latest* forecast is 1.5 GW high, which is why (b) is plausible, but it is
not proven. The honest next step is to ask Elexon/NESO for WINDFOR's definition and to repeat the analysis over
more months. This is wind forecast error only, not a procurement quantity: demand, other supply and contracted
positions are outside the data.

## 3. Cutoff sensitivity (the 09:30 publication)

WINDFOR is published eight times a day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC). On **all 31
days** the latest run at or before 09:20 is the 07:30 one (age 1.83 h) and the next run, 09:30, lands ten minutes
*after* the cutoff.

| Cutoff (UK, D−1) | Run used | MAE (MW) | RMSE (MW) | Bias (MW) | WAPE |
|---|---|---|---|---|---|
| 08:00 – 09:29 (incl. default **09:20**) | 07:30 | 2,042.0 | 2,509.1 | +1,747.9 | 18.1 % |
| 09:30 – 11:00 (incl. N2EX preset 09:50) | 09:30 | 2,016.3 | 2,510.2 | +1,729.9 | 17.9 % |

So the conclusion is **robust** to the exact gate-closure time: every cutoff in 08:00–09:29 is identical, and moving
past 09:30 improves MAE by 26 MW (1.3 %). A buyer's real deadline is earlier than gate closure, so the 07:30 run is
if anything the realistic one.

### 3b. Would waiting have helped? (the new "Does the decision time matter?" panel)

The same analysis, repeated with only the cutoff moved to just after each regular publication run (`GET /api/cutoff-sensitivity`;
runs = publication times seen on at least a quarter of the days). Decisions 1–31 Jan, n = 1,488 in every row:

| Cutoff (UK, day before delivery) | Run in force | MAE (MW) | RMSE (MW) | Bias (MW) |
|---|---|---|---|---|
| 02:30 | 02:30 | 2,076 | 2,582 | +1,735 |
| 04:30 | 04:30 | 2,020 | 2,526 | +1,671 |
| 07:30 | 07:30 | 2,042 | 2,509 | +1,748 |
| **09:20 (default; EPEX gate closure)** | **07:30** | **2,042** | **2,509** | **+1,748** |
| 09:30 | 09:30 | 2,016 | 2,510 | +1,730 |
| 11:30 | 11:30 | 1,904 | 2,364 | +1,687 |
| 15:30 | 15:30 | 1,877 | 2,331 | +1,709 |
| 18:30 | 18:30 | 1,878 | 2,331 | +1,692 |
| 22:30 | 22:30 | 1,830 | 2,282 | +1,603 |

* **Waiting helps, modestly, and not steadily.** From the 09:20 cutoff to the last run of the day MAE falls by 10.4 % (2,042 → 1,830 MW)
  and RMSE by 9.0 %; the 07:30 run is slightly *worse* than the 04:30 one. Everything after the 09:20 gate closure is hindsight for a
  day-ahead buyer: it is shown to measure how much information is still arriving, not as something that could have been used.
* **The offset does not go away.** The bias stays between +1,603 and +1,748 MW in every run, so more than 90 % of it is still there with the
  end-of-day forecast. Later forecasts remove scatter, not the systematic gap. That is consistent with a persistent offset between what
  WINDFOR forecasts and what FUELHH WIND measures (§2), but this data cannot prove that.

## 4. Does the hourly-vs-half-hourly choice matter? (it does not, at this level)

WINDFOR is hourly and FUELHH half-hourly (docs/02 §G). Three treatments of the same snapshot:

| Treatment | n | MAE (MW) | Bias (MW) |
|---|---|---|---|
| `hold` (default): each forecast hour applied to both half-hours | 1,488 half-hours | 2,042.0 | +1,747.9 |
| `exact`: only half-hours whose start equals a forecast start | 744 (coverage 50 %) | 2,022.5 | +1,745.9 |
| Independent pandas calculation outside the app: hour-mean of the two actuals vs the forecast hour | 744 hours | 2,038.9 | +1,747.9 |

The headline MAE differs by under 1 %, and the bias from the app (`hold`) equals the independent calculation to the
decimal, which doubles as a cross-check of the engine.

## 5. Data-quality facts from the live feeds

* Actuals: 1,536 / 1,536 expected January half-hours present; no duplicates, bad values or negatives.
* Forecasts: 272 publications between 2025-12-30 and 2026-02-01; exactly 8 per January day (one 11:30 run came out at 12:25).
* FUELHH `publishTime` is the period end for 2,012 of 2,016 rows; four were stamped later (56–145 min after the start).
* All of January is GMT, so **DST handling is covered by unit tests but not by real data**.

## 6. What this analysis cannot tell you

* Why the bias exists (definition vs forecast quality), see §2.
* Anything about other months or seasons, wind regimes, or years.
* Whether a WINDFOR value describes the hour starting at its `startTime` (assumed; the data cannot settle it).
* Anything about prices, costs or positions.
