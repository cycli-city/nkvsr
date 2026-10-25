"""Deterministic builders for test frames. Values are arbitrary test numbers, not Elexon observations."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, time

import numpy as np
import pandas as pd

from app.domain import timeutil as tu

DEFAULT_CUTOFF = time(9, 20)


def ts(value: str) -> pd.Timestamp:
    """Parse an ISO string that carries an explicit timezone into a UTC timestamp."""
    return tu.to_utc(pd.Timestamp(value))


def day_starts(day: date) -> pd.DatetimeIndex:
    return tu.delivery_day_intervals(day)


def make_actuals(day: date, values: Iterable[float] | float | None = None) -> pd.DataFrame:
    starts = day_starts(day)
    if values is None:
        vals = np.arange(len(starts), dtype=float) * 10.0 + 1000.0
    elif isinstance(values, int | float):
        vals = np.full(len(starts), float(values))
    else:
        vals = np.asarray(list(values), dtype=float)
    return pd.DataFrame({"start_utc": starts, "actual_mw": vals})


def make_forecasts(
    day: date,
    publications: list[tuple[pd.Timestamp, float]],
) -> pd.DataFrame:
    """The same set of (publish_time, flat_value) publications for every half-hour of ``day``."""
    rows = [(start, publish, value) for start in day_starts(day) for publish, value in publications]
    return pd.DataFrame(rows, columns=["start_utc", "publish_utc", "forecast_mw"])


def cutoff_for(day: date, cutoff: time = DEFAULT_CUTOFF) -> pd.Timestamp:
    return tu.cutoff_utc_for_delivery_date(day, cutoff)
