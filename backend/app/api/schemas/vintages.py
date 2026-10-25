"""Response of ``GET /api/forecast-vintages``."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from .base import ApiModel
from .common import ProvenanceOut


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
