"""Small converters from pandas/domain values to the API's response models (NaN-safe, timezone-aware)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from app.api import schemas as s
from app.domain import timeutil as tu
from app.domain.breakdowns import GroupResult
from app.domain.metrics import ErrorDistribution, ErrorMetrics


def num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def stamp(value: Any) -> datetime | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).to_pydatetime()


def stamp_req(value: Any) -> datetime:
    """Like :func:`stamp` for fields the schema requires; a missing value is a programming error."""
    ts = stamp(value)
    if ts is None:
        raise ValueError("a required timestamp is missing from the matched table")
    return ts


def rows_of(frame: pd.DataFrame) -> Iterator[Any]:
    """Iterate rows with attribute access (pandas-stubs cannot type namedtuples by column)."""
    return frame.itertuples(index=False)


def metrics_out(m: ErrorMetrics) -> s.MetricsOut:
    return s.MetricsOut(
        n=m.n,
        mae_mw=m.mae,
        rmse_mw=m.rmse,
        bias_mw=m.bias,
        wape=m.wape,
        mean_forecast_mw=m.mean_forecast,
        mean_actual_mw=m.mean_actual,
    )


def group_fields(g: GroupResult) -> dict[str, Any]:
    m = g.metrics
    return {
        "expected": g.expected,
        "n": m.n,
        "coverage": g.coverage,
        "mae_mw": m.mae,
        "rmse_mw": m.rmse,
        "bias_mw": m.bias,
        "wape": m.wape,
        "mean_forecast_mw": m.mean_forecast,
        "mean_actual_mw": m.mean_actual,
    }


def distribution_out(d: ErrorDistribution) -> s.ErrorDistributionOut:
    return s.ErrorDistributionOut(
        n=d.n, n_over=d.n_over, n_under=d.n_under, n_exact=d.n_exact,
        share_over=d.share_over, share_under=d.share_under,
        mean_over_mw=d.mean_over_mw, mean_under_mw=d.mean_under_mw,
        max_over_mw=d.max_over_mw, max_under_mw=d.max_under_mw,
        signed_p05_mw=d.signed_p05, signed_p10_mw=d.signed_p10, signed_p50_mw=d.signed_p50,
        signed_p90_mw=d.signed_p90, signed_p95_mw=d.signed_p95,
        abs_p50_mw=d.abs_p50, abs_p90_mw=d.abs_p90, abs_p95_mw=d.abs_p95,
    )  # fmt: skip


def interval_row(r: Any) -> s.IntervalRow:
    local = pd.Timestamp(r.start_utc).tz_convert(tu.LONDON)
    return s.IntervalRow(
        start_time=stamp_req(r.start_utc),
        delivery_date=r.delivery_date,
        local_label=local.strftime("%Y-%m-%d %H:%M"),
        settlement_period=int(r.settlement_period),
        decision_cutoff_time=stamp_req(r.cutoff_utc),
        forecast_publish_time=stamp(r.publish_utc),
        forecast_mw=num(r.forecast_mw),
        actual_mw=num(r.actual_mw),
        error_mw=num(r.error_mw),
        abs_error_mw=num(r.abs_error_mw),
        forecast_age_h=num(r.forecast_age_h),
        lead_time_h=num(r.lead_time_h),
        latest_forecast_mw=num(r.latest_forecast_mw),
        latest_publish_time=stamp(r.latest_publish_utc),
        match_status=r.match_status,
    )


def vars_of(obj: Any) -> dict[str, Any]:
    """Dataclass (slots) -> dict, for splatting into response models."""
    return {name: getattr(obj, name) for name in obj.__dataclass_fields__}
