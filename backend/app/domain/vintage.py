"""Decision-time forecast reconstruction ("forecast vintage" selection).

For every delivery interval we need the forecast a buyer could actually have used when the day-ahead
decision had to be taken, i.e. the **latest publication with ``publish_time <= decision_cutoff``** for
that interval's ``start_time``. This is deliberately different from the *latest forecast now*
(``latest_published``), which includes revisions made after the cutoff and is hindsight information.

Implementation notes
--------------------
* ``pd.merge_asof(by=start_utc, direction="backward", allow_exact_matches=True)`` returns exactly one
  right-hand row per left-hand row, so revisions can never inflate the sample count.
* Forecast rows are de-duplicated on ``(start_utc, publish_utc)`` defensively before joining.
* All timestamps are normalised to ``datetime64[ns, UTC]`` first: merge_asof refuses mixed resolutions
  and pandas>=3 parses ISO strings to microseconds.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd

from app.domain.timeutil import as_utc_ns

FORECAST_COLS = ["start_utc", "publish_utc", "forecast_mw"]
SUPPORTED_BLOCK_MINUTES = (30, 60)
ForecastAlignment = Literal["hold", "exact"]


class InvariantError(RuntimeError):
    """An internal consistency guarantee (e.g. one forecast per interval) was violated."""


def resolve_block_minutes(alignment: ForecastAlignment, observed_resolution: float | None) -> int:
    """Length in minutes of the forecast block that one WINDFOR value covers.

    Actuals (FUELHH) are half-hourly. Live inspection of WINDFOR showed whole-hour ``startTime`` values
    only, so with ``alignment="hold"`` each forecast hour is applied to both half-hours it covers. With
    ``"exact"`` a forecast is only used for the half-hour whose ``startTime`` it carries, so the other
    half-hour is reported as missing. Any resolution other than 60 minutes is treated as half-hourly:
    holding a value across longer blocks would be a modelling claim this product does not make.
    """
    if alignment == "exact" or observed_resolution is None:
        return 30
    return 60 if abs(float(observed_resolution) - 60.0) < 1e-6 else 30


def forecast_block_starts(starts: pd.Series, block_minutes: int) -> pd.Series:
    """Start of the forecast block that covers each delivery-interval start (UTC).

    Whole-hour blocks align with UTC because every Europe/London offset is a whole number of hours.
    """
    if block_minutes not in SUPPORTED_BLOCK_MINUTES:
        raise ValueError(
            f"block_minutes must be one of {SUPPORTED_BLOCK_MINUTES}, got {block_minutes}"
        )
    utc = as_utc_ns(starts)
    return utc if block_minutes == 30 else utc.dt.floor(f"{block_minutes}min")


def _prepare_forecasts(forecasts: pd.DataFrame) -> pd.DataFrame:
    if forecasts.empty:
        return pd.DataFrame(
            {
                "start_utc": pd.Series(dtype="datetime64[ns, UTC]"),
                "publish_utc": pd.Series(dtype="datetime64[ns, UTC]"),
                "forecast_mw": pd.Series(dtype="float64"),
            }
        )
    out = forecasts[FORECAST_COLS].copy()
    out["start_utc"] = as_utc_ns(out["start_utc"])
    out["publish_utc"] = as_utc_ns(out["publish_utc"])
    out["forecast_mw"] = out["forecast_mw"].astype("float64")
    return out.drop_duplicates(["start_utc", "publish_utc"], keep="last")


def select_at_cutoff(
    intervals: pd.DataFrame, forecasts: pd.DataFrame, *, block_minutes: int = 30
) -> pd.DataFrame:
    """Latest forecast per interval with ``publish_utc <= cutoff_utc``.

    Parameters
    ----------
    intervals:
        One row per delivery interval with ``start_utc`` and ``cutoff_utc``.
    forecasts:
        Every known forecast publication: ``start_utc``, ``publish_utc``, ``forecast_mw``.
    block_minutes:
        Length of the forecast block one value covers (see :func:`resolve_block_minutes`). An interval
        is matched to the forecast whose ``start_utc`` is the start of the block containing it.

    Returns
    -------
    A frame aligned row-for-row with ``intervals`` (same length and order) carrying
    ``forecast_start_utc`` (the block the value refers to), ``publish_utc`` and ``forecast_mw``
    (NaT/NaN when nothing was eligible).
    """
    left = intervals[["start_utc", "cutoff_utc"]].copy()
    left["start_utc"] = as_utc_ns(left["start_utc"])
    left["cutoff_utc"] = as_utc_ns(left["cutoff_utc"])
    left["forecast_start_utc"] = forecast_block_starts(left["start_utc"], block_minutes)
    left["_row"] = np.arange(len(left))
    left = left.sort_values("cutoff_utc", kind="stable")

    right = (
        _prepare_forecasts(forecasts)
        .rename(columns={"start_utc": "forecast_start_utc"})
        .sort_values("publish_utc", kind="stable")
    )

    merged = pd.merge_asof(
        left,
        right,
        left_on="cutoff_utc",
        right_on="publish_utc",
        by="forecast_start_utc",
        direction="backward",
        allow_exact_matches=True,
    )
    merged = merged.sort_values("_row").reset_index(drop=True)
    if len(merged) != len(intervals):
        raise InvariantError(
            f"Vintage selection changed the row count ({len(intervals)} -> {len(merged)})"
        )
    return merged[["forecast_start_utc", "publish_utc", "forecast_mw"]]


def latest_published(
    forecasts: pd.DataFrame, starts: pd.Series, *, block_minutes: int = 30
) -> pd.DataFrame:
    """Hindsight comparator: the most recently published forecast for each requested ``start_utc``.

    Uses the same forecast block as :func:`select_at_cutoff`, so the two are always comparable.
    Returns a frame aligned with ``starts`` carrying ``latest_publish_utc`` and ``latest_forecast_mw``.
    """
    prepared = _prepare_forecasts(forecasts)
    starts_utc = as_utc_ns(starts).reset_index(drop=True)
    keys = pd.DataFrame(
        {"start_utc": forecast_block_starts(starts_utc, block_minutes)},
    )
    if prepared.empty:
        keys["latest_publish_utc"] = pd.Series(
            pd.NaT, index=keys.index, dtype="datetime64[ns, UTC]"
        )
        keys["latest_forecast_mw"] = np.nan
        return keys[["latest_publish_utc", "latest_forecast_mw"]]
    newest = (
        prepared.sort_values("publish_utc", kind="stable")
        .groupby("start_utc", sort=False)
        .tail(1)
        .rename(columns={"publish_utc": "latest_publish_utc", "forecast_mw": "latest_forecast_mw"})
    )
    merged = keys.merge(newest, on="start_utc", how="left", validate="many_to_one")
    if len(merged) != len(keys):
        raise InvariantError("Latest-forecast join changed the row count")
    return merged[["latest_publish_utc", "latest_forecast_mw"]]


def list_vintages(
    forecasts: pd.DataFrame,
    start_utc: pd.Timestamp,
    cutoff_utc: pd.Timestamp,
    *,
    block_minutes: int = 30,
) -> pd.DataFrame:
    """Every publication for one delivery interval, flagged against the decision cutoff.

    Adds ``eligible`` (``publish_utc <= cutoff_utc``) and ``selected`` (the single latest eligible
    publication), plus ``lead_time_h`` (delivery start minus publication) for context. With a
    ``block_minutes`` longer than the interval, the publications listed are those of the forecast block
    that contains the interval, i.e. exactly the ones :func:`select_at_cutoff` chooses between.
    """
    prepared = _prepare_forecasts(forecasts)
    interval = pd.Timestamp(start_utc).tz_convert("UTC")
    block_start = forecast_block_starts(pd.Series([interval]), block_minutes).iloc[0]
    block_rows: pd.DataFrame = prepared[prepared["start_utc"] == block_start].copy()
    rows = block_rows.sort_values("publish_utc", kind="stable").reset_index(drop=True)
    rows["eligible"] = rows["publish_utc"] <= cutoff_utc
    rows["selected"] = False
    eligible_idx = rows.index[rows["eligible"]]
    if len(eligible_idx) > 0:
        rows.loc[eligible_idx[-1], "selected"] = True
    rows["lead_time_h"] = (interval - rows["publish_utc"]).dt.total_seconds() / 3600.0
    return rows
