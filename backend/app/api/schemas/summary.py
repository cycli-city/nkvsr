"""Response of ``GET /api/summary``."""

from __future__ import annotations

from .base import ApiModel
from .common import (
    AnalysisEcho,
    BaselineOut,
    CoverageOut,
    DataStatusOut,
    ErrorDistributionOut,
    ForecastAgeOut,
    HindsightOut,
    MetricsOut,
    ProvenanceOut,
)


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
