"""Response of ``GET /api/decision-brief``."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from .base import ApiModel
from .common import ProvenanceOut


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
