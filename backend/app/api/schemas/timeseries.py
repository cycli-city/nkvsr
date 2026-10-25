"""Response of ``GET /api/timeseries``."""

from __future__ import annotations

from datetime import date, datetime

from .base import ApiModel, MatchStatus
from .common import AnalysisEcho, ProvenanceOut


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
