"""Aggregations of the matched table for the accuracy views.

Every aggregate is computed from the *same* eligible observation set (rows with
``match_status == 'matched'``); coverage columns additionally use all expected rows so gaps stay visible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypedDict

import numpy as np
import pandas as pd

from app.domain.matching import matched_only
from app.domain.metrics import ErrorMetrics, compute_error_metrics

# Candidate histogram bin widths in MW; the smallest giving <= MAX_BINS bins is used.
_NICE_BIN_WIDTHS = (25, 50, 100, 200, 250, 500, 1000, 2000)
MAX_BINS = 40


class HistogramBinData(TypedDict):
    lower: float
    upper: float
    count: int


class HistogramData(TypedDict):
    bin_width_mw: float | None
    bins: list[HistogramBinData]


@dataclass(frozen=True, slots=True)
class GroupResult:
    key: Any
    expected: int
    metrics: ErrorMetrics

    @property
    def coverage(self) -> float | None:
        return self.metrics.n / self.expected if self.expected else None


def _group(frame: pd.DataFrame, column: str) -> list[GroupResult]:
    results: list[GroupResult] = []
    matched = matched_only(frame)
    expected_counts = frame.groupby(column, sort=True).size()
    matched_groups: dict[Any, pd.DataFrame] = dict(tuple(matched.groupby(column, sort=True)))
    for key, expected in expected_counts.items():
        sub = matched_groups.get(key)
        metrics = (
            compute_error_metrics(sub["forecast_mw"], sub["actual_mw"])
            if sub is not None
            else compute_error_metrics([], [])
        )
        results.append(GroupResult(key=key, expected=int(expected), metrics=metrics))
    return results


def by_delivery_day(frame: pd.DataFrame) -> list[GroupResult]:
    """Per local delivery date."""
    return _group(frame, "delivery_date")


def by_slot(frame: pd.DataFrame) -> list[GroupResult]:
    """Per local wall-clock half-hour slot (00:00 ... 23:30); DST-duplicated hours share a slot."""
    return _group(frame, "slot")


def by_daypart(frame: pd.DataFrame) -> list[GroupResult]:
    """Day (07:00-23:00 local) versus night (23:00-07:00 local)."""
    return _group(frame, "daypart")


def histogram(errors: pd.Series | np.ndarray, *, max_bins: int = MAX_BINS) -> HistogramData:
    """Fixed-width histogram of signed errors, bins aligned to multiples of the width (so 0 is an edge).

    Returns ``{"bin_width_mw", "bins": [{"lower", "upper", "count"}...]}``; empty input -> no bins.
    """
    e = np.asarray(errors, dtype="float64")
    e = e[np.isfinite(e)]
    if e.size == 0:
        return {"bin_width_mw": None, "bins": []}

    span = float(e.max() - e.min())
    width = next((w for w in _NICE_BIN_WIDTHS if span / w <= max_bins), _NICE_BIN_WIDTHS[-1])
    lo = np.floor(e.min() / width) * width
    hi = (np.floor(e.max() / width) + 1) * width
    edges = np.arange(lo, hi + width, width)
    counts, edges = np.histogram(e, bins=edges)
    bins: list[HistogramBinData] = [
        {"lower": float(edges[i]), "upper": float(edges[i + 1]), "count": int(counts[i])}
        for i in range(len(counts))
    ]
    return {"bin_width_mw": float(width), "bins": bins}


def largest_errors(frame: pd.DataFrame, n: int = 10) -> pd.DataFrame:
    """The ``n`` matched intervals with the largest absolute error (ties broken by earlier start)."""
    matched = matched_only(frame)
    return matched.sort_values(
        ["abs_error_mw", "start_utc"], ascending=[False, True], kind="stable"
    ).head(n)
