"""``GET /api/intervals`` (paged, sortable, filterable table) and its CSV export."""

from __future__ import annotations

import pandas as pd

from app.api import schemas as s
from app.domain import timeutil as tu
from app.errors import InvalidRequestError

from .constants import SORT_COLUMNS, STATUS_FILTERS
from .context import Ctx, IntervalQuery
from .convert import interval_row, rows_of
from .core import AnalysisCore


def filtered(core: AnalysisCore, ctx: Ctx, query: IntervalQuery) -> pd.DataFrame:
    if query.sort_by not in SORT_COLUMNS:
        raise InvalidRequestError(f"sort_by must be one of {sorted(SORT_COLUMNS)}")
    if query.sort_dir not in {"asc", "desc"}:
        raise InvalidRequestError("sort_dir must be 'asc' or 'desc'")
    if query.status not in STATUS_FILTERS:
        raise InvalidRequestError(f"status must be one of {sorted(STATUS_FILTERS)}")
    if query.direction not in {None, "over", "under"}:
        raise InvalidRequestError("direction must be 'over' or 'under'")

    frame = core.matched(ctx)
    if query.status == "missing_any":
        frame = frame[frame["match_status"] != "matched"]
    elif query.status != "all":
        frame = frame[frame["match_status"] == query.status]
    if query.direction == "over":
        frame = frame[frame["error_mw"] > 0]
    elif query.direction == "under":
        frame = frame[frame["error_mw"] < 0]
    if query.min_abs_error is not None:
        frame = frame[frame["abs_error_mw"] >= query.min_abs_error]
    if query.q:
        tokens = query.q.lower().split()
        local = frame["start_utc"].dt.tz_convert(tu.LONDON).dt.strftime("%Y-%m-%d %H:%M %a")
        haystack = (local + " " + frame["match_status"].str.replace("_", " ")).str.lower()
        for token in tokens:
            frame = frame[haystack.loc[frame.index].str.contains(token, regex=False)]
            haystack = haystack.loc[frame.index]
    return frame.sort_values(
        [SORT_COLUMNS[query.sort_by], "start_utc"],
        ascending=[query.sort_dir == "asc", True],
        na_position="last",
        kind="stable",
    )


def build_intervals(core: AnalysisCore, ctx: Ctx, query: IntervalQuery) -> s.IntervalsResponse:
    frame = filtered(core, ctx, query)
    total = len(frame)
    pages = max(1, -(-total // query.page_size))
    page = min(max(1, query.page), pages)
    window = frame.iloc[(page - 1) * query.page_size : page * query.page_size]
    return s.IntervalsResponse(
        analysis=core.analysis_echo(ctx),
        provenance=core.provenance(ctx.dataset),
        total=total,
        page=page,
        page_size=query.page_size,
        total_pages=pages,
        items=[interval_row(r) for r in rows_of(window)],
    )


def build_intervals_csv(core: AnalysisCore, ctx: Ctx, query: IntervalQuery) -> str:
    frame = filtered(core, ctx, query)
    out = pd.DataFrame(
        {
            "start_time_utc": frame["start_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "local_time": frame["start_utc"].dt.tz_convert(tu.LONDON).dt.strftime("%Y-%m-%d %H:%M"),
            "settlement_period": frame["settlement_period"],
            "decision_cutoff_utc": frame["cutoff_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "forecast_valid_for_utc": frame["forecast_for_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "forecast_publish_utc": frame["publish_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "forecast_mw": frame["forecast_mw"],
            "actual_mw": frame["actual_mw"],
            "error_mw_forecast_minus_actual": frame["error_mw"],
            "abs_error_mw": frame["abs_error_mw"],
            "forecast_age_h": frame["forecast_age_h"],
            "latest_forecast_mw_hindsight": frame["latest_forecast_mw"],
            "match_status": frame["match_status"],
        }
    )
    return out.to_csv(index=False, na_rep="")
