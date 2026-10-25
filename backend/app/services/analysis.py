"""Query -> domain pipeline -> typed response models.

Request handlers stay thin; everything that can be wrong analytically lives in ``app.domain`` and is
unit-tested there. This module only validates parameters, runs the pipeline, caches the matched table
(bounded LRU keyed on the dataset fingerprint) and shapes results for the API.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Literal

import numpy as np
import pandas as pd

from app import __version__
from app.api import schemas as s
from app.config import Settings
from app.domain import timeutil as tu
from app.domain.baselines import add_baselines
from app.domain.breakdowns import (
    GroupResult,
    by_daypart,
    by_delivery_day,
    by_slot,
    histogram,
    largest_errors,
)
from app.domain.matching import build_matched_frame, matched_only
from app.domain.metrics import (
    ErrorDistribution,
    ErrorMetrics,
    compute_coverage,
    compute_error_distribution,
    compute_error_metrics,
    data_status,
    skill_vs_baseline,
)
from app.domain.vintage import list_vintages
from app.domain.windows import (
    Basis,
    InvalidWindowError,
    basis_bounds,
    parse_month,
    resolve_window,
    validate_window,
)
from app.elexon import endpoints
from app.errors import InvalidRequestError, NotFoundError
from app.store.dataset import Dataset, DataStore

CACHE_SIZE = 48
SORT_COLUMNS = {
    "start_time": "start_utc",
    "forecast": "forecast_mw",
    "actual": "actual_mw",
    "error": "error_mw",
    "abs_error": "abs_error_mw",
    "publish_time": "publish_utc",
    "forecast_age": "forecast_age_h",
}
STATUS_FILTERS = {
    "all",
    "matched",
    "missing_any",
    "missing_forecast",
    "missing_actual",
    "missing_both",
}
BaselineKey = Literal["persistence", "trailing_mean"]
BASELINES: dict[BaselineKey, tuple[str, str, str]] = {
    "persistence": (
        "baseline_persistence_mw",
        "Persistence at cutoff",
        "Last half-hour actual that was complete and published by the cutoff (assumed publication lag "
        "applies), held flat across the delivery day.",
    ),
    "trailing_mean": (
        "baseline_trailing_mean_mw",
        "Trailing 7-day mean",
        "Mean of the same settlement period over the 7 complete days D-8 to D-2 (D-1 is incomplete at the cutoff).",
    ),
}
DAYPART_DEFINITION = {"day": "07:00-23:00 local time", "night": "23:00-07:00 local time"}
CUTOFF_PRESETS = [
    s.CutoffPreset(
        value="09:20",
        label="EPEX SPOT GB gate closure",
        note="Default. Earliest GB day-ahead gate closure, so no forecast is used that could not have informed any day-ahead bid.",
    ),
    s.CutoffPreset(
        value="09:50",
        label="N2EX gate closure",
        note="Per Nord Pool; a secondary source quotes 09:40, so treat as indicative.",
    ),
    s.CutoffPreset(
        value="08:00",
        label="Early bid preparation",
        note="Sensitivity case: bids finalised ahead of gate closure.",
    ),
]


@dataclass(frozen=True)
class Ctx:
    dataset: Dataset
    window: Any  # AnalysisWindow
    cutoff: time
    cutoff_str: str

    @property
    def key(self) -> tuple[str, str, date, date, str]:
        return (
            self.dataset.fingerprint,
            self.window.basis.value,
            self.window.delivery_from,
            self.window.delivery_to,
            self.cutoff_str,
        )


@dataclass(frozen=True)
class IntervalQuery:
    page: int = 1
    page_size: int = 50
    sort_by: str = "start_time"
    sort_dir: str = "asc"
    status: str = "all"
    direction: str | None = None  # "over" | "under"
    min_abs_error: float | None = None
    q: str | None = None


def num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def stamp(value: Any) -> datetime | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).to_pydatetime()


def stamp_req(value: Any) -> datetime:
    """Like :func:`stamp` for fields the schema requires; a missing value is a programming error."""
    ts = stamp(value)
    if ts is None:
        raise ValueError("a required timestamp is missing from the matched table")
    return ts


def rows_of(frame: pd.DataFrame) -> Iterator[Any]:
    """Iterate rows with attribute access (pandas-stubs cannot type namedtuples by column)."""
    return frame.itertuples(index=False)


def _metrics_out(m: ErrorMetrics) -> s.MetricsOut:
    return s.MetricsOut(
        n=m.n,
        mae_mw=m.mae,
        rmse_mw=m.rmse,
        bias_mw=m.bias,
        wape=m.wape,
        mean_forecast_mw=m.mean_forecast,
        mean_actual_mw=m.mean_actual,
    )


def _group_fields(g: GroupResult) -> dict[str, Any]:
    m = g.metrics
    return {
        "expected": g.expected,
        "n": m.n,
        "coverage": g.coverage,
        "mae_mw": m.mae,
        "rmse_mw": m.rmse,
        "bias_mw": m.bias,
        "wape": m.wape,
        "mean_forecast_mw": m.mean_forecast,
        "mean_actual_mw": m.mean_actual,
    }


def _distribution_out(d: ErrorDistribution) -> s.ErrorDistributionOut:
    return s.ErrorDistributionOut(
        n=d.n, n_over=d.n_over, n_under=d.n_under, n_exact=d.n_exact,
        share_over=d.share_over, share_under=d.share_under,
        mean_over_mw=d.mean_over_mw, mean_under_mw=d.mean_under_mw,
        max_over_mw=d.max_over_mw, max_under_mw=d.max_under_mw,
        signed_p05_mw=d.signed_p05, signed_p10_mw=d.signed_p10, signed_p50_mw=d.signed_p50,
        signed_p90_mw=d.signed_p90, signed_p95_mw=d.signed_p95,
        abs_p50_mw=d.abs_p50, abs_p90_mw=d.abs_p90, abs_p95_mw=d.abs_p95,
    )  # fmt: skip


def interval_row(r: Any) -> s.IntervalRow:
    local = pd.Timestamp(r.start_utc).tz_convert(tu.LONDON)
    return s.IntervalRow(
        start_time=stamp_req(r.start_utc),
        delivery_date=r.delivery_date,
        local_label=local.strftime("%Y-%m-%d %H:%M"),
        settlement_period=int(r.settlement_period),
        decision_cutoff_time=stamp_req(r.cutoff_utc),
        forecast_publish_time=stamp(r.publish_utc),
        forecast_mw=num(r.forecast_mw),
        actual_mw=num(r.actual_mw),
        error_mw=num(r.error_mw),
        abs_error_mw=num(r.abs_error_mw),
        forecast_age_h=num(r.forecast_age_h),
        lead_time_h=num(r.lead_time_h),
        latest_forecast_mw=num(r.latest_forecast_mw),
        latest_publish_time=stamp(r.latest_publish_utc),
        match_status=r.match_status,
    )


class AnalysisService:
    def __init__(self, store: DataStore, settings: Settings) -> None:
        self._store = store
        self._settings = settings
        self._cache: OrderedDict[tuple[Any, ...], pd.DataFrame] = OrderedDict()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------------------------------
    # Parameter handling
    # ------------------------------------------------------------------------------------------

    def parse_cutoff(self, cutoff: str | None) -> tuple[time, str]:
        raw = cutoff or self._settings.decision_cutoff_local
        try:
            return tu.parse_hhmm(raw), raw
        except ValueError as exc:
            raise InvalidRequestError(str(exc)) from exc

    def context(
        self, basis: Basis | None, date_from: date | None, date_to: date | None, cutoff: str | None
    ) -> Ctx:
        dataset = self._store.get()
        basis = basis or self._settings.default_basis
        lo, hi = basis_bounds(self._settings.analysis_month)
        try:
            window = resolve_window(basis, date_from or lo, date_to or hi)
            validate_window(window, bounds=(lo, hi), max_days=self._settings.max_range_days)
        except InvalidWindowError as exc:
            raise InvalidRequestError(str(exc)) from exc
        have_from, have_to = (
            dataset.manifest.delivery_coverage_from,
            dataset.manifest.delivery_coverage_to,
        )
        if window.delivery_from < have_from or window.delivery_to > have_to:
            raise InvalidRequestError(
                f"Delivery dates {window.delivery_from}..{window.delivery_to} are outside the loaded data "
                f"coverage {have_from}..{have_to}"
            )
        cutoff_time, cutoff_str = self.parse_cutoff(cutoff)
        return Ctx(dataset, window, cutoff_time, cutoff_str)

    def analysis_echo(self, ctx: Ctx) -> s.AnalysisEcho:
        w = ctx.window
        return s.AnalysisEcho(
            basis=w.basis,
            decision_from=w.decision_from,
            decision_to=w.decision_to,
            delivery_from=w.delivery_from,
            delivery_to=w.delivery_to,
            n_delivery_days=w.n_days,
            cutoff_local=ctx.cutoff_str,
            cutoff_rule=(
                f"For each half-hour, the latest WINDFOR forecast published at or before {ctx.cutoff_str} "
                "Europe/London on the day before delivery."
            ),
        )

    def provenance(self, dataset: Dataset) -> s.ProvenanceOut:
        m = dataset.manifest
        return s.ProvenanceOut(
            provenance=m.provenance,
            is_synthetic=dataset.is_synthetic,
            source_name=m.source_name,
            retrieved_at=m.retrieved_at,
            unit=m.unit,
            attribution=f"{endpoints.ATTRIBUTION} {m.retrieved_at.year}.",
        )

    # ------------------------------------------------------------------------------------------
    # Core table (cached)
    # ------------------------------------------------------------------------------------------

    def matched(self, ctx: Ctx) -> pd.DataFrame:
        with self._lock:
            hit = self._cache.get(ctx.key)
            if hit is not None:
                self._cache.move_to_end(ctx.key)
                return hit
        ds = ctx.dataset
        frame = build_matched_frame(
            delivery_from=ctx.window.delivery_from,
            delivery_to=ctx.window.delivery_to,
            cutoff_local=ctx.cutoff,
            actuals=ds.actuals,
            forecasts=self._forecasts_for_window(ds, ctx),
            as_of=ds.retrieved_at,
        )
        frame = add_baselines(
            frame,
            ds.actuals,
            availability_lag=pd.Timedelta(minutes=self._settings.actual_availability_lag_minutes),
        )
        with self._lock:
            self._cache[ctx.key] = frame
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return frame

    @staticmethod
    def _forecasts_for_window(ds: Dataset, ctx: Ctx) -> pd.DataFrame:
        """Restrict the (sorted) forecast table to the delivery window before joining."""
        lo = tu.local_midnight_utc(ctx.window.delivery_from)
        hi = tu.local_midnight_utc(ctx.window.delivery_to + timedelta(days=1))
        f = ds.forecasts
        return f[(f["start_utc"] >= lo) & (f["start_utc"] < hi)]

    # ------------------------------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------------------------------

    def summary(self, ctx: Ctx) -> s.SummaryResponse:
        frame = self.matched(ctx)
        m = matched_only(frame)
        metrics = compute_error_metrics(m["forecast_mw"], m["actual_mw"])
        cov = compute_coverage(frame)
        cfg = self._settings
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
            analysis=self.analysis_echo(ctx),
            provenance=self.provenance(ctx.dataset),
            data_status=s.DataStatusOut(
                status=status,
                message=self._status_message(status, cov.coverage),
                sufficient_threshold=cfg.coverage_sufficient,
                partial_threshold=cfg.coverage_partial,
            ),
            coverage=s.CoverageOut(**vars_of(cov)),
            metrics=_metrics_out(metrics),
            error_distribution=_distribution_out(compute_error_distribution(m["error_mw"])),
            baselines=baselines,
            hindsight_latest=hindsight,
            forecast_age=forecast_age,
        )

    def _status_message(self, status: str, coverage: float | None) -> str:
        cfg = self._settings
        pct = f"{coverage:.1%}" if coverage is not None else "n/a"
        if status == "no_data":
            return "No interval in this selection has both a decision-time forecast and an actual, so metrics are unavailable."
        if status == "sufficient":
            return f"{pct} of expected intervals are matched (threshold {cfg.coverage_sufficient:.0%}). The analysis is well supported."
        if status == "partial":
            return f"Only {pct} of expected intervals are matched (below {cfg.coverage_sufficient:.0%}). Interpret metrics with care."
        return f"Only {pct} of expected intervals are matched (below {cfg.coverage_partial:.0%}). Metrics are not reliable."

    def timeseries(self, ctx: Ctx) -> s.TimeSeriesResponse:
        frame = self.matched(ctx)
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
            analysis=self.analysis_echo(ctx), provenance=self.provenance(ctx.dataset), points=points
        )

    def accuracy(self, ctx: Ctx) -> s.AccuracyResponse:
        frame = self.matched(ctx)
        m = matched_only(frame)
        daily = [
            s.DailyAccuracy(
                delivery_date=g.key, decision_date=g.key - timedelta(days=1), **_group_fields(g)
            )
            for g in by_delivery_day(frame)
        ]
        slots = [
            s.SlotAccuracy(
                slot=str(g.key),
                settlement_period=int(str(g.key)[:2]) * 2 + int(str(g.key)[3:]) // 30 + 1,
                **_group_fields(g),
            )
            for g in by_slot(frame)
        ]
        dayparts = [
            s.DaypartAccuracy(
                daypart=g.key, definition=DAYPART_DEFINITION[str(g.key)], **_group_fields(g)
            )
            for g in by_daypart(frame)
        ]
        hist = histogram(m["error_mw"])
        return s.AccuracyResponse(
            analysis=self.analysis_echo(ctx),
            provenance=self.provenance(ctx.dataset),
            coverage=s.CoverageOut(**vars_of(compute_coverage(frame))),
            metrics=_metrics_out(compute_error_metrics(m["forecast_mw"], m["actual_mw"])),
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
            error_distribution=_distribution_out(compute_error_distribution(m["error_mw"])),
            largest_errors=[interval_row(r) for r in rows_of(largest_errors(frame, 10))],
        )

    # --- intervals -----------------------------------------------------------------------------------

    def _filtered(self, ctx: Ctx, query: IntervalQuery) -> pd.DataFrame:
        if query.sort_by not in SORT_COLUMNS:
            raise InvalidRequestError(f"sort_by must be one of {sorted(SORT_COLUMNS)}")
        if query.sort_dir not in {"asc", "desc"}:
            raise InvalidRequestError("sort_dir must be 'asc' or 'desc'")
        if query.status not in STATUS_FILTERS:
            raise InvalidRequestError(f"status must be one of {sorted(STATUS_FILTERS)}")
        if query.direction not in {None, "over", "under"}:
            raise InvalidRequestError("direction must be 'over' or 'under'")

        frame = self.matched(ctx)
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

    def intervals(self, ctx: Ctx, query: IntervalQuery) -> s.IntervalsResponse:
        frame = self._filtered(ctx, query)
        total = len(frame)
        pages = max(1, -(-total // query.page_size))
        page = min(max(1, query.page), pages)
        window = frame.iloc[(page - 1) * query.page_size : page * query.page_size]
        return s.IntervalsResponse(
            analysis=self.analysis_echo(ctx),
            provenance=self.provenance(ctx.dataset),
            total=total,
            page=page,
            page_size=query.page_size,
            total_pages=pages,
            items=[interval_row(r) for r in rows_of(window)],
        )

    def intervals_csv(self, ctx: Ctx, query: IntervalQuery) -> str:
        frame = self._filtered(ctx, query)
        out = pd.DataFrame(
            {
                "start_time_utc": frame["start_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "local_time": frame["start_utc"]
                .dt.tz_convert(tu.LONDON)
                .dt.strftime("%Y-%m-%d %H:%M"),
                "settlement_period": frame["settlement_period"],
                "decision_cutoff_utc": frame["cutoff_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
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

    # --- single interval: vintages -------------------------------------------------------------------

    def vintages(self, start: datetime, cutoff: str | None) -> s.VintagesResponse:
        dataset = self._store.get()
        if start.tzinfo is None:
            raise InvalidRequestError("start must include a timezone (e.g. 2026-01-15T08:30:00Z)")
        start_utc = pd.Timestamp(start).tz_convert("UTC")
        if not bool(tu.is_half_hour_aligned(pd.Series([start_utc])).iloc[0]):
            raise InvalidRequestError("start must fall on a :00 or :30 boundary")
        cutoff_time, cutoff_str = self.parse_cutoff(cutoff)
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
        table = list_vintages(dataset.forecasts, start_utc, cutoff_utc)
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
            provenance=self.provenance(dataset),
            start_time=start_utc.to_pydatetime(),
            local_label=start_utc.tz_convert(tu.LONDON).strftime("%Y-%m-%d %H:%M"),
            delivery_date=delivery_day,
            settlement_period=int(tu.settlement_periods(pd.Series([start_utc])).iloc[0]),
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

    # --- decision brief ----------------------------------------------------------------------------

    def decision_brief(self, decision_date: date, cutoff: str | None) -> s.DecisionBriefResponse:
        dataset = self._store.get()
        delivery = decision_date + timedelta(days=1)
        cov_from, cov_to = (
            dataset.manifest.delivery_coverage_from,
            dataset.manifest.delivery_coverage_to,
        )
        if delivery < cov_from or delivery > cov_to:
            raise InvalidRequestError(
                f"Decision date {decision_date} (delivery {delivery}) is outside the loaded coverage {cov_from}..{cov_to}"
            )
        cutoff_time, cutoff_str = self.parse_cutoff(cutoff)
        window = resolve_window(Basis.DECISION_DATE, decision_date, decision_date)
        ctx = Ctx(dataset, window, cutoff_time, cutoff_str)
        frame = self.matched(ctx)

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
            provenance=self.provenance(dataset),
            decision_date=decision_date,
            delivery_date=delivery,
            cutoff_local=cutoff_str,
            cutoff_time=tu.cutoff_utc_for_delivery_date(delivery, cutoff_time).to_pydatetime(),
            forecast_set=forecast_set,
            hindsight=hindsight,
            points=points,
        )

    # --- metadata ------------------------------------------------------------------------------------

    def metadata(self) -> s.MetadataResponse:
        cfg = self._settings
        first, last = parse_month(cfg.analysis_month)
        month_label = first.strftime("%B %Y")
        bases = [
            s.BasisInfo(
                id=Basis.DECISION_DATE,
                label=f"Decisions made in {month_label}",
                description=(
                    f"Day-ahead decisions taken on {first:%d %b}-{last:%d %b %Y}, i.e. delivery on "
                    f"{first + timedelta(days=1):%d %b}-{last + timedelta(days=1):%d %b %Y}. "
                    "The literal reading of the brief."
                ),
                date_type="decision",
                min_date=first, max_date=last, default_from=first, default_to=last,
            ),
            s.BasisInfo(
                id=Basis.DELIVERY_DATE,
                label=f"Deliveries in {month_label}",
                description=(
                    f"Power delivered on {first:%d %b}-{last:%d %b %Y}, i.e. decisions taken "
                    f"{first - timedelta(days=1):%d %b}-{last - timedelta(days=1):%d %b %Y}."
                ),
                date_type="delivery",
                min_date=first, max_date=last, default_from=first, default_to=last,
            ),
        ]  # fmt: skip
        dataset = self._store.maybe_get()
        refresh = self._store.refresh_state
        base = {
            "app_version": __version__,
            "refresh": s.RefreshOut(**refresh.to_dict()),
            "analysis_month": cfg.analysis_month,
            "bases": bases,
            "default_basis": cfg.default_basis,
            "default_cutoff": cfg.decision_cutoff_local,
            "cutoff_presets": CUTOFF_PRESETS,
            "thresholds": s.Thresholds(
                coverage_sufficient=cfg.coverage_sufficient,
                coverage_partial=cfg.coverage_partial,
                stale_forecast_hours=cfg.stale_forecast_hours,
                max_range_days=cfg.max_range_days,
            ),
            "sign_convention": "error = forecast - actual; positive = over-forecast (less wind than predicted)",
            "unit": endpoints.UNIT,
        }
        if dataset is None:
            return s.MetadataResponse(
                data_available=False, load_error=self._store.load_error, **base
            )
        m = dataset.manifest
        return s.MetadataResponse(
            data_available=True,
            provenance=self.provenance(dataset),
            sources=[s.SourceLink(**d.model_dump()) for d in m.datasets],
            delivery_coverage_from=m.delivery_coverage_from,
            delivery_coverage_to=m.delivery_coverage_to,
            actuals_rows=m.actuals_rows,
            forecasts_rows=m.forecasts_rows,
            quality=m.quality,
            warnings=m.warnings,
            **base,
        )


def vars_of(obj: Any) -> dict[str, Any]:
    """Dataclass (slots) -> dict, for splatting into response models."""
    return {name: getattr(obj, name) for name in obj.__dataclass_fields__}
