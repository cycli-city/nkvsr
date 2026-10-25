"""Forecast-accuracy metrics.

Sign convention (documented everywhere in the product): ``error = forecast - actual``.

* error > 0  -> **over-forecast**: less wind arrived than predicted. A buyer who relied on the forecast
  would have bought too little firm power and be *short*.
* error < 0  -> **under-forecast**: more wind arrived than predicted; the buyer would be *long*.

All functions here take already-matched, finite forecast/actual pairs and operate on a single eligible
observation set. A metric that cannot be defined is ``None`` ("unavailable") - never ``0`` or ``inf``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt
import pandas as pd

# WAPE's denominator is the total actual generation; below this it is not meaningful.
MIN_WAPE_DENOMINATOR_MW = 1e-6

FloatArray = npt.NDArray[np.float64]
DataStatusName = Literal["sufficient", "partial", "insufficient", "no_data"]


@dataclass(frozen=True, slots=True)
class ErrorMetrics:
    n: int
    mae: float | None
    rmse: float | None
    bias: float | None
    wape: float | None
    mean_forecast: float | None
    mean_actual: float | None
    sum_abs_error: float
    sum_actual: float


@dataclass(frozen=True, slots=True)
class ErrorDistribution:
    n: int
    n_over: int
    n_under: int
    n_exact: int
    share_over: float | None
    share_under: float | None
    mean_over_mw: float | None
    mean_under_mw: float | None
    max_over_mw: float | None
    max_under_mw: float | None
    signed_p05: float | None
    signed_p10: float | None
    signed_p50: float | None
    signed_p90: float | None
    signed_p95: float | None
    abs_p50: float | None
    abs_p90: float | None
    abs_p95: float | None


@dataclass(frozen=True, slots=True)
class Coverage:
    expected: int
    matched: int
    missing_forecast: int
    missing_actual: int
    missing_both: int
    coverage: float | None


def _as_float_array(values: Sequence[float] | pd.Series | FloatArray) -> FloatArray:
    return np.asarray(values, dtype="float64")


def _opt(value: float) -> float | None:
    return None if not np.isfinite(value) else float(value)


def compute_error_metrics(
    forecast: Sequence[float] | pd.Series | FloatArray,
    actual: Sequence[float] | pd.Series | FloatArray,
) -> ErrorMetrics:
    """MAE, RMSE, bias, WAPE and means over paired observations.

    Pairs where either value is non-finite are *rejected loudly* (``ValueError``): callers must pass the
    matched set, so a silent drop here would hide a data problem.
    """
    f = _as_float_array(forecast)
    a = _as_float_array(actual)
    if f.shape != a.shape:
        raise ValueError(f"forecast and actual must have the same length ({f.shape} vs {a.shape})")
    if f.size and not (np.isfinite(f).all() and np.isfinite(a).all()):
        raise ValueError(
            "compute_error_metrics received non-finite values; filter to matched pairs first"
        )
    n = int(f.size)
    if n == 0:
        return ErrorMetrics(0, None, None, None, None, None, None, 0.0, 0.0)

    err = f - a
    sum_abs = float(np.abs(err).sum())
    sum_actual = float(a.sum())
    wape = sum_abs / sum_actual if sum_actual > MIN_WAPE_DENOMINATOR_MW else None
    return ErrorMetrics(
        n=n,
        mae=sum_abs / n,
        rmse=float(np.sqrt(np.mean(err**2))),
        bias=float(err.mean()),
        wape=wape,
        mean_forecast=float(f.mean()),
        mean_actual=float(a.mean()),
        sum_abs_error=sum_abs,
        sum_actual=sum_actual,
    )


def compute_error_distribution(
    error: Sequence[float] | pd.Series | FloatArray,
) -> ErrorDistribution:
    """Over/under-forecast split and empirical quantiles of the signed error (linear interpolation)."""
    e = _as_float_array(error)
    e = e[np.isfinite(e)]
    n = int(e.size)
    if n == 0:
        return ErrorDistribution(
            n=0, n_over=0, n_under=0, n_exact=0,
            share_over=None, share_under=None,
            mean_over_mw=None, mean_under_mw=None, max_over_mw=None, max_under_mw=None,
            signed_p05=None, signed_p10=None, signed_p50=None, signed_p90=None, signed_p95=None,
            abs_p50=None, abs_p90=None, abs_p95=None,
        )  # fmt: skip

    over = e[e > 0]
    under = e[e < 0]
    q = np.percentile(e, [5, 10, 50, 90, 95])
    abs_q = np.percentile(np.abs(e), [50, 90, 95])
    return ErrorDistribution(
        n=n,
        n_over=int(over.size),
        n_under=int(under.size),
        n_exact=int((e == 0).sum()),
        share_over=over.size / n,
        share_under=under.size / n,
        mean_over_mw=_opt(float(over.mean())) if over.size else None,
        mean_under_mw=_opt(float(np.abs(under).mean())) if under.size else None,
        max_over_mw=_opt(float(np.max(over))) if over.size else None,
        max_under_mw=_opt(float(np.max(np.abs(under)))) if under.size else None,
        signed_p05=float(q[0]),
        signed_p10=float(q[1]),
        signed_p50=float(q[2]),
        signed_p90=float(q[3]),
        signed_p95=float(q[4]),
        abs_p50=float(abs_q[0]),
        abs_p90=float(abs_q[1]),
        abs_p95=float(abs_q[2]),
    )


def compute_coverage(matched: pd.DataFrame) -> Coverage:
    """Coverage = matched intervals / expected eligible intervals (one row per expected interval)."""
    expected = len(matched)
    if expected == 0:
        return Coverage(0, 0, 0, 0, 0, None)
    status = matched["match_status"]
    matched_n = int((status == "matched").sum())
    return Coverage(
        expected=expected,
        matched=matched_n,
        missing_forecast=int((status == "missing_forecast").sum()),
        missing_actual=int((status == "missing_actual").sum()),
        missing_both=int((status == "missing_both").sum()),
        coverage=matched_n / expected,
    )


def data_status(coverage: Coverage, *, sufficient: float, partial: float) -> DataStatusName:
    """Traffic-light summary of whether the analysis is supported by enough data.

    ``no_data`` (nothing expected or nothing matched), ``insufficient`` (< ``partial``),
    ``partial`` (< ``sufficient``) or ``sufficient``.
    """
    if coverage.expected == 0 or coverage.matched == 0 or coverage.coverage is None:
        return "no_data"
    if coverage.coverage >= sufficient:
        return "sufficient"
    if coverage.coverage >= partial:
        return "partial"
    return "insufficient"


def skill_vs_baseline(
    forecast: pd.Series, baseline: pd.Series, actual: pd.Series
) -> dict[str, float | int | None]:
    """MAE skill of ``forecast`` against ``baseline`` on the intervals where all three are finite.

    ``skill = 1 - MAE_forecast / MAE_baseline`` (positive = forecast beats the baseline). Returned with
    its own ``n`` because this common subset can be smaller than the headline matched set.
    """
    frame = pd.DataFrame({"f": forecast, "b": baseline, "a": actual}).dropna()
    n = len(frame)
    if n == 0:
        return {"n": 0, "mae_forecast": None, "mae_baseline": None, "skill": None}
    mae_f = float((frame["f"] - frame["a"]).abs().mean())
    mae_b = float((frame["b"] - frame["a"]).abs().mean())
    skill = 1.0 - mae_f / mae_b if mae_b > 0 else None
    return {"n": n, "mae_forecast": mae_f, "mae_baseline": mae_b, "skill": skill}
