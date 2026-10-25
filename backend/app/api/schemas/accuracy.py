"""Response of ``GET /api/accuracy`` and its breakdown rows."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import Field

from .base import ApiModel
from .common import (
    AnalysisEcho,
    CoverageOut,
    ErrorDistributionOut,
    IntervalRow,
    MetricsOut,
    ProvenanceOut,
)


class GroupAccuracy(ApiModel):
    expected: int
    n: int
    coverage: float | None
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None


class DailyAccuracy(GroupAccuracy):
    delivery_date: date
    decision_date: date


class SlotAccuracy(GroupAccuracy):
    slot: str = Field(description="Local wall-clock half-hour start, HH:MM.")
    settlement_period: int = Field(description="Settlement period on a standard 48-period day.")


class DaypartAccuracy(GroupAccuracy):
    daypart: Literal["day", "night"]
    definition: str


class HistogramBin(ApiModel):
    lower_mw: float
    upper_mw: float
    count: int


class HistogramOut(ApiModel):
    bin_width_mw: float | None
    bins: list[HistogramBin]


class AccuracyResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    coverage: CoverageOut
    metrics: MetricsOut
    daily: list[DailyAccuracy]
    by_slot: list[SlotAccuracy]
    by_daypart: list[DaypartAccuracy]
    histogram: HistogramOut
    error_distribution: ErrorDistributionOut
    largest_errors: list[IntervalRow]
