"""Mocked-Elexon -> ingestion -> Parquet snapshot -> API, end to end.

The mock serves *test fixture* rows shaped like the documented FUELHH/WINDFOR fields. It deliberately
misbehaves in the ways real feeds do: other fuel types in the FUELHH payload, duplicated rows, a
revised (conflicting) duplicate, and overlapping publish windows between WINDFOR chunks.
"""

import asyncio
from datetime import UTC, datetime

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.elexon.client import ElexonClient
from app.errors import IngestionError, UpstreamUnavailableError
from app.main import create_app
from app.store.snapshot import read_snapshot
from tests.conftest import ACTUAL_MW, ELIGIBLE_MW, exact_frames, make_settings, write_exact_snapshot


def iso(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeElexon:
    """httpx handler emulating the two stream endpoints from the exact fixture frames."""

    def __init__(self) -> None:
        self.actuals, self.forecasts = exact_frames()
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        params = request.url.params
        if request.url.path.endswith("/datasets/FUELHH/stream"):
            lo = pd.Timestamp(params["settlementDateFrom"], tz="UTC")
            hi = pd.Timestamp(params["settlementDateTo"], tz="UTC") + pd.Timedelta(days=1)
            rows = self.actuals[
                (self.actuals["start_utc"] >= lo) & (self.actuals["start_utc"] < hi)
            ]
            payload = []
            for r in rows.itertuples(index=False):
                base = {
                    "dataset": "FUELHH",
                    "publishTime": iso(r.actual_publish_utc),
                    "startTime": iso(r.start_utc),
                    "generation": r.actual_mw,
                }
                payload.append({**base, "fuelType": "WIND"})
                payload.append(
                    {**base, "fuelType": "CCGT", "generation": 9999.0}
                )  # must be filtered out
            if payload:
                payload.append(dict(payload[0]))  # exact duplicate
                payload.append(
                    {**payload[0], "generation": 123456.0, "publishTime": "2000-01-01T00:00:00Z"}
                )  # stale revision
            return httpx.Response(200, json=payload)
        if request.url.path.endswith("/datasets/WINDFOR/stream"):
            fmt = "%Y-%m-%dT%H:%MZ"
            lo = pd.Timestamp(
                datetime.strptime(params["publishDateTimeFrom"], fmt).replace(tzinfo=UTC)
            )
            hi = pd.Timestamp(
                datetime.strptime(params["publishDateTimeTo"], fmt).replace(tzinfo=UTC)
            )
            rows = self.forecasts[
                (self.forecasts["publish_utc"] >= lo) & (self.forecasts["publish_utc"] <= hi)
            ]
            return httpx.Response(
                200,
                json=[
                    {
                        "dataset": "WINDFOR",
                        "publishTime": iso(r.publish_utc),
                        "startTime": iso(r.start_utc),
                        "generation": r.forecast_mw,
                    }
                    for r in rows.itertuples(index=False)
                ],
            )
        return httpx.Response(404)


class HourlyElexon(FakeElexon):
    """Like the live WINDFOR feed: forecast rows exist for whole hours only (FUELHH stays half-hourly)."""

    def __init__(self) -> None:
        super().__init__()
        on_the_hour = self.forecasts["start_utc"].dt.minute == 0
        self.forecasts = self.forecasts[on_the_hour].reset_index(drop=True)


def client_for(settings, handler) -> ElexonClient:  # type: ignore[no-untyped-def]
    async def no_sleep(_: float) -> None:
        return None

    return ElexonClient(
        settings, transport=httpx.MockTransport(handler), sleep=no_sleep, jitter=lambda: 0.0
    )


@pytest.fixture
def ingested(tmp_path):  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path)
    app = create_app(settings)
    fake = FakeElexon()

    async def go() -> object:
        client = client_for(settings, fake)
        try:
            return await app.state.ingestion.run(client)
        finally:
            await client.aclose()

    manifest = asyncio.run(go())
    return settings, app, fake, manifest


