"""``GET /api/decision-brief``: the forecast set a buyer could see on one decision date, with hindsight for contrast."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.api import schemas as s
from app.domain import timeutil as tu
from app.domain.matching import matched_only
from app.domain.metrics import compute_error_metrics
from app.domain.windows import Basis, resolve_window
from app.errors import InvalidRequestError

from .context import Ctx
from .convert import num, rows_of, stamp, stamp_req
from .core import AnalysisCore


def build_decision_brief(
    core: AnalysisCore, decision_date: date, cutoff: str | None
) -> s.DecisionBriefResponse:
    dataset = core.store.get()
    delivery = decision_date + timedelta(days=1)
    cov_from, cov_to = (
        dataset.manifest.delivery_coverage_from,
        dataset.manifest.delivery_coverage_to,
    )
    if delivery < cov_from or delivery > cov_to:
        raise InvalidRequestError(
            f"Decision date {decision_date} (delivery {delivery}) is outside the loaded coverage {cov_from}..{cov_to}"
        )
    cutoff_time, cutoff_str = core.parse_cutoff(cutoff)
    window = resolve_window(Basis.DECISION_DATE, decision_date, decision_date)
    ctx = Ctx(dataset, window, cutoff_time, cutoff_str)
    frame = core.matched(ctx)

    have = frame.dropna(subset=["forecast_mw"])
    energy = float(have["forecast_mw"].sum() * 0.5) if len(have) else None
    peak = have.iloc[int(np.argmax(have["forecast_mw"].to_numpy()))] if len(have) else None
    trough = have.iloc[int(np.argmin(have["forecast_mw"].to_numpy()))] if len(have) else None
    forecast_set = s.ForecastSetSummary(
        n_intervals=len(frame),
        n_with_forecast=len(have),
        distinct_publications=int(have["publish_utc"].nunique()),
        first_publish_time=stamp(have["publish_utc"].min()) if len(have) else None,
        last_publish_time=stamp(have["publish_utc"].max()) if len(have) else None,
        mean_mw=num(have["forecast_mw"].mean()) if len(have) else None,
        peak_mw=num(peak["forecast_mw"]) if peak is not None else None,
        peak_time=stamp(peak["start_utc"]) if peak is not None else None,
        trough_mw=num(trough["forecast_mw"]) if trough is not None else None,
        trough_time=stamp(trough["start_utc"]) if trough is not None else None,
        energy_mwh=energy,
    )
    m = matched_only(frame)
    metrics = compute_error_metrics(m["forecast_mw"], m["actual_mw"])
    latest = frame["latest_forecast_mw"].dropna()
    hindsight = s.BriefHindsight(
        n_matched=metrics.n,
        mean_actual_mw=metrics.mean_actual,
        mae_mw=metrics.mae,
        bias_mw=metrics.bias,
        latest_mean_mw=num(latest.mean()) if len(latest) else None,
        note="Actual generation is known only after delivery; it is shown here to judge the forecast, not to inform the decision.",
    )
    points = [
        s.BriefPoint(
            start_time=stamp_req(r.start_utc),
            slot=r.slot,
            forecast_mw=num(r.forecast_mw),
            forecast_publish_time=stamp(r.publish_utc),
            actual_mw=num(r.actual_mw),
            error_mw=num(r.error_mw),
        )
        for r in rows_of(frame)
    ]
    return s.DecisionBriefResponse(
        provenance=core.provenance(dataset),
        decision_date=decision_date,
        delivery_date=delivery,
        cutoff_local=cutoff_str,
        cutoff_time=tu.cutoff_utc_for_delivery_date(delivery, cutoff_time).to_pydatetime(),
        forecast_set=forecast_set,
        hindsight=hindsight,
        points=points,
    )
