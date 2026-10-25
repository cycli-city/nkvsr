"""Health, metadata and refresh responses."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field

from app.domain.windows import Basis

from .base import ApiModel
from .common import ProvenanceOut


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


class RefreshResponse(ApiModel):
    status: Literal["ok"]
    retrieved_at: datetime
    actuals_rows: int
    forecasts_rows: int
    warnings: list[str]
