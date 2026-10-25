"""The shared core of the analysis service (see :class:`AnalysisCore`)."""

from __future__ import annotations

import secrets
import threading
from collections import OrderedDict
from datetime import date, time, timedelta
from typing import Any

import pandas as pd

from app import __version__
from app.api import schemas as s
from app.config import Settings
from app.domain import timeutil as tu
from app.domain.baselines import add_baselines
from app.domain.matching import build_matched_frame
from app.domain.vintage import resolve_block_minutes
from app.domain.windows import (
    Basis,
    InvalidWindowError,
    basis_bounds,
    resolve_window,
    validate_window,
)
from app.elexon import endpoints
from app.errors import InvalidRequestError
from app.store.dataset import Dataset, DataStore

from .constants import CACHE_SIZE
from .context import Ctx


class AnalysisCore:
    """State and building blocks shared by every query: the loaded dataset, request context, matched-table cache.

    The endpoint-specific logic lives in the sibling modules (``summary``, ``accuracy``, ``intervals``, ...); this class
    only knows how to resolve a request into a ``Ctx`` and how to produce the (cached) matched table they all start from.
    """

    def __init__(self, store: DataStore, settings: Settings) -> None:
        self._store = store
        self._settings = settings
        self._cache: OrderedDict[tuple[Any, ...], pd.DataFrame] = OrderedDict()
        self._lock = threading.Lock()
        self._boot_id = secrets.token_hex(6)  # new per process: see cache_version()

    @property
    def settings(self) -> Settings:
        return self._settings

    @property
    def store(self) -> DataStore:
        return self._store

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

    def cache_version(self) -> str | None:
        """Opaque identity of everything that shapes a response: the snapshot, the analysis settings and this process.

        ``None`` while no dataset is loaded. Used by the response cache for keys and ETags; the process id component
        guarantees that a redeploy (new code) is never answered with a stale ``304``.
        """
        dataset = self._store.maybe_get()
        if dataset is None:
            return None
        cfg = self._settings
        return "|".join(
            [
                dataset.fingerprint,
                str(dataset.manifest.retrieved_at),
                cfg.forecast_alignment,
                cfg.decision_cutoff_local,
                str(cfg.actual_availability_lag_minutes),
                f"{cfg.coverage_sufficient}/{cfg.coverage_partial}/{cfg.stale_forecast_hours}",
                f"{cfg.max_range_days}/{cfg.analysis_month}/{cfg.default_basis.value}",
                __version__,
                self._boot_id,
            ]
        )

    def forecast_block_minutes(self, dataset: Dataset) -> int:
        """Span of one forecast value: 60 for the hourly WINDFOR feed under ``hold``, else 30."""
        profile = dataset.manifest.quality.get("forecast_profile") or {}
        return resolve_block_minutes(
            self._settings.forecast_alignment, profile.get("start_resolution_minutes")
        )

    def alignment_note(self, dataset: Dataset) -> str | None:
        """Plain-language statement of how forecasts were mapped onto half-hours (None if 1:1)."""
        profile = dataset.manifest.quality.get("forecast_profile") or {}
        observed = profile.get("start_resolution_minutes")
        if observed is None or abs(float(observed) - 30.0) < 1e-6:
            return None
        if self.forecast_block_minutes(dataset) == 60:
            return (
                "WINDFOR forecasts are published per whole hour, FUELHH actuals per half-hour. Each forecast "
                "hour is applied unchanged to both half-hours it covers (nothing is interpolated), so n counts "
                "half-hours and they come in pairs that share one forecast."
            )
        return (
            f"WINDFOR forecasts have a {float(observed):g}-minute start-time grid but FUELHH actuals are "
            "half-hourly. Forecasts are matched only to the half-hour with an identical start time, so the "
            "other half-hours are reported as missing, never filled."
        )

    def analysis_echo(self, ctx: Ctx) -> s.AnalysisEcho:
        w = ctx.window
        return s.AnalysisEcho(
            forecast_block_minutes=self.forecast_block_minutes(ctx.dataset),
            forecast_alignment=self._settings.forecast_alignment,
            forecast_alignment_note=self.alignment_note(ctx.dataset),
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
            forecasts=self.forecasts_for_window(ds, ctx),
            as_of=ds.retrieved_at,
            forecast_block_minutes=self.forecast_block_minutes(ds),
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
    def forecasts_for_window(ds: Dataset, ctx: Ctx) -> pd.DataFrame:
        """Restrict the (sorted) forecast table to the delivery window before joining."""
        lo = tu.local_midnight_utc(ctx.window.delivery_from)
        hi = tu.local_midnight_utc(ctx.window.delivery_to + timedelta(days=1))
        f = ds.forecasts
        return f[(f["start_utc"] >= lo) & (f["start_utc"] < hi)]
