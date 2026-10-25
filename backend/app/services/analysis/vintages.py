"""``GET /api/forecast-vintages``: every publication for one delivery half-hour and which one was usable at the cutoff."""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from app.api import schemas as s
from app.domain import timeutil as tu
from app.domain.vintage import forecast_block_starts, list_vintages
from app.errors import InvalidRequestError, NotFoundError

from .convert import num, rows_of, stamp_req
from .core import AnalysisCore


def build_vintages(core: AnalysisCore, start: datetime, cutoff: str | None) -> s.VintagesResponse:
    dataset = core.store.get()
    if start.tzinfo is None:
        raise InvalidRequestError("start must include a timezone (e.g. 2026-01-15T08:30:00Z)")
    start_utc = pd.Timestamp(start).tz_convert("UTC")
    if not bool(tu.is_half_hour_aligned(pd.Series([start_utc])).iloc[0]):
        raise InvalidRequestError("start must fall on a :00 or :30 boundary")
    cutoff_time, cutoff_str = core.parse_cutoff(cutoff)
    delivery_day = start_utc.tz_convert(tu.LONDON).date()
    cov_from, cov_to = (
        dataset.manifest.delivery_coverage_from,
        dataset.manifest.delivery_coverage_to,
    )
    if delivery_day < cov_from or delivery_day > cov_to:
        raise NotFoundError(
            f"No data for delivery date {delivery_day}; coverage is {cov_from}..{cov_to}"
        )

    cutoff_utc = tu.cutoff_utc_for_delivery_date(delivery_day, cutoff_time)
    block_minutes = core.forecast_block_minutes(dataset)
    table = list_vintages(dataset.forecasts, start_utc, cutoff_utc, block_minutes=block_minutes)
    forecast_for = forecast_block_starts(pd.Series([start_utc]), block_minutes).iloc[0]
    actual_row = dataset.actuals[dataset.actuals["start_utc"] == start_utc]
    actual = num(actual_row["actual_mw"].iloc[-1]) if len(actual_row) else None

    rows = [
        s.VintageRow(
            publish_time=stamp_req(r.publish_utc),
            forecast_mw=float(r.forecast_mw),
            lead_time_h=float(r.lead_time_h),
            minutes_from_cutoff=float((r.publish_utc - cutoff_utc) / pd.Timedelta(minutes=1)),
            eligible=bool(r.eligible),
            selected=bool(r.selected),
        )
        for r in rows_of(table)
    ]
    n_eligible = sum(1 for r in rows if r.eligible)
    if not rows:
        explanation = (
            "No WINDFOR publication is stored for this delivery interval, so no vintage comparison can "
            "be shown. Nothing has been estimated or filled in."
        )
    elif n_eligible == 0:
        explanation = (
            f"All {len(rows)} stored publications were released after the {cutoff_str} cutoff, so no "
            "forecast was available at decision time for this interval."
        )
    elif len(rows) == 1:
        explanation = "Only one publication is stored for this interval, so there is no revision history to compare."
    else:
        explanation = None
    return s.VintagesResponse(
        provenance=core.provenance(dataset),
        start_time=start_utc.to_pydatetime(),
        local_label=start_utc.tz_convert(tu.LONDON).strftime("%Y-%m-%d %H:%M"),
        delivery_date=delivery_day,
        settlement_period=int(tu.settlement_periods(pd.Series([start_utc])).iloc[0]),
        forecast_for_time=forecast_for.to_pydatetime(),
        forecast_block_minutes=block_minutes,
        forecast_alignment_note=core.alignment_note(dataset),
        cutoff_local=cutoff_str,
        cutoff_time=cutoff_utc.to_pydatetime(),
        actual_mw=actual,
        selected=next((r for r in rows if r.selected), None),
        latest=rows[-1] if rows else None,
        n_vintages=len(rows),
        n_eligible=n_eligible,
        vintages=rows,
        explanation=explanation,
    )
