"""Raw Elexon JSON records -> clean, validated DataFrames plus a data-quality report.

Rules (docs/02-DOMAIN-ASSUMPTIONS.md section F):

* invalid rows are dropped and **counted by reason** - nothing is imputed or fabricated;
* timestamps must carry an explicit timezone (naive values are rejected, not assumed);
* timestamps must lie on :00/:30 boundaries;
* duplicates collapse to the latest record; conflicting duplicates are counted;
* negative generation values are kept (and counted), never clipped;
* output is sorted and uses ``datetime64[ns, UTC]``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.domain import timeutil as tu
from app.elexon.contract import check_contract
from app.elexon.endpoints import FUELHH, WIND_FUEL_TYPE, WINDFOR

_TZ_SUFFIX = r"(?:Z|[+-]\d{2}:?\d{2})$"


@dataclass
class NormalizationReport:
    dataset: str
    rows_in: int = 0
    rows_kept: int = 0
    ignored_other_fuel_types: int = 0
    outside_window: int = 0
    duplicates_removed: int = 0
    conflicting_duplicates: int = 0
    negative_values: int = 0
    published_after_delivery_start: int = 0
    dropped: dict[str, int] = field(default_factory=dict)

    def drop(self, reason: str, count: int) -> None:
        if count:
            self.dropped[reason] = self.dropped.get(reason, 0) + int(count)

    @property
    def total_dropped(self) -> int:
        return sum(self.dropped.values())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def to_mw(values: pd.Series) -> pd.Series:
    """Single place for unit conversion. Elexon generation is expected in MW, so this is the identity.

    If live verification shows another unit (e.g. GW), convert here and update docs/manifest."""
    return values.astype("float64")


def _parse_timestamps(series: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Return (UTC timestamps, naive-mask).

    *Naive* means "a valid date-time that carries no timezone" - we refuse to assume UTC for those.
    Strings that are not date-times at all come back as NaT with ``naive=False`` (reported as bad).
    """
    text = series.astype("string")
    has_tz = text.str.contains(_TZ_SUFFIX, regex=True, na=False)
    parsed = pd.to_datetime(text.where(has_tz), utc=True, errors="coerce", format="ISO8601")
    parseable_without_tz = pd.to_datetime(
        text.where(~has_tz), errors="coerce", format="ISO8601"
    ).notna()
    naive = (~has_tz) & parseable_without_tz
    return parsed.astype("datetime64[ns, UTC]"), naive.astype(bool)


def _numeric(series: pd.Series) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce").astype("float64")
    return values.where(np.isfinite(values))