@pytest.fixture
def ingested_hourly(tmp_path):  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path)
    app = create_app(settings)
    fake = HourlyElexon()

    async def go() -> object:
        client = client_for(settings, fake)
        try:
            return await app.state.ingestion.run(client)
        finally:
            await client.aclose()

    manifest = asyncio.run(go())
    return settings, app, manifest


def test_hourly_forecast_grid_is_measured_and_disclosed_in_the_manifest(ingested_hourly) -> None:  # type: ignore[no-untyped-def]
    settings, _, manifest = ingested_hourly
    snap = read_snapshot(settings.snapshot_dir)
    assert snap.manifest.quality["forecast_profile"]["start_resolution_minutes"] == 60.0
    window = snap.manifest.quality["coverage_window"]
    assert window["forecast_block_minutes"] == 60
    # Every expected half-hour sits inside a forecast hour that has data, even though only half of the
    # half-hours carry a forecast row of their own.
    assert window["intervals_with_any_forecast"] == window["expected_intervals"]
    assert any("60 minutes apart" in w and "interpolated" in w for w in manifest.warnings)


def test_api_scores_every_half_hour_against_its_hours_forecast(ingested_hourly) -> None:  # type: ignore[no-untyped-def]
    _, app, _ = ingested_hourly
    with TestClient(app) as client:
        body = client.get("/api/summary").json()
    assert body["analysis"]["forecast_block_minutes"] == 60
    assert body["metrics"]["n"] == 1488
    assert body["metrics"]["mae_mw"] == pytest.approx(ELIGIBLE_MW - ACTUAL_MW)
    assert body["coverage"]["coverage"] == 1.0


def test_pipeline_produces_a_loadable_snapshot_with_provenance(ingested) -> None:  # type: ignore[no-untyped-def]
    settings, _, _, manifest = ingested
    snap = read_snapshot(settings.snapshot_dir)
    assert snap.manifest.provenance == "elexon_live"
    assert snap.manifest.unit == "MW" and snap.manifest.analysis_month == "2026-01"
    assert snap.manifest.delivery_coverage_from.isoformat() == "2026-01-01"
    assert snap.manifest.delivery_coverage_to.isoformat() == "2026-02-01"
    assert [d.code for d in snap.manifest.datasets] == ["FUELHH", "WINDFOR"]
    assert snap.manifest.datasets[0].query_parameters["fuelType"] == "WIND"
    assert manifest.actuals_rows == len(snap.actuals) and manifest.forecasts_rows == len(
        snap.forecasts
    )


def test_only_wind_is_kept_and_duplicates_are_resolved_to_the_latest_publication(ingested) -> None:  # type: ignore[no-untyped-def]
    settings, _, _, _ = ingested
    snap = read_snapshot(settings.snapshot_dir)
    assert (
        snap.actuals["actual_mw"].eq(ACTUAL_MW).all()
    )  # CCGT (9999) and the stale revision (123456) are gone
    assert snap.actuals["start_utc"].is_unique
    quality = snap.manifest.quality["actuals"]
    assert quality["ignored_other_fuel_types"] > 0
    assert quality["duplicates_removed"] > 0 and quality["conflicting_duplicates"] > 0


def test_overlapping_forecast_windows_do_not_duplicate_rows(ingested) -> None:  # type: ignore[no-untyped-def]
    settings, _, fake, _ = ingested
    snap = read_snapshot(settings.snapshot_dir)
    assert not snap.forecasts.duplicated(["start_utc", "publish_utc"]).any()
    assert len(snap.forecasts) == len(fake.forecasts)  # nothing lost, nothing doubled
    assert snap.manifest.quality["forecast_profile"]["start_resolution_minutes"] == 30.0


def test_requests_follow_the_configured_windows(ingested) -> None:  # type: ignore[no-untyped-def]
    _, _, fake, _ = ingested
    fuelhh = [r for r in fake.requests if "FUELHH" in r.url.path]
    windfor = [r for r in fake.requests if "WINDFOR" in r.url.path]
    assert all(r.url.params["fuelType"] == "WIND" for r in fuelhh)
    assert (
        min(r.url.params["settlementDateFrom"] for r in fuelhh) == "2025-12-22"
    )  # 10 days of baseline history
    assert max(r.url.params["settlementDateTo"] for r in fuelhh) == "2026-02-01"
    assert (
        min(r.url.params["publishDateTimeFrom"] for r in windfor) == "2025-12-28T00:00Z"
    )  # 4 days lookback
    assert max(r.url.params["publishDateTimeTo"] for r in windfor) == "2026-02-02T00:00Z"


