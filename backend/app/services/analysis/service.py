"""The service the API routes talk to: one method per endpoint, each delegating to its own module."""

from __future__ import annotations

from datetime import date, datetime

from app.api import schemas as s

from .accuracy import build_accuracy
from .brief import build_decision_brief
from .context import Ctx, IntervalQuery
from .core import AnalysisCore
from .intervals import build_intervals, build_intervals_csv
from .metadata import build_metadata
from .sensitivity import build_cutoff_sensitivity
from .series import build_timeseries
from .summary import build_summary
from .vintages import build_vintages


class AnalysisService(AnalysisCore):
    """Turns validated requests into typed responses; see :class:`AnalysisCore` for the shared machinery."""

    def summary(self, ctx: Ctx) -> s.SummaryResponse:
        return build_summary(self, ctx)

    def timeseries(self, ctx: Ctx) -> s.TimeSeriesResponse:
        return build_timeseries(self, ctx)

    def accuracy(self, ctx: Ctx) -> s.AccuracyResponse:
        return build_accuracy(self, ctx)

    def intervals(self, ctx: Ctx, query: IntervalQuery) -> s.IntervalsResponse:
        return build_intervals(self, ctx, query)

    def intervals_csv(self, ctx: Ctx, query: IntervalQuery) -> str:
        return build_intervals_csv(self, ctx, query)

    def vintages(self, start: datetime, cutoff: str | None) -> s.VintagesResponse:
        return build_vintages(self, start, cutoff)

    def cutoff_sensitivity(self, ctx: Ctx) -> s.CutoffSensitivityResponse:
        return build_cutoff_sensitivity(self, ctx)

    def decision_brief(self, decision_date: date, cutoff: str | None) -> s.DecisionBriefResponse:
        return build_decision_brief(self, decision_date, cutoff)

    def metadata(self) -> s.MetadataResponse:
        return build_metadata(self)
