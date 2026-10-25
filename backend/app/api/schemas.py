"""Pydantic response models: the typed contract between backend and frontend.

The frontend TypeScript types are *generated from the OpenAPI document* produced from these models, so
changing a field here is a compile error in the UI until it is handled. ``None`` always means
"unavailable / not applicable" - never zero.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.metrics import DataStatusName
from app.domain.windows import Basis

MatchStatus = Literal["matched", "missing_forecast", "missing_actual", "missing_both"]
Provenance = Literal["elexon_live", "synthetic_dev"]


class ApiModel(BaseModel):
    """Base for every response model.

    ``json_schema_serialization_defaults_required`` makes fields that have defaults (e.g. empty lists,
    ``None``) *required* in the OpenAPI output schema. The API always sends them, and the generated
    TypeScript types are then accurate instead of forcing needless optional-chaining in the UI.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class ErrorBody(ApiModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody


# ---------------------------------------------------------------------------------------------------
# Shared building blocks
# ---------------------------------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------------------------------
# Endpoint responses
# ---------------------------------------------------------------------------------------------------


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    version: str
    data_loaded: bool


class SourceLink(ApiModel):
    code: str
    endpoint: str
    documentation_url: str
    query_parameters: dict[str, str]


class BasisInfo(ApiModel):
    id: Basis
    label: str
    description: str
    date_type: Literal["decision", "delivery"]
    min_date: date
    max_date: date
    default_from: date
    default_to: date


class CutoffPreset(ApiModel):
    value: str
    label: str
    note: str


class RefreshOut(ApiModel):
    status: Literal["never", "running", "ok", "failed"]
    last_attempt_at: datetime | None
    last_success_at: datetime | None
    error: str | None


class Thresholds(ApiModel):
    coverage_sufficient: float
    coverage_partial: float
    stale_forecast_hours: float
    max_range_days: int


class MetadataResponse(ApiModel):
    app_version: str
    data_available: bool
    load_error: str | None = None
    refresh: RefreshOut
    provenance: ProvenanceOut | None = None
    sources: list[SourceLink] = Field(default_factory=list)
    analysis_month: str
    bases: list[BasisInfo]
    default_basis: Basis
    default_cutoff: str
    cutoff_presets: list[CutoffPreset]
    forecast_alignment: Literal["hold", "exact"] = Field(
        description="How hourly forecasts are mapped onto half-hourly actuals (server setting)."
    )
    thresholds: Thresholds
    delivery_coverage_from: date | None = None
    delivery_coverage_to: date | None = None
    actuals_rows: int | None = None
    forecasts_rows: int | None = None
    quality: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    sign_convention: str
    unit: str


class SummaryResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    data_status: DataStatusOut
    coverage: CoverageOut
    metrics: MetricsOut
    error_distribution: ErrorDistributionOut
    baselines: list[BaselineOut]
    hindsight_latest: HindsightOut
    forecast_age: ForecastAgeOut


class TimeSeriesPoint(ApiModel):
    start_time: datetime
    delivery_date: date
    settlement_period: int
    actual_mw: float | None
    forecast_mw: float | None
    forecast_publish_time: datetime | None
    latest_forecast_mw: float | None
    latest_publish_time: datetime | None
    error_mw: float | None
    match_status: MatchStatus


class TimeSeriesResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    points: list[TimeSeriesPoint]


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


class IntervalsResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    total: int
    page: int
    page_size: int
    total_pages: int
    items: list[IntervalRow]


class VintageRow(ApiModel):
    publish_time: datetime
    forecast_mw: float
    lead_time_h: float = Field(description="Delivery start minus publication time.")
    minutes_from_cutoff: float = Field(
        description="Publication minus cutoff; negative = before the cutoff."
    )
    eligible: bool = Field(description="publish_time <= decision cutoff")
    selected: bool = Field(
        description="The latest eligible publication - the one used in all KPIs."
    )


class VintagesResponse(ApiModel):
    provenance: ProvenanceOut
    start_time: datetime
    local_label: str
    delivery_date: date
    settlement_period: int
    forecast_for_time: datetime = Field(
        description="Start of the WINDFOR block this half-hour's forecast refers to (equals start_time unless forecasts are hourly)."
    )
    forecast_block_minutes: int
    forecast_alignment_note: str | None
    cutoff_local: str
    cutoff_time: datetime
    actual_mw: float | None
    selected: VintageRow | None
    latest: VintageRow | None
    n_vintages: int
    n_eligible: int
    vintages: list[VintageRow]
    explanation: str | None = Field(
        description="Set when the comparison cannot be shown in full, and why."
    )


class BriefPoint(ApiModel):
    start_time: datetime
    slot: str
    forecast_mw: float | None
    forecast_publish_time: datetime | None
    actual_mw: float | None
    error_mw: float | None


class ForecastSetSummary(ApiModel):
    n_intervals: int
    n_with_forecast: int
    distinct_publications: int
    first_publish_time: datetime | None
    last_publish_time: datetime | None
    mean_mw: float | None
    peak_mw: float | None
    peak_time: datetime | None
    trough_mw: float | None
    trough_time: datetime | None
    energy_mwh: float | None = Field(
        description="Sum of forecast MW x 0.5 h over intervals with a forecast."
    )


class BriefHindsight(ApiModel):
    n_matched: int
    mean_actual_mw: float | None
    mae_mw: float | None
    bias_mw: float | None
    latest_mean_mw: float | None = Field(
        description="Mean of the latest-published forecast (hindsight)."
    )
    note: str


class DecisionBriefResponse(ApiModel):
    provenance: ProvenanceOut
    decision_date: date
    delivery_date: date
    cutoff_local: str
    cutoff_time: datetime
    forecast_set: ForecastSetSummary
    hindsight: BriefHindsight
    points: list[BriefPoint]


class RefreshResponse(ApiModel):
    status: Literal["ok"]
    retrieved_at: datetime
    actuals_rows: int
    forecasts_rows: int
    warnings: list[str]
