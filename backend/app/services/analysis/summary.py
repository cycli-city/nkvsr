"""``GET /api/summary``: headline metrics, coverage, baselines, hindsight check and forecast age."""

from __future__ import annotations

from app.api import schemas as s
from app.config import Settings
from app.domain.matching import matched_only
from app.domain.metrics import (
    compute_coverage,
    compute_error_distribution,
    compute_error_metrics,
    data_status,
    skill_vs_baseline,
)

from .constants import BASELINES
from .context import Ctx
from .convert import distribution_out, metrics_out, num, vars_of
from .core import AnalysisCore


def build_summary(core: AnalysisCore, ctx: Ctx) -> s.SummaryResponse:
    frame = core.matched(ctx)
    m = matched_only(frame)
    metrics = compute_error_metrics(m["forecast_mw"], m["actual_mw"])
    cov = compute_coverage(frame)
    cfg = core.settings
    status = data_status(cov, sufficient=cfg.coverage_sufficient, partial=cfg.coverage_partial)

    baselines: list[s.BaselineOut] = []
    for key, (column, label, description) in BASELINES.items():
        sk = skill_vs_baseline(m["forecast_mw"], m[column], m["actual_mw"])
        baselines.append(
            s.BaselineOut(
                key=key,
                label=label,
                description=description,
                n=int(sk["n"] or 0),
                mae_forecast_mw=num(sk["mae_forecast"]),
                mae_baseline_mw=num(sk["mae_baseline"]),
                skill=num(sk["skill"]),
            )
        )

    hindsight_rows = m.dropna(subset=["latest_forecast_mw"])
    h_err = hindsight_rows["latest_forecast_mw"] - hindsight_rows["actual_mw"]
    hindsight = s.HindsightOut(
        n=len(hindsight_rows),
        mae_mw=num(h_err.abs().mean()) if len(h_err) else None,
        bias_mw=num(h_err.mean()) if len(h_err) else None,
        note=(
            "Uses the most recently published forecast, including revisions made after the decision "
            "cutoff. Not available to the buyer at decision time - shown for context only."
        ),
    )

    age = m["forecast_age_h"].dropna()
    forecast_age = s.ForecastAgeOut(
        median_h=num(age.median()) if len(age) else None,
        p95_h=num(age.quantile(0.95)) if len(age) else None,
        max_h=num(age.max()) if len(age) else None,
        stale_threshold_h=cfg.stale_forecast_hours,
        n_stale=int((age > cfg.stale_forecast_hours).sum()),
    )
    return s.SummaryResponse(
        analysis=core.analysis_echo(ctx),
        provenance=core.provenance(ctx.dataset),
        data_status=s.DataStatusOut(
            status=status,
            message=status_message(cfg, status, cov.coverage),
            sufficient_threshold=cfg.coverage_sufficient,
            partial_threshold=cfg.coverage_partial,
        ),
        coverage=s.CoverageOut(**vars_of(cov)),
        metrics=metrics_out(metrics),
        error_distribution=distribution_out(compute_error_distribution(m["error_mw"])),
        baselines=baselines,
        hindsight_latest=hindsight,
        forecast_age=forecast_age,
    )


def status_message(cfg: Settings, status: str, coverage: float | None) -> str:
    pct = f"{coverage:.1%}" if coverage is not None else "n/a"
    if status == "no_data":
        return "No interval in this selection has both a decision-time forecast and an actual, so metrics are unavailable."
    if status == "sufficient":
        return f"{pct} of expected intervals are matched (threshold {cfg.coverage_sufficient:.0%}). The analysis is well supported."
    if status == "partial":
        return f"Only {pct} of expected intervals are matched (below {cfg.coverage_sufficient:.0%}). Interpret metrics with care."
    return f"Only {pct} of expected intervals are matched (below {cfg.coverage_partial:.0%}). Metrics are not reliable."
