"""Fetch -> normalise -> measure -> persist.

Windows (derived from ``ANALYSIS_MONTH``, see docs/02-DOMAIN-ASSUMPTIONS.md section B):

* delivery coverage  : ``month_start .. month_end + 1 day``  (serves *both* interpretations);
* actuals (FUELHH)   : coverage start minus ``ACTUALS_LOOKBACK_DAYS`` .. coverage end  (baselines need history);
* forecasts (WINDFOR): published from ``FORECAST_LOOKBACK_DAYS`` before the coverage start .. coverage end,
  then restricted to delivery intervals inside the coverage window.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd

from app.config import Settings
from app.domain import timeutil as tu
from app.domain.vintage import forecast_block_starts, resolve_block_minutes
from app.domain.windows import required_delivery_coverage
from app.elexon import endpoints
from app.elexon.client import ElexonClient
from app.elexon.normalize import (
    NormalizationReport,
    normalize_actuals,
    normalize_forecasts,
    profile_forecasts,
)
from app.errors import IngestionError, UpstreamError
from app.store.dataset import DataStore
from app.store.snapshot import DatasetSource, Manifest, utcnow, write_snapshot

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IngestionWindows:
    coverage_from: pd.Timestamp
    coverage_to: pd.Timestamp
    delivery_first: date
    delivery_last: date
    actuals_first_date: date
    actuals_window: tuple[pd.Timestamp, pd.Timestamp]
    publish_from: pd.Timestamp
    publish_to: pd.Timestamp


def compute_windows(settings: Settings) -> IngestionWindows:
    first, last = required_delivery_coverage(settings.analysis_month)
    coverage_from = tu.local_midnight_utc(first)
    coverage_to = tu.local_midnight_utc(last + timedelta(days=1))
    actuals_first = first - timedelta(days=settings.actuals_lookback_days)
    return IngestionWindows(
        coverage_from=coverage_from,
        coverage_to=coverage_to,
        delivery_first=first,
        delivery_last=last,
        actuals_first_date=actuals_first,
        actuals_window=(tu.local_midnight_utc(actuals_first), coverage_to),
        publish_from=coverage_from - pd.Timedelta(days=settings.forecast_lookback_days),
        publish_to=coverage_to,
    )


def _rate(part: int, whole: int) -> float | None:
    return part / whole if whole else None


async def build_manifest_and_frames(
    settings: Settings, client: ElexonClient
) -> tuple[pd.DataFrame, pd.DataFrame, Manifest]:
    w = compute_windows(settings)
    logger.info(
        "Ingesting FUELHH WIND settlement dates %s..%s", w.actuals_first_date, w.delivery_last
    )
    actual_records = await client.fetch_actuals(w.actuals_first_date, w.delivery_last)
    logger.info("Ingesting WINDFOR published %s .. %s", w.publish_from, w.publish_to)
    forecast_records = await client.fetch_forecasts(
        w.publish_from.to_pydatetime(), w.publish_to.to_pydatetime()
    )

    actuals, actual_report = normalize_actuals(actual_records, window=w.actuals_window)
    forecasts, forecast_report = normalize_forecasts(
        forecast_records, window=(w.coverage_from, w.coverage_to)
    )

    if actuals.empty:
        raise IngestionError("FUELHH returned no usable WIND records for the requested window")
    if forecasts.empty:
        raise IngestionError("WINDFOR returned no usable forecast records for the requested window")

    warnings = _warnings(actual_report, forecast_report)
    expected = tu.delivery_range_intervals(w.delivery_first, w.delivery_last)
    in_window = actuals[
        (actuals["start_utc"] >= w.coverage_from) & (actuals["start_utc"] < w.coverage_to)
    ]
    with_actual = int(in_window["start_utc"].isin(expected).sum())
    profile = profile_forecasts(forecasts)
    resolution = profile["start_resolution_minutes"]
    block_minutes = resolve_block_minutes("hold", resolution)
    covered = forecast_block_starts(pd.Series(expected), block_minutes)
    with_forecast = int(covered.isin(forecasts["start_utc"]).sum())
    if resolution and resolution != 30:
        warnings.append(
            f"WINDFOR start times are {resolution:g} minutes apart but FUELHH actuals are half-hourly. "
            "With FORECAST_ALIGNMENT=hold each forecast hour is applied to both half-hours it covers; "
            "with 'exact' the other half-hours count as missing. Nothing is interpolated."
        )
    rate = _rate(with_actual, len(expected))
    if rate is not None and rate < 0.99:
        warnings.append(f"Actuals exist for only {rate:.1%} of expected delivery intervals.")

    manifest = Manifest(
        provenance="elexon_live",
        source_name="Elexon BMRS (Insights Solution API)",
        base_url=settings.elexon_base_url,
        datasets=[
            DatasetSource(
                code=endpoints.FUELHH,
                endpoint=f"{settings.elexon_base_url}/datasets/{endpoints.FUELHH}/stream",
                documentation_url=endpoints.DOC_LINKS[endpoints.FUELHH],
                query_parameters=endpoints.fuelhh_wind_request(
                    w.actuals_first_date, w.delivery_last
                ).params,
            ),
            DatasetSource(
                code=endpoints.WINDFOR,
                endpoint=f"{settings.elexon_base_url}/datasets/{endpoints.WINDFOR}/stream",
                documentation_url=endpoints.DOC_LINKS[endpoints.WINDFOR],
                query_parameters=endpoints.windfor_request(
                    w.publish_from.to_pydatetime(), w.publish_to.to_pydatetime()
                ).params,
            ),
        ],
        retrieved_at=utcnow(),
        unit=endpoints.UNIT,
        analysis_month=settings.analysis_month,
        delivery_coverage_from=w.delivery_first,
        delivery_coverage_to=w.delivery_last,
        actuals_rows=len(actuals),
        forecasts_rows=len(forecasts),
        quality={
            "actuals": actual_report.to_dict(),
            "forecasts": forecast_report.to_dict(),
            "forecast_profile": profile,
            "coverage_window": {
                "expected_intervals": len(expected),
                "intervals_with_actual": with_actual,
                "intervals_with_any_forecast": with_forecast,
                "forecast_block_minutes": block_minutes,
            },
        },
        warnings=warnings,
    )
    return actuals, forecasts, manifest


def _warnings(actual: NormalizationReport, forecast: NormalizationReport) -> list[str]:
    notes: list[str] = []
    for report in (actual, forecast):
        if report.total_dropped:
            reasons = ", ".join(f"{k}={v}" for k, v in sorted(report.dropped.items()))
            notes.append(
                f"{report.dataset}: {report.total_dropped} of {report.rows_in} rows dropped ({reasons})."
            )
        if report.conflicting_duplicates:
            notes.append(
                f"{report.dataset}: {report.conflicting_duplicates} duplicate keys had conflicting values."
            )
        if report.negative_values:
            notes.append(
                f"{report.dataset}: {report.negative_values} negative generation values were kept as-is."
            )
    return notes


class IngestionService:
    """Runs ingestion at most once at a time and keeps serving the previous snapshot on failure."""

    def __init__(self, settings: Settings, store: DataStore) -> None:
        self._settings = settings
        self._store = store
        self._lock = asyncio.Lock()

    @property
    def running(self) -> bool:
        return self._lock.locked()

    async def run(self, client: ElexonClient | None = None) -> Manifest:
        if self._lock.locked():
            raise IngestionError("An ingestion run is already in progress")
        async with self._lock:
            self._store.record_refresh("running")
            owns_client = client is None
            active = client or ElexonClient(self._settings)
            try:
                actuals, forecasts, manifest = await build_manifest_and_frames(
                    self._settings, active
                )
                written = await asyncio.to_thread(
                    write_snapshot, self._settings.snapshot_dir, actuals, forecasts, manifest
                )
                await asyncio.to_thread(self._store.load_from_disk)
                self._store.record_refresh("ok")
                return written
            except (UpstreamError, IngestionError) as exc:
                logger.error("Ingestion failed: %s", exc)
                self._store.record_refresh("failed", error=str(exc))
                raise
            except Exception as exc:  # unexpected: record, then surface
                logger.exception("Unexpected ingestion failure")
                self._store.record_refresh("failed", error=f"{type(exc).__name__}: {exc}")
                raise
            finally:
                if owns_client:
                    await active.aclose()
