"""Pydantic response models: the typed contract between backend and frontend.

The frontend TypeScript types are *generated from the OpenAPI document* produced from these models, so changing a field
here is a compile error in the UI until it is handled. ``None`` always means "unavailable / not applicable" - never zero.

One module per endpoint family (``summary``, ``accuracy``, ``intervals``, ``vintages``, ``brief``, ``sensitivity``, ``system``);
models reused by several responses live in ``common``. Import them from the package: ``from app.api import schemas as s``.
"""

from .accuracy import (
    AccuracyResponse,
    DailyAccuracy,
    DaypartAccuracy,
    GroupAccuracy,
    HistogramBin,
    HistogramOut,
    SlotAccuracy,
)
from .base import ApiModel, ErrorBody, ErrorResponse, MatchStatus, Provenance
from .brief import BriefHindsight, BriefPoint, DecisionBriefResponse, ForecastSetSummary
from .common import (
    AnalysisEcho,
    BaselineOut,
    CoverageOut,
    DataStatusOut,
    ErrorDistributionOut,
    ForecastAgeOut,
    HindsightOut,
    IntervalRow,
    MetricsOut,
    ProvenanceOut,
)
from .intervals import IntervalsResponse
from .sensitivity import CutoffSensitivityResponse, SensitivityPoint
from .summary import SummaryResponse
from .system import (
    BasisInfo,
    CutoffPreset,
    HealthResponse,
    MetadataResponse,
    RefreshOut,
    RefreshResponse,
    SourceLink,
    Thresholds,
)
from .timeseries import TimeSeriesPoint, TimeSeriesResponse
from .vintages import VintageRow, VintagesResponse

__all__ = [
    "AccuracyResponse",
    "AnalysisEcho",
    "ApiModel",
    "BaselineOut",
    "BasisInfo",
    "BriefHindsight",
    "BriefPoint",
    "CoverageOut",
    "CutoffPreset",
    "CutoffSensitivityResponse",
    "DailyAccuracy",
    "DataStatusOut",
    "DaypartAccuracy",
    "DecisionBriefResponse",
    "ErrorBody",
    "ErrorDistributionOut",
    "ErrorResponse",
    "ForecastAgeOut",
    "ForecastSetSummary",
    "GroupAccuracy",
    "HealthResponse",
    "HindsightOut",
    "HistogramBin",
    "HistogramOut",
    "IntervalRow",
    "IntervalsResponse",
    "MatchStatus",
    "MetadataResponse",
    "MetricsOut",
    "Provenance",
    "ProvenanceOut",
    "RefreshOut",
    "RefreshResponse",
    "SensitivityPoint",
    "SlotAccuracy",
    "SourceLink",
    "SummaryResponse",
    "Thresholds",
    "TimeSeriesPoint",
    "TimeSeriesResponse",
    "VintageRow",
    "VintagesResponse",
]
