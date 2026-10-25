"""``GET /api/timeseries``: every delivery half-hour with actual, decision-time forecast and hindsight forecast."""

from __future__ import annotations

from app.api import schemas as s

from .context import Ctx
from .convert import num, rows_of, stamp, stamp_req
from .core import AnalysisCore


def build_timeseries(core: AnalysisCore, ctx: Ctx) -> s.TimeSeriesResponse:
    frame = core.matched(ctx)
    points = [
        s.TimeSeriesPoint(
            start_time=stamp_req(r.start_utc),
            delivery_date=r.delivery_date,
            settlement_period=int(r.settlement_period),
            actual_mw=num(r.actual_mw),
            forecast_mw=num(r.forecast_mw),
            forecast_publish_time=stamp(r.publish_utc),
            latest_forecast_mw=num(r.latest_forecast_mw),
            latest_publish_time=stamp(r.latest_publish_utc),
            error_mw=num(r.error_mw),
            match_status=r.match_status,
        )
        for r in rows_of(frame)
    ]
    return s.TimeSeriesResponse(
        analysis=core.analysis_echo(ctx), provenance=core.provenance(ctx.dataset), points=points
    )
