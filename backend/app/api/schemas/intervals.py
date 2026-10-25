"""Response of ``GET /api/intervals``."""

from __future__ import annotations

from .base import ApiModel
from .common import AnalysisEcho, IntervalRow, ProvenanceOut


class IntervalsResponse(ApiModel):
    analysis: AnalysisEcho
    provenance: ProvenanceOut
    total: int
    page: int
    page_size: int
    total_pages: int
    items: list[IntervalRow]
