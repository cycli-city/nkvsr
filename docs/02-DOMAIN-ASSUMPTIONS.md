# 02 — Domain Assumptions & Interpretations

Each item is labelled **FACT** (verified against an authoritative source), **SOURCED** (taken from a public
source that I could read but not from a live Elexon response) or **ASSUMPTION** (a modelling choice,
configurable where useful). Anything not FACT is surfaced in the product's Methodology page.

## A. Market structure

| # | Statement | Status |
|---|---|---|
| A1 | GB wholesale power is traded in day-ahead auctions run on the day before delivery (D‑1) for delivery on D (local day, 00:00–24:00 UK time). | SOURCED |
| A2 | EPEX SPOT GB day-ahead auction gate closure: **09:20 UK time** on D‑1. ([S&P Global note, 9 Dec 2020](https://www.spglobal.com/commodity-insights/en/pricing-benchmarks/our-methodology/subscriber-notes/120920-platts-to-amend-uk-day-ahead-power-assessments-timing-from-jan-4)) | SOURCED (secondary) |
| A3 | N2EX day-ahead auction gate closure: **09:50 UK time** per Nord Pool support page ([source](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-day-ahead-gb-auction)); the S&P note says 09:40 — **sources conflict**, so N2EX is offered only as a selectable preset, not the default. | SOURCED (conflicting) |
| A4 | The utility's actual bidding time is earlier than gate closure (orders need preparing). The cutoff is therefore an *upper bound* on information available. | ASSUMPTION |

### Default decision cutoff

`cutoff = (delivery_local_date − 1 day) at 09:20 Europe/London`, converted to UTC.
A forecast is **eligible** iff `publishTime <= cutoff` and its `startTime` is the start of the forecast block
that contains the delivery interval (the interval itself for half-hourly forecasts, the containing hour for the
hourly WINDFOR feed; see section G).
09:20 is the *earliest* GB day-ahead gate closure, so no forecast that could not have informed *any* GB
day-ahead bid is used (leak-free default). It is configurable (`DECISION_CUTOFF_LOCAL`, and the
`cutoff` query parameter / UI selector). All statistics returned by the API echo the cutoff they used.

## B. "Purchase decisions made in January 2026" — two interpretations

| Basis | Meaning | Decision dates | Delivery dates |
|---|---|---|---|
| `decision_date` (**default**) | The *decision* is made in January. This is the literal reading of the brief ("purchase decisions to be made in January 2026"). | 1 Jan – 31 Jan 2026 | **2 Jan – 1 Feb 2026** |
| `delivery_date` | The *delivery* falls in January. | 31 Dec 2025 – 30 Jan 2026 | 1 Jan – 31 Jan 2026 |

* Both bases are supported by one ingestion snapshot (delivery range 1 Jan–1 Feb 2026).
* The API takes `basis` and expresses `from`/`to` in that basis' own date type. Responses echo both the
  decision-date range and the delivery-date range. **Statistics of the two bases are never mixed**; the UI
  shows the active basis in the header of every panel.
* January 2026 is entirely GMT (UTC+0), so UTC == UK local time for this window. The code is nevertheless
  fully timezone-aware (`Europe/London`) and tested around the 29 Mar 2026 and 25 Oct 2026 DST changes
  (23/25-hour days → 46/50 half-hours).

## C. Data semantics

| # | Statement | Status |
|---|---|---|
| C1 | FUELHH = half-hourly *average* MW by fuel type. Elexon's API description says "average MW values over 30 minutes for each category"; its glossary entry (read only as a search excerpt, the page itself was not reachable from the build environment) describes generation connected to the high-voltage transmission system, taken from operational metering ([glossary](https://www.elexon.co.uk/bsc/glossary/half-hourly-generation-by-fuel-type/)). That `WIND` therefore **excludes embedded (distribution-connected) wind** is an *inference*; Elexon does not say so explicitly. | FACT (unit, averaging) / **inference** (scope) |
| C2 | WINDFOR = wind generation forecast; each record has a delivery `startTime` and a `publishTime`. **Observed 2026-10-25: `startTime` is on whole hours only (60-minute grid), 8 publications per day, up to 73 hourly rows each** (see `docs/04-DATA-SOURCE-VERIFICATION.md`). Resolution is still **detected from the data at every ingestion**, never hard-coded. | **FACT** (observed) |
| C3 | `generation` is in **MW** for both datasets. FUELHH: stated by Elexon. WINDFOR: not stated; magnitudes (3.8–17.4 GW in the probe) agree with FUELHH, so MW is assumed. | FACT (FUELHH) / **ASSUMPTION** (WINDFOR) |
| C4 | `startTime` is a UTC ISO‑8601 instant (`Z`) marking the start of the period. Settlement period *n* of a UK day starts at `local_midnight + (n−1)×30 min`. | **FACT** (observed; `settlementPeriod` and `startTime` agree on all 48 rows of the recorded day, a GMT day — DST days are not covered by real data) |
| C5 | The definitional match between FUELHH `WIND` and WINDFOR (forecast scope) is **not documented**. Observed: the forecast exceeds the actual by ~1.7 GW on average, even for the latest publication, so part of this may be a scope mismatch rather than forecast skill. The analysis cannot separate the two and says so. Reported as a limitation. | UNKNOWN / limitation |
| C6 | `publishTime` = the instant the forecast became publicly available. Publication latency inside Elexon is unknown and ignored. For WINDFOR the stamps are at :30 (and once :25) past a fixed set of hours, which looks like a scheduled run time. | ASSUMPTION |
| C7 | **Forecast hour semantics.** A WINDFOR value with `startTime` T is taken to describe the hour starting at T. Not stated by Elexon, and the data cannot settle it: five alignments against the actuals differ by under 30 MW of MAE. | **ASSUMPTION** |

## D. Procurement interpretation (what the numbers do / do not mean)

* **Signed error = forecast − actual.** Positive = **over-forecast** (wind delivered *less* than forecast ⇒
  the buyer relying on the forecast would be *short* and exposed to intraday/balancing prices). Negative =
  **under-forecast** (wind over-delivered ⇒ the buyer would be *long*).
* Wind forecast error is **not** the utility's net procurement volume. Demand, thermal/other generation,
  contracted positions, storage and balancing are outside the assignment's data scope. The product informs
  *uncertainty around the wind component only* and must never claim to compute purchase quantities.
* Empirical error quantiles (e.g. P90 over-forecast) are **in-sample descriptive statistics for the
  selected window**, not guarantees about the future.

## E. Baselines (information-valid at the decision cutoff)

Evaluated only on the intervals where forecast, actual **and** the baseline are all available, and always
reported with their own `n`:

* **Persistence at cutoff** — the last half-hour actual that was *available* at the cutoff, held flat across the
  whole next day. An actual is available once its half-hour has ended **and** a publication lag has elapsed:
  `start + 30 min + lag <= cutoff`, and never before its recorded `publishTime` when that is later. The lag is an
  **ASSUMPTION** (default 30 min, `ACTUAL_AVAILABILITY_LAG_MINUTES`): live FUELHH rows are stamped at the period end
  (2,012 of 2,016), so the stamp does not reveal the real delay; four rows were stamped 56–145 min after the start.
  A value that has ended but is not yet published cannot influence the baseline (tested).
* **Trailing 7-day mean (same settlement period)** — mean of the same local settlement period over the
  7 *complete* local days D‑8 … D‑2 relative to the delivery day D (D‑1 is incomplete at the cutoff).

No baseline may use an actual that was not yet available at the cutoff (leakage). Tests enforce this.

## G. Hourly forecasts against half-hourly actuals (observed 2026-10-25)

FUELHH has one value per half-hour; WINDFOR has one value per **hour**. Two ways to line them up are
supported, selected by `FORECAST_ALIGNMENT` (default `hold`), and the response of every analysis states which
one produced it:

| Mode | Rule | Effect on the data |
|---|---|---|
| `hold` (**default**) | A half-hour uses the forecast for the hour that contains it: `block(08:30) = 08:00`. The same publication is chosen for both halves. | All half-hours are scored (coverage 100 % when every hour has a forecast). *n* counts half-hours, which come in pairs sharing one forecast, so the effective number of independent forecast points is about *n*/2. |
| `exact` | A forecast is used only for the half-hour whose `startTime` equals it. | Half the half-hours have no forecast and are reported as **missing**, giving ~50 % coverage and an "insufficient data" status. Provided so the strict reading stays available. |

Rules that hold in both modes (all unit-tested, including a no-look-ahead test):

* **Nothing is interpolated.** If the forecast hour is absent, both of its half-hours are missing; neighbouring hours are never used.
* **No look-ahead.** The second half-hour of an hour never takes the *next* hour's value.
* The **publication cutoff is applied to the held value** exactly as to any other: a publication made after the cutoff is never selected.
* `block_minutes` is only ever 30 or 60. A forecast grid of any other spacing is treated as half-hourly (so those rows are matched exactly), because holding values over longer blocks would be a modelling claim this product does not make.
* The hindsight series ("latest published") uses the same block as the decision-time forecast, so the two are comparable.
* Why `hold` is the default: it is the only reading that scores every delivery interval without inventing a number, and the alternative (averaging the two actuals into hours) would change the unit of analysis away from settlement periods, which the brief's half-hour breakdowns need. With the January data the choice is not material to the conclusion (see `docs/09-REAL-DATA-FINDINGS.md`).

## F. Data-quality policy

* Missing / unparseable / non-finite records are dropped and **counted by reason**, never imputed.
* Duplicates: same `(startTime, publishTime)` forecast or same `startTime` actual → keep the latest
  (by `publishTime` if present, else arrival order); count duplicates and *conflicting* duplicates.
* Negative generation values are kept and counted (not dropped, not clipped).
* No synthetic substitution: a gap stays a gap and is shown as missing.
* Synthetic data exists only in unit-test fixtures and a dev-only, loudly-labelled snapshot that the app
  refuses to load when `APP_ENV=production`.
