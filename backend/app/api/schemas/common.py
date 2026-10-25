"""Building blocks reused by several endpoint responses (provenance, analysis echo, metrics, coverage, interval rows)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.domain.metrics import DataStatusName
from app.domain.windows import Basis

from .base import ApiModel, MatchStatus, Provenance


class ProvenanceOut(ApiModel):
    provenance: Provenance
    is_synthetic: bool = Field(
        description="True only for the development fixture; never for Elexon data."
    )
    source_name: str
    retrieved_at: datetime = Field(
        description="When the snapshot was last successfully retrieved (UTC)."
    )
    unit: str
    attribution: str


class AnalysisEcho(ApiModel):
    """The exact interpretation a response was computed under (never mixed across bases)."""

    basis: Basis
    decision_from: date
    decision_to: date
    delivery_from: date
    delivery_to: date
    n_delivery_days: int
    cutoff_local: str = Field(
        description="Decision cutoff, 24h HH:MM, Europe/London, on the day before delivery."
    )
    cutoff_timezone: str = "Europe/London"
    cutoff_rule: str
    forecast_basis: Literal["decision_time"] = "decision_time"
    forecast_block_minutes: int = Field(
        description="Span covered by one WINDFOR value: 60 for the hourly feed under 'hold', else 30."
    )
    forecast_alignment: Literal["hold", "exact"] = Field(
        description="'hold' applies each forecast hour to both half-hours it covers; 'exact' only matches identical start times."
    )
    forecast_alignment_note: str | None = Field(
        description="How forecasts were mapped onto half-hours; null when the grids already coincide."
    )
    error_convention: Literal["forecast_minus_actual"] = "forecast_minus_actual"
    unit: str = "MW"


class MetricsOut(ApiModel):
    n: int = Field(description="Number of valid matched half-hourly observations.")
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None = Field(
        description="Mean of (forecast - actual). Positive = over-forecast."
    )
    wape: float | None = Field(description="Sum|error| / Sum(actual); null when not meaningful.")
    mean_forecast_mw: float | None
    mean_actual_mw: float | None


class CoverageOut(ApiModel):
    expected: int
    matched: int
    missing_forecast: int
    missing_actual: int
    missing_both: int
    coverage: float | None


class DataStatusOut(ApiModel):
    status: DataStatusName
    message: str
    sufficient_threshold: float
    partial_threshold: float


class ErrorDistributionOut(ApiModel):
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
    signed_p05_mw: float | None
    signed_p10_mw: float | None
    signed_p50_mw: float | None
    signed_p90_mw: float | None
    signed_p95_mw: float | None
    abs_p50_mw: float | None
    abs_p90_mw: float | None
    abs_p95_mw: float | None


class BaselineOut(ApiModel):
    key: Literal["persistence", "trailing_mean"]
    label: str
    description: str
    n: int = Field(
        description="Intervals where forecast, actual and this baseline are all available."
    )
    mae_forecast_mw: float | None
    mae_baseline_mw: float | None
    skill: float | None = Field(
        description="1 - MAE_forecast / MAE_baseline. Positive = forecast is better."
    )


class HindsightOut(ApiModel):
    """Latest-published forecast (includes revisions after the cutoff). Context only - never used in KPIs."""

    n: int
    mae_mw: float | None
    bias_mw: float | None
    note: str


class ForecastAgeOut(ApiModel):
    median_h: float | None
    p95_h: float | None
    max_h: float | None
    stale_threshold_h: float
    n_stale: int


class IntervalRow(ApiModel):
    start_time: datetime = Field(description="Delivery interval start (UTC).")
    delivery_date: date
    local_label: str = Field(description="Local delivery time, 'YYYY-MM-DD HH:MM' (Europe/London).")
    settlement_period: int
    decision_cutoff_time: datetime
    forecast_publish_time: datetime | None
    forecast_mw: float | None
    actual_mw: float | None
    error_mw: float | None
    abs_error_mw: float | None
    forecast_age_h: float | None = Field(description="Cutoff minus publication time.")
    lead_time_h: float | None = Field(description="Delivery start minus publication time.")
    latest_forecast_mw: float | None
    latest_publish_time: datetime | None
    match_status: MatchStatus
