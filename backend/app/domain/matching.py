"""Build the single, canonical per-interval table every API view is derived from.

One row per *expected* half-hourly delivery interval in the requested window (so that missing data is
visible as a gap, not silently absent). Columns:

========================  =====================================================================
``start_utc``             delivery interval start (UTC)
``delivery_date``         local (Europe/London) delivery date
``settlement_period``     1-based half-hour index within the local delivery day (46/48/50 per day)
``slot``                  local wall-clock ``HH:MM`` (time-of-day breakdowns)
``daypart``               ``day`` = 07:00-23:00 local, ``night`` otherwise
``cutoff_utc``            decision cutoff applicable to this interval
``forecast_for_utc``      start of the WINDFOR block the forecast refers to (== ``start_utc`` for
                          half-hourly forecasts, the containing hour for hourly ones)
``actual_mw``             FUELHH WIND (NaN if missing)
``forecast_mw``           latest WINDFOR value with ``publish_utc <= cutoff_utc`` (decision-time)
``publish_utc``          publication time of that forecast
``forecast_age_h``        cutoff - publication (how stale the forecast was at the cutoff)
``lead_time_h``           delivery start - publication
``latest_forecast_mw``    hindsight: most recent publication overall (NOT used for metrics)
``latest_publish_utc``    its publication time
``error_mw``              forecast - actual (signed) when matched
``abs_error_mw``          |error|
``match_status``          matched | missing_forecast | missing_actual | missing_both
========================  =====================================================================
"""

from __future__ import annotations

from datetime import date, time

import numpy as np
import pandas as pd

from app.domain import timeutil as tu
from app.domain.vintage import InvariantError, latest_published, select_at_cutoff

DAY_START_HOUR = 7
DAY_END_HOUR = 23  # exclusive


def expected_intervals(
    delivery_from: date,
    delivery_to: date,
    cutoff_local: time,
    *,
    as_of: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Calendar-derived expected intervals with their decision cutoffs.

    ``as_of`` (the snapshot's retrieval time) excludes intervals that had not finished by then - their
    actuals cannot exist yet, so they must not count against coverage.
    """
    starts = tu.delivery_range_intervals(delivery_from, delivery_to)
    frame = pd.DataFrame({"start_utc": starts})
    if as_of is not None:
        end = frame["start_utc"] + tu.HALF_HOUR
        frame = frame[end <= tu.to_utc(as_of)].reset_index(drop=True)

    frame["delivery_date"] = tu.local_date_of(frame["start_utc"]).to_numpy()
    frame["settlement_period"] = tu.settlement_periods(frame["start_utc"]).to_numpy()
    frame["slot"] = tu.local_slot_label(frame["start_utc"]).to_numpy()
    hour = frame["start_utc"].dt.tz_convert(tu.LONDON).dt.hour
    frame["daypart"] = np.where((hour >= DAY_START_HOUR) & (hour < DAY_END_HOUR), "day", "night")

    cutoffs = tu.cutoffs_for_dates(frame["delivery_date"].tolist(), cutoff_local)
    frame["cutoff_utc"] = tu.as_utc_ns(frame["delivery_date"].map(cutoffs))
    return frame


def build_matched_frame(
    *,
    delivery_from: date,
    delivery_to: date,
    cutoff_local: time,
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    as_of: pd.Timestamp | None = None,
    forecast_block_minutes: int = 30,
) -> pd.DataFrame:
    """Join actuals and decision-time forecasts onto the expected intervals (one row each).

    ``actuals`` must have unique ``start_utc`` (+ ``actual_mw``); ``forecasts`` carries every
    publication (``start_utc``, ``publish_utc``, ``forecast_mw``). ``forecast_block_minutes`` is the
    span one forecast value covers (60 for the hourly WINDFOR feed): each half-hour then uses the
    forecast of the block containing it, never an interpolated value.
    """
    frame = expected_intervals(delivery_from, delivery_to, cutoff_local, as_of=as_of)
    n_expected = len(frame)

    act = actuals[["start_utc", "actual_mw"]].copy()
    act["start_utc"] = tu.as_utc_ns(act["start_utc"])
    if act["start_utc"].duplicated().any():
        raise InvariantError(
            "Actuals contain duplicate start_utc values; de-duplicate before matching"
        )
    frame = frame.merge(act, on="start_utc", how="left", validate="one_to_one")

    chosen = select_at_cutoff(frame, forecasts, block_minutes=forecast_block_minutes)
    frame["forecast_for_utc"] = tu.as_utc_ns(chosen["forecast_start_utc"])
    frame["publish_utc"] = chosen["publish_utc"].to_numpy()
    frame["forecast_mw"] = chosen["forecast_mw"].to_numpy()

    latest = latest_published(forecasts, frame["start_utc"], block_minutes=forecast_block_minutes)
    frame["latest_publish_utc"] = latest["latest_publish_utc"].to_numpy()
    frame["latest_forecast_mw"] = latest["latest_forecast_mw"].to_numpy()

    if len(frame) != n_expected:
        raise InvariantError("Matching changed the number of expected intervals")

    frame["publish_utc"] = tu.as_utc_ns(frame["publish_utc"])
    frame["latest_publish_utc"] = tu.as_utc_ns(frame["latest_publish_utc"])
    frame["forecast_age_h"] = (
        frame["cutoff_utc"] - frame["publish_utc"]
    ).dt.total_seconds() / 3600.0
    frame["lead_time_h"] = (frame["start_utc"] - frame["publish_utc"]).dt.total_seconds() / 3600.0

    has_a = frame["actual_mw"].notna()
    has_f = frame["forecast_mw"].notna()
    frame["error_mw"] = np.where(has_a & has_f, frame["forecast_mw"] - frame["actual_mw"], np.nan)
    frame["abs_error_mw"] = frame["error_mw"].abs()
    frame["match_status"] = np.select(
        [has_a & has_f, has_a & ~has_f, ~has_a & has_f],
        ["matched", "missing_forecast", "missing_actual"],
        default="missing_both",
    )
    return frame


def matched_only(frame: pd.DataFrame) -> pd.DataFrame:
    """The eligible observation set every headline metric is computed on."""
    return frame[frame["match_status"] == "matched"]
