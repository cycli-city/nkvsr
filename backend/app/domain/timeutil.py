"""Time and calendar helpers for the GB electricity market.

Internal convention: every instant is a tz-aware UTC ``pd.Timestamp`` with nanosecond resolution.
``Europe/London`` appears only where the market itself is defined in local time:

* the *delivery day* (local civil day, 00:00-24:00 UK time; 46/48/50 half-hours around DST changes),
* the *decision cutoff* (a local clock time on the previous local day),
* the half-hourly *settlement period* number within a delivery day.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

LONDON = ZoneInfo("Europe/London")
UTC = "UTC"
HALF_HOUR = pd.Timedelta(minutes=30)
DAY = timedelta(days=1)

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def parse_hhmm(value: str) -> time:
    """Parse a strict ``HH:MM`` 24-hour clock string."""
    match = _HHMM.match(value.strip())
    if not match:
        raise ValueError(f"Expected a 24-hour 'HH:MM' time, got {value!r}")
    return time(int(match.group(1)), int(match.group(2)))


def to_utc(value: pd.Timestamp | datetime | str) -> pd.Timestamp:
    """Coerce to a tz-aware UTC timestamp (naive values are rejected, never guessed)."""
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        raise ValueError(f"Refusing to interpret naive timestamp {value!r}; a timezone is required")
    return ts.tz_convert(UTC)


def as_utc_ns(series: pd.Series) -> pd.Series:
    """Normalise a datetime Series to ``datetime64[ns, UTC]`` (stable across pandas versions)."""
    converted = pd.to_datetime(series, utc=True)
    return converted.astype("datetime64[ns, UTC]")


def local_midnight_utc(day: date) -> pd.Timestamp:
    """UTC instant of 00:00 Europe/London on ``day`` (midnight always exists in the UK)."""
    return pd.Timestamp(datetime.combine(day, time(0, 0), tzinfo=LONDON)).tz_convert(UTC)


def delivery_day_bounds(day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Half-open UTC interval ``[start, end)`` covering the local delivery day."""
    return local_midnight_utc(day), local_midnight_utc(day + DAY)


def delivery_day_intervals(day: date) -> pd.DatetimeIndex:
    """UTC start instants of every half-hour in the local delivery day (46, 48 or 50 values)."""
    start, end = delivery_day_bounds(day)
    return pd.date_range(start, end, freq=HALF_HOUR, inclusive="left", unit="ns")


def delivery_range_intervals(first: date, last: date) -> pd.DatetimeIndex:
    """All half-hour start instants for local delivery days ``first..last`` inclusive."""
    if last < first:
        raise ValueError("last delivery date precedes first delivery date")
    start = local_midnight_utc(first)
    end = local_midnight_utc(last + DAY)
    return pd.date_range(start, end, freq=HALF_HOUR, inclusive="left", unit="ns")


def local_date_of(starts: pd.Series | pd.DatetimeIndex) -> pd.Series:
    """Local (Europe/London) civil date of each UTC instant."""
    idx = pd.DatetimeIndex(starts)
    local = idx.tz_convert(LONDON)
    return pd.Series(local.date, index=getattr(starts, "index", None))


def settlement_periods(starts: pd.Series) -> pd.Series:
    """Settlement period (1-based) of each half-hour within its local delivery day.

    Period *n* starts at ``local_midnight + (n-1) * 30 min`` measured in elapsed UTC time, so a
    23-hour day has periods 1-46 and a 25-hour day has periods 1-50.
    """
    idx = pd.DatetimeIndex(starts)
    local_days = idx.tz_convert(LONDON).normalize()
    day_start_utc = local_days.tz_convert(UTC)
    elapsed = (idx - day_start_utc) / HALF_HOUR
    return pd.Series((elapsed.astype("int64") + 1), index=getattr(starts, "index", None))


def local_slot_label(starts: pd.Series | pd.DatetimeIndex) -> pd.Series:
    """Local wall-clock ``HH:MM`` of each half-hour start (used for time-of-day breakdowns)."""
    idx = pd.DatetimeIndex(starts)
    return pd.Series(idx.tz_convert(LONDON).strftime("%H:%M"), index=getattr(starts, "index", None))


def cutoff_utc_for_delivery_date(delivery_day: date, cutoff_local: time) -> pd.Timestamp:
    """UTC instant of the day-ahead decision cutoff for ``delivery_day``.

    The cutoff is ``cutoff_local`` Europe/London on the *previous* local day. Non-existent local
    times (spring-forward gap) resolve to the instant after the gap; ambiguous times (autumn
    overlap) resolve to the first occurrence. The default 09:20 is never affected.
    """
    local = datetime.combine(delivery_day - DAY, cutoff_local, tzinfo=LONDON)
    return pd.Timestamp(local).tz_convert(UTC)


def cutoffs_for_dates(days: Iterable[date], cutoff_local: time) -> dict[date, pd.Timestamp]:
    """Cutoff instant for each distinct delivery date (computed once per date, not per row)."""
    return {d: cutoff_utc_for_delivery_date(d, cutoff_local) for d in set(days)}


def is_half_hour_aligned(starts: pd.Series) -> pd.Series:
    """True where an instant lies exactly on a :00 or :30 boundary."""
    idx = pd.DatetimeIndex(starts)
    aligned = np.asarray(idx == idx.floor("30min"))  # resolution-agnostic (us/ns/s)
    return pd.Series(aligned, index=getattr(starts, "index", None))