def test_api_numbers_after_ingestion_match_the_closed_form_values(ingested) -> None:  # type: ignore[no-untyped-def]
    _, app, _, _ = ingested
    with TestClient(app) as client:
        body = client.get("/api/summary").json()
    assert body["metrics"]["n"] == 1488
    assert body["metrics"]["mae_mw"] == pytest.approx(ELIGIBLE_MW - ACTUAL_MW)
    assert body["coverage"]["coverage"] == 1.0 and body["data_status"]["status"] == "sufficient"


def test_refresh_state_records_success(ingested) -> None:  # type: ignore[no-untyped-def]
    _, app, _, _ = ingested
    with TestClient(app) as client:
        refresh = client.get("/api/metadata").json()["refresh"]
    assert refresh["status"] == "ok" and refresh["last_success_at"] and refresh["error"] is None


class TestFailureKeepsServingPreviousSnapshot:
    def setup_app(self, tmp_path):  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path)
        write_exact_snapshot(settings)
        return settings, create_app(settings)

    def run_failing(self, settings, app, handler) -> Exception:  # type: ignore[no-untyped-def]
        async def go() -> Exception | None:
            client = client_for(settings, handler)
            try:
                await app.state.ingestion.run(client)
            except Exception as exc:
                return exc
            finally:
                await client.aclose()
            return None

        error = asyncio.run(go())
        assert error is not None
        return error

    def test_upstream_outage(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings, app = self.setup_app(tmp_path)
        with TestClient(app) as client:
            before = client.get("/api/metadata").json()["provenance"]["retrieved_at"]
            error = self.run_failing(settings, app, lambda r: httpx.Response(503))
            assert isinstance(error, UpstreamUnavailableError)

            meta = client.get("/api/metadata").json()
            assert meta["refresh"]["status"] == "failed" and "503" in meta["refresh"]["error"]
            assert (
                meta["data_available"] is True and meta["provenance"]["retrieved_at"] == before
            )  # old data, honestly dated
            assert client.get("/api/summary").json()["metrics"]["n"] == 1488

    def test_empty_upstream_does_not_replace_a_good_snapshot(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings, app = self.setup_app(tmp_path)
        with TestClient(app) as client:
            error = self.run_failing(settings, app, lambda r: httpx.Response(200, json=[]))
            assert isinstance(error, IngestionError)
            assert client.get("/api/metadata").json()["refresh"]["status"] == "failed"
            assert client.get("/api/summary").status_code == 200

    def test_schema_drift_is_reported_not_swallowed(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings, app = self.setup_app(tmp_path)
        with TestClient(app) as client:
            error = self.run_failing(
                settings, app, lambda r: httpx.Response(200, json=[{"time": "x", "mw": 1}])
            )
            assert "missing required field" in str(error)
            assert (
                "missing required field" in client.get("/api/metadata").json()["refresh"]["error"]
            )

    def test_concurrent_ingestion_is_refused(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings, app = self.setup_app(tmp_path)

        async def go() -> Exception | None:
            release = asyncio.Event()

            async def slow_sleep(_: float) -> None:
                await release.wait()

            def failing(_: httpx.Request) -> httpx.Response:
                return httpx.Response(503)

            first_client = ElexonClient(
                settings,
                transport=httpx.MockTransport(failing),
                sleep=slow_sleep,
                jitter=lambda: 0.0,
            )
            first = asyncio.create_task(app.state.ingestion.run(first_client))
            await asyncio.sleep(0.05)
            try:
                await app.state.ingestion.run(client_for(settings, failing))
                return None
            except IngestionError as exc:
                return exc
            finally:
                release.set()
                with pytest.raises(UpstreamUnavailableError):
                    await first
                await first_client.aclose()

        error = asyncio.run(go())
        assert error is not None and "already in progress" in str(error)
