"""Response of ``GET /api/cutoff-sensitivity``."""

from __future__ import annotations

from pydantic import Field

from .base import ApiModel
from .common import AnalysisEcho, ProvenanceOut


class SensitivityPoint(ApiModel):
    cutoff_local: str = Field(
        description="Decision cutoff HH:MM Europe/London on the day before delivery."
    )
    is_selected: bool = Field(
        description="True for the cutoff the user chose (the one every KPI uses)."
    )
    is_run_time: bool = Field(
        description="True when the cutoff sits at an observed WINDFOR publication run."
    )
    run_used_local: str | None = Field(
        description="Local time of the publication run that supplied most of the forecasts at this cutoff."
    )
    n: int
    coverage: float | None
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    wape: float | None
    median_forecast_age_h: float | None = Field(
        description="Median hours between the forecast's publication and this cutoff."
    )


class CutoffSensitivityResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    selected_cutoff: str
    run_times_local: list[str] = Field(
        description="Publication runs seen on at least a quarter of the days in the data, as local HH:MM."
    )
    points: list[SensitivityPoint] = Field(
        description="One per run time plus the selected cutoff, in time order."
    )
    note: str
