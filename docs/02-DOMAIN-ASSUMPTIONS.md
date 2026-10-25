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
A forecast is **eligible** iff `publishTime <= cutoff` and its `startTime` equals the delivery interval start.
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
| C1 | FUELHH = half-hourly *average* MW by fuel type, from transmission-system operational metering. `WIND` therefore represents **metered transmission-connected wind** and does **not** include embedded (distribution-connected) wind. ([Elexon glossary](https://www.elexon.co.uk/bsc/glossary/half-hourly-generation-by-fuel-type/)) | SOURCED |
| C2 | WINDFOR = National Grid ESO wind generation forecast, published repeatedly; each record has a delivery `startTime` and a `publishTime`. The legacy BMRS description was *hourly net wind*; the Insights API is expected to be half-hourly. Forecast resolution is **detected from data**, never assumed. | SOURCED / to verify |
| C3 | `generation` is in **MW** for both datasets. | **UNVERIFIED** — must be confirmed against live responses (`make verify-upstream`) |
| C4 | `startTime` is a UTC ISO‑8601 instant marking the start of the half-hour. Settlement period *n* of a UK day starts at `local_midnight + (n−1)×30 min`. | UNVERIFIED (to confirm) |
| C5 | The definitional match between FUELHH `WIND` (metered, transmission) and WINDFOR (forecast scope) may not be exact; any structural bias could partly be a scope mismatch rather than forecast skill. Reported as a limitation. | ASSUMPTION / limitation |
| C6 | `publishTime` = the instant the forecast became publicly available. Publication latency inside Elexon is unknown and ignored. | ASSUMPTION |

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
  `start + 30 min + lag <= cutoff`. The lag is an **ASSUMPTION** (default 30 min, `ACTUAL_AVAILABILITY_LAG_MINUTES`)
  until `verify-upstream` shows FUELHH's real publication delay; a value that has ended but is not yet published
  cannot influence the baseline (tested).
* **Trailing 7-day mean (same settlement period)** — mean of the same local settlement period over the
  7 *complete* local days D‑8 … D‑2 relative to the delivery day D (D‑1 is incomplete at the cutoff).

No baseline may use an actual that was not yet available at the cutoff (leakage). Tests enforce this.

## F. Data-quality policy

* Missing / unparseable / non-finite records are dropped and **counted by reason**, never imputed.
* Duplicates: same `(startTime, publishTime)` forecast or same `startTime` actual → keep the latest
  (by `publishTime` if present, else arrival order); count duplicates and *conflicting* duplicates.
* Negative generation values are kept and counted (not dropped, not clipped).
* No synthetic substitution: a gap stays a gap and is shown as missing.
* Synthetic data exists only in unit-test fixtures and a dev-only, loudly-labelled snapshot that the app
  refuses to load when `APP_ENV=production`.
