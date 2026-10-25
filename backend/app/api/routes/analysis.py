"""Read-only analytics endpoints. All are pure functions of (snapshot, query parameters)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.api import schemas as s
from app.api.deps import AnalysisCtx, CutoffParam, get_service
from app.services.analysis import AnalysisService, IntervalQuery

router = APIRouter(prefix="/api", tags=["analysis"])
Service = Annotated[AnalysisService, Depends(get_service)]

ERRORS: dict[int | str, dict[str, Any]] = {
    422: {"model": s.ErrorResponse, "description": "Invalid parameters"},
    503: {"model": s.ErrorResponse, "description": "No dataset loaded"},
}


@router.get(
    "/summary", response_model=s.SummaryResponse, responses=ERRORS, summary="Executive KPIs"
)
def summary(ctx: AnalysisCtx, service: Service) -> s.SummaryResponse:
    """Headline accuracy metrics, coverage, data-sufficiency status and baseline comparison.

    All KPIs use the forecast that was **available at the decision cutoff** (latest publication with
    `publishTime <= cutoff`). Later revisions appear only under `hindsight_latest`, for context.
    """
    return service.summary(ctx)


@router.get(
    "/timeseries",
    response_model=s.TimeSeriesResponse,
    responses=ERRORS,
    summary="Forecast vs actual",
)
def timeseries(ctx: AnalysisCtx, service: Service) -> s.TimeSeriesResponse:
    """One point per expected half-hourly delivery interval (gaps are returned as nulls, never filled)."""
    return service.timeseries(ctx)


@router.get(
    "/accuracy", response_model=s.AccuracyResponse, responses=ERRORS, summary="Accuracy breakdowns"
)
def accuracy(ctx: AnalysisCtx, service: Service) -> s.AccuracyResponse:
    """Daily trend, time-of-day, day/night, error distribution and the largest errors."""
    return service.accuracy(ctx)


IntervalSort = Literal[
    "start_time", "forecast", "actual", "error", "abs_error", "publish_time", "forecast_age"
]
IntervalStatus = Literal[
    "all", "matched", "missing_any", "missing_forecast", "missing_actual", "missing_both"
]


def _interval_query(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    sort_by: IntervalSort = "start_time",
    sort_dir: Literal["asc", "desc"] = "asc",
    status: Annotated[IntervalStatus, Query(description="Filter by match status.")] = "all",
    direction: Annotated[
        Literal["over", "under"] | None, Query(description="Only over- or under-forecasts.")
    ] = None,
    min_abs_error: Annotated[
        float | None, Query(ge=0, description="Minimum |error| in MW.")
    ] = None,
    q: Annotated[
        str | None,
        Query(max_length=60, description="Free-text search over local date/time/weekday/status."),
    ] = None,
) -> IntervalQuery:
    return IntervalQuery(page, page_size, sort_by, sort_dir, status, direction, min_abs_error, q)


IntervalParams = Annotated[IntervalQuery, Depends(_interval_query)]


@router.get(
    "/intervals",
    response_model=s.IntervalsResponse,
    responses=ERRORS,
    summary="Delivery interval explorer",
)
def intervals(ctx: AnalysisCtx, service: Service, query: IntervalParams) -> s.IntervalsResponse:
    """Paginated, sortable, filterable table of the observations behind every KPI."""
    return service.intervals(ctx, query)


@router.get(
    "/intervals/export",
    responses={**ERRORS, 200: {"content": {"text/csv": {}}}},
    summary="CSV export",
)
def intervals_export(ctx: AnalysisCtx, service: Service, query: IntervalParams) -> Response:
    """The same filtered table as `/intervals`, unpaginated, as CSV (UTC and local timestamps)."""
    body = service.intervals_csv(ctx, query)
    name = f"windscope_{ctx.window.basis.value}_{ctx.window.delivery_from}_{ctx.window.delivery_to}.csv"
    return Response(
        body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get(
    "/forecast-vintages",
    response_model=s.VintagesResponse,
    responses={**ERRORS, 404: {"model": s.ErrorResponse}},
    summary="Forecast revisions for one delivery interval",
)
def forecast_vintages(
    service: Service,
    start: Annotated[
        datetime,
        Query(description="Delivery interval start with timezone, e.g. 2026-01-15T08:30:00Z."),
    ],
    cutoff: CutoffParam = None,
) -> s.VintagesResponse:
    """Every stored WINDFOR publication for the interval, with the one eligible at the cutoff marked."""
    return service.vintages(start, cutoff)


@router.get(
    "/decision-brief",
    response_model=s.DecisionBriefResponse,
    responses=ERRORS,
    summary="One decision, one delivery day",
)
def decision_brief(
    service: Service,
    decision_date: Annotated[
        date, Query(description="Local date on which the day-ahead decision is made.")
    ],
    cutoff: CutoffParam = None,
) -> s.DecisionBriefResponse:
    """The forecast set a buyer could see at the cutoff for the *next* delivery day, plus hindsight vs actuals."""
    return service.decision_brief(decision_date, cutoff)
