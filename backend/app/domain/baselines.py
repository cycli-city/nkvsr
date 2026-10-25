"""Naive baselines that are *information-valid at the decision cutoff*.

A baseline is only meaningful if it uses nothing the buyer could not have known at the cutoff.
Both baselines below therefore depend solely on actuals whose delivery interval had **finished** by the
cutoff, and the tests assert that no later actual can change them.

* ``persistence``   - the last completed half-hour actual before the cutoff, held flat for the whole
  delivery day (the classic "no-change" forecast).
* ``trailing_mean`` - mean of the same local settlement period over the 7 complete local days
  D-8 ... D-2 relative to delivery day D (D-1 is incomplete at the cutoff, so it is excluded).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.domain import timeutil as tu

# A persistence value older than this at the cutoff is considered stale and not used.
PERSISTENCE_MAX_STALENESS = pd.Timedelta(hours=6)
TRAILING_DAYS = 7
TRAILING_MIN_DAYS = 5
TRAILING_LAG_DAYS = 2  # delivery day D uses D-2 and earlier


def persistence_at_cutoff(intervals: pd.DataFrame, actuals: pd.DataFrame) -> pd.Series:
    """Last completed actual (interval end <= cutoff) per interval; NaN if none recent enough."""
    act = actuals[["start_utc", "actual_mw"]].copy()
    act["end_utc"] = tu.as_utc_ns(act["start_utc"]) + tu.HALF_HOUR
    act["end_utc"] = tu.as_utc_ns(act["end_utc"])
    act = act.dropna(subset=["actual_mw"]).sort_values("end_utc", kind="stable")

    left = pd.DataFrame({"cutoff_utc": tu.as_utc_ns(intervals["cutoff_utc"])})
    left["_row"] = np.arange(len(left))
    left = left.sort_values("cutoff_utc", kind="stable")

    if act.empty:
        return pd.Series(np.nan, index=intervals.index, dtype="float64")

    merged = pd.merge_asof(
        left,
        act[["end_utc", "actual_mw"]],
        left_on="cutoff_utc",
        right_on="end_utc",
        direction="backward",
        allow_exact_matches=True,
        tolerance=PERSISTENCE_MAX_STALENESS,
    ).sort_values("_row")
    return pd.Series(merged["actual_mw"].to_numpy(), index=intervals.index, dtype="float64")


def trailing_mean_same_period(intervals: pd.DataFrame, actuals: pd.DataFrame) -> pd.Series:
    """Mean actual of the same settlement period over the 7 complete days D-8..D-2 (min 5 days)."""
    act = actuals[["start_utc", "actual_mw"]].dropna().copy()
    if act.empty:
        return pd.Series(np.nan, index=intervals.index, dtype="float64")
    act["start_utc"] = tu.as_utc_ns(act["start_utc"])
    act["local_date"] = pd.to_datetime(tu.local_date_of(act["start_utc"]).to_numpy())
    act["period"] = tu.settlement_periods(act["start_utc"]).to_numpy()

    pivot = act.pivot_table(
        index="local_date", columns="period", values="actual_mw", aggfunc="last"
    )
    full_index = pd.date_range(
        pivot.index.min(), pivot.index.max() + pd.Timedelta(days=TRAILING_LAG_DAYS + 1)
    )
    pivot = pivot.reindex(full_index)
    # shift(2): row D sees D-2; rolling(7) then spans D-2 ... D-8 inclusive.
    trailing = (
        pivot.shift(TRAILING_LAG_DAYS).rolling(TRAILING_DAYS, min_periods=TRAILING_MIN_DAYS).mean()
    )

    days = pd.to_datetime(intervals["delivery_date"])
    periods = intervals["settlement_period"].to_numpy()
    values = np.full(len(intervals), np.nan)
    for i, (day, period) in enumerate(zip(days, periods, strict=True)):
        if day in trailing.index and period in trailing.columns:
            values[i] = trailing.at[day, period]
    return pd.Series(values, index=intervals.index, dtype="float64")


def add_baselines(matched: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Return ``matched`` with ``baseline_persistence_mw`` and ``baseline_trailing_mean_mw`` columns."""
    out = matched.copy()
    out["baseline_persistence_mw"] = persistence_at_cutoff(out, actuals)
    out["baseline_trailing_mean_mw"] = trailing_mean_same_period(out, actuals)
    return out
