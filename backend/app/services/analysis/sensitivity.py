"""``GET /api/cutoff-sensitivity``: the same analysis re-run with only the decision cutoff moved to each publication run."""

from __future__ import annotations

import pandas as pd

from app.api import schemas as s
from app.domain import timeutil as tu
from app.domain.matching import build_matched_frame, matched_only
from app.domain.metrics import compute_coverage, compute_error_metrics
from app.store.dataset import Dataset

from .context import Ctx
from .convert import num
from .core import AnalysisCore

# A publication time must occur on at least this share of days to count as a regular "run".
RUN_MIN_DAY_SHARE = 0.25


def publication_runs(dataset: Dataset) -> list[str]:
    """Local ``HH:MM`` times at which WINDFOR is regularly published (one-off, off-schedule releases are ignored)."""
    published = tu.as_utc_ns(dataset.forecasts["publish_utc"].drop_duplicates())
    if published.empty:
        return []
    local = published.dt.tz_convert(tu.LONDON)
    clock = local.dt.strftime("%H:%M")
    days = local.dt.date.nunique()
    counts = (
        pd.DataFrame({"clock": clock, "day": local.dt.date})
        .drop_duplicates()
        .groupby("clock")
        .size()
    )
    return sorted(counts[counts >= max(1.0, RUN_MIN_DAY_SHARE * days)].index.tolist())


def build_cutoff_sensitivity(core: AnalysisCore, ctx: Ctx) -> s.CutoffSensitivityResponse:
    """Re-run the accuracy analysis as if the decision had been taken just after each regular publication run.

    Each point uses exactly the same rule as every KPI (latest publication at or before that cutoff on the day
    before delivery, same window, same eligible set); only the cutoff moves. It answers "how much does the
    decision time matter?" and shows where the chosen cutoff sits relative to the runs.
    """
    ds = ctx.dataset
    runs = publication_runs(ds)
    cutoffs = sorted({*runs, ctx.cutoff_str})
    forecasts = core.forecasts_for_window(ds, ctx)
    block = core.forecast_block_minutes(ds)
    points: list[s.SensitivityPoint] = []
    for clock in cutoffs:
        frame = build_matched_frame(
            delivery_from=ctx.window.delivery_from,
            delivery_to=ctx.window.delivery_to,
            cutoff_local=tu.parse_hhmm(clock),
            actuals=ds.actuals,
            forecasts=forecasts,
            as_of=ds.retrieved_at,
            forecast_block_minutes=block,
        )
        matched = matched_only(frame)
        metrics = compute_error_metrics(matched["forecast_mw"], matched["actual_mw"])
        cov = compute_coverage(frame)
        used = tu.as_utc_ns(matched["publish_utc"]).dt.tz_convert(tu.LONDON).dt.strftime("%H:%M")
        points.append(
            s.SensitivityPoint(
                cutoff_local=clock,
                is_selected=clock == ctx.cutoff_str,
                is_run_time=clock in runs,
                run_used_local=str(used.mode().iloc[0]) if len(used) else None,
                n=metrics.n,
                coverage=num(cov.coverage),
                mae_mw=num(metrics.mae),
                rmse_mw=num(metrics.rmse),
                bias_mw=num(metrics.bias),
                wape=num(metrics.wape),
                median_forecast_age_h=num(matched["forecast_age_h"].median())
                if len(matched)
                else None,
            )
        )
    return s.CutoffSensitivityResponse(
        analysis=core.analysis_echo(ctx),
        provenance=core.provenance(ds),
        selected_cutoff=ctx.cutoff_str,
        run_times_local=runs,
        points=points,
        note=(
            "Each point repeats the whole analysis with only the decision cutoff moved: the latest forecast "
            "published at or before that time on the day before delivery. Runs after your chosen cutoff are "
            "shown for comparison only; a buyer deciding at the chosen cutoff could not have used them."
        ),
    )