def _frame(records: Sequence[Mapping[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame.from_records(list(records)) if len(records) else pd.DataFrame()


def _apply_window(
    frame: pd.DataFrame,
    report: NormalizationReport,
    window: tuple[pd.Timestamp, pd.Timestamp] | None,
) -> pd.DataFrame:
    if window is None or frame.empty:
        return frame
    lo, hi = window
    inside = (frame["start_utc"] >= lo) & (frame["start_utc"] < hi)
    report.outside_window += int((~inside).sum())
    return frame[inside]


def normalize_actuals(
    records: Sequence[Mapping[str, Any]],
    *,
    window: tuple[pd.Timestamp, pd.Timestamp] | None = None,
) -> tuple[pd.DataFrame, NormalizationReport]:
    """FUELHH records -> ``start_utc, actual_mw, actual_publish_utc`` (WIND only, one row per start)."""
    report = NormalizationReport(dataset=FUELHH, rows_in=len(records))
    columns = ["start_utc", "actual_mw", "actual_publish_utc"]
    check_contract(records, FUELHH)
    df = _frame(records)
    if df.empty:
        return _empty(columns), report

    is_wind = df["fuelType"].astype("string").str.strip().str.upper() == WIND_FUEL_TYPE
    report.ignored_other_fuel_types = int((~is_wind).sum())
    df = df[is_wind].copy()

    start, naive = _parse_timestamps(df["startTime"])
    df["start_utc"] = start
    df["actual_mw"] = to_mw(_numeric(df["generation"]))
    df["actual_publish_utc"] = (
        _parse_timestamps(df["publishTime"])[0] if "publishTime" in df else pd.NaT
    )

    df = _drop_invalid(
        df,
        report,
        naive_start=naive,
        bad_start=df["start_utc"].isna() & ~naive,
        bad_generation=df["actual_mw"].isna(),
    )
    df = _drop_off_grid(df, report)
    df = _apply_window(df, report, window)

    # Latest publication wins; arrival order breaks ties. Conflicting duplicates are counted.
    df = df.assign(_order=np.arange(len(df))).sort_values(
        ["actual_publish_utc", "_order"], na_position="first"
    )
    dup = df.duplicated("start_utc", keep=False)
    if dup.any():
        spread = df[dup].groupby("start_utc")["actual_mw"].nunique()
        report.conflicting_duplicates = int((spread > 1).sum())
    before = len(df)
    df = df.drop_duplicates("start_utc", keep="last")
    report.duplicates_removed = before - len(df)

    report.negative_values = int((df["actual_mw"] < 0).sum())
    out = df[columns].sort_values("start_utc").reset_index(drop=True)
    report.rows_kept = len(out)
    return out, report


def normalize_forecasts(
    records: Sequence[Mapping[str, Any]],
    *,
    window: tuple[pd.Timestamp, pd.Timestamp] | None = None,
) -> tuple[pd.DataFrame, NormalizationReport]:
    """WINDFOR records -> ``start_utc, publish_utc, forecast_mw`` (one row per (start, publish))."""
    report = NormalizationReport(dataset=WINDFOR, rows_in=len(records))
    columns = ["start_utc", "publish_utc", "forecast_mw"]
    check_contract(records, WINDFOR)
    df = _frame(records)
    if df.empty:
        return _empty(columns), report

    start, naive_start = _parse_timestamps(df["startTime"])
    publish, naive_publish = _parse_timestamps(df["publishTime"])
    df["start_utc"] = start
    df["publish_utc"] = publish
    df["forecast_mw"] = to_mw(_numeric(df["generation"]))

    df = _drop_invalid(
        df,
        report,
        naive_start=naive_start,
        bad_start=df["start_utc"].isna() & ~naive_start,
        naive_publish=naive_publish,
        bad_publish=df["publish_utc"].isna() & ~naive_publish,
        bad_generation=df["forecast_mw"].isna(),
    )
    df = _drop_off_grid(df, report)
    df = _apply_window(df, report, window)

    df = df.assign(_order=np.arange(len(df))).sort_values("_order")
    keys = ["start_utc", "publish_utc"]
    dup = df.duplicated(keys, keep=False)
    if dup.any():
        spread = df[dup].groupby(keys)["forecast_mw"].nunique()
        report.conflicting_duplicates = int((spread > 1).sum())
    before = len(df)
    df = df.drop_duplicates(keys, keep="last")
    report.duplicates_removed = before - len(df)

    report.negative_values = int((df["forecast_mw"] < 0).sum())
    report.published_after_delivery_start = int((df["publish_utc"] > df["start_utc"]).sum())
    out = df[columns].sort_values(["publish_utc", "start_utc"]).reset_index(drop=True)
    report.rows_kept = len(out)
    return out, report


def _empty(columns: list[str]) -> pd.DataFrame:
    dtypes = {
        "start_utc": "datetime64[ns, UTC]",
        "publish_utc": "datetime64[ns, UTC]",
        "actual_publish_utc": "datetime64[ns, UTC]",
        "actual_mw": "float64",
        "forecast_mw": "float64",
    }
    return pd.DataFrame({c: pd.Series(dtype=dtypes[c]) for c in columns})


def _drop_invalid(
    df: pd.DataFrame, report: NormalizationReport, **masks: pd.Series
) -> pd.DataFrame:
    """Drop rows by reason; a row is attributed to the first reason (in argument order) that applies."""
    remaining = pd.Series(True, index=df.index)
    for reason, mask in masks.items():
        hit = mask.reindex(df.index, fill_value=False) & remaining
        report.drop(reason, int(hit.sum()))
        remaining &= ~hit
    return df[remaining]


def _drop_off_grid(df: pd.DataFrame, report: NormalizationReport) -> pd.DataFrame:
    if df.empty:
        return df
    aligned = tu.is_half_hour_aligned(df["start_utc"]).to_numpy()
    report.drop("off_grid_start_time", int((~aligned).sum()))
    return df[aligned]


# ---------------------------------------------------------------------------------------------------
# Descriptive profile of the forecast feed (shown in the data-quality panel; never assumed)
# ---------------------------------------------------------------------------------------------------


def profile_forecasts(forecasts: pd.DataFrame) -> dict[str, Any]:
    """Resolution, publication cadence and horizon measured from the data itself."""
    if forecasts.empty:
        return {
            "distinct_publish_times": 0,
            "start_resolution_minutes": None,
            "publish_cadence_minutes_median": None,
            "lead_time_hours_median": None,
            "lead_time_hours_max": None,
        }
    publish_times = pd.Series(forecasts["publish_utc"].unique()).sort_values()
    cadence = publish_times.diff().dropna().dt.total_seconds().div(60)

    sample_publish = publish_times.iloc[len(publish_times) // 2]
    one = forecasts[forecasts["publish_utc"] == sample_publish]["start_utc"].sort_values()
    step = one.diff().dropna().dt.total_seconds().div(60)

    lead = (forecasts["start_utc"] - forecasts["publish_utc"]).dt.total_seconds().div(3600)
    return {
        "distinct_publish_times": len(publish_times),
        "start_resolution_minutes": float(step.mode().iloc[0]) if len(step) else None,
        "publish_cadence_minutes_median": float(cadence.median()) if len(cadence) else None,
        "lead_time_hours_median": float(lead.median()),
        "lead_time_hours_max": float(lead.max()),
    }
