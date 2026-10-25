"""``GET /api/accuracy``: breakdowns by day, half-hour slot and day/night, error histogram, largest misses."""

from __future__ import annotations

from datetime import timedelta

from app.api import schemas as s
from app.domain.breakdowns import (
    by_daypart,
    by_delivery_day,
    by_slot,
    histogram,
    largest_errors,
)
from app.domain.matching import matched_only
from app.domain.metrics import compute_coverage, compute_error_distribution, compute_error_metrics

from .constants import DAYPART_DEFINITION
from .context import Ctx
from .convert import distribution_out, group_fields, interval_row, metrics_out, rows_of, vars_of
from .core import AnalysisCore


def build_accuracy(core: AnalysisCore, ctx: Ctx) -> s.AccuracyResponse:
    frame = core.matched(ctx)
    m = matched_only(frame)
    daily = [
        s.DailyAccuracy(
            delivery_date=g.key, decision_date=g.key - timedelta(days=1), **group_fields(g)
        )
        for g in by_delivery_day(frame)
    ]
    slots = [
        s.SlotAccuracy(
            slot=str(g.key),
            settlement_period=int(str(g.key)[:2]) * 2 + int(str(g.key)[3:]) // 30 + 1,
            **group_fields(g),
        )
        for g in by_slot(frame)
    ]
    dayparts = [
        s.DaypartAccuracy(
            daypart=g.key, definition=DAYPART_DEFINITION[str(g.key)], **group_fields(g)
        )
        for g in by_daypart(frame)
    ]
    hist = histogram(m["error_mw"])
    return s.AccuracyResponse(
        analysis=core.analysis_echo(ctx),
        provenance=core.provenance(ctx.dataset),
        coverage=s.CoverageOut(**vars_of(compute_coverage(frame))),
        metrics=metrics_out(compute_error_metrics(m["forecast_mw"], m["actual_mw"])),
        daily=daily,
        by_slot=slots,
        by_daypart=dayparts,
        histogram=s.HistogramOut(
            bin_width_mw=hist["bin_width_mw"],
            bins=[
                s.HistogramBin(lower_mw=b["lower"], upper_mw=b["upper"], count=b["count"])
                for b in hist["bins"]
            ],
        ),
        error_distribution=distribution_out(compute_error_distribution(m["error_mw"])),
        largest_errors=[interval_row(r) for r in rows_of(largest_errors(frame, 10))],
    )
