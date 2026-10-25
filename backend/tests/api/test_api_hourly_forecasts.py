"""The API on an hourly-forecast snapshot (the shape the live WINDFOR feed really has).

Same closed-form fixture as ``test_api_exact`` - actual 1000 MW, decision-time forecast 1100 MW, a later
revision 1010 MW - but forecast rows exist for whole hours only and the manifest records the 60-minute
grid, as ``app.cli ingest`` does.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.store.snapshot import write_snapshot
from tests.conftest import exact_frames, make_settings, manifest_for

N = 31 * 48  # decision basis: 2 Jan .. 1 Feb 2026, half-hours


def write_hourly_snapshot(settings: Settings) -> None:
    actuals, forecasts = exact_frames()
    forecasts = forecasts[forecasts["start_utc"].dt.minute == 0].reset_index(drop=True)
    manifest = manifest_for(settings).model_copy(
        update={"quality": {"forecast_profile": {"start_resolution_minutes": 60.0}}}
    )
    write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest)


def client_for(tmp_path: Path, **overrides: object) -> Iterator[TestClient]:
    settings = make_settings(tmp_path, **overrides)
    write_hourly_snapshot(settings)
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def held_client(tmp_path: Path) -> Iterator[TestClient]:
    yield from client_for(tmp_path)


@pytest.fixture
def exact_mode_client(tmp_path: Path) -> Iterator[TestClient]:
    yield from client_for(tmp_path, forecast_alignment="exact")


class TestHeldAlignment:
    def test_every_half_hour_is_scored_against_its_hours_forecast(
        self, held_client: TestClient
    ) -> None:
        body = held_client.get("/api/summary").json()
        m = body["metrics"]
        assert m["n"] == N
        assert m["mae_mw"] == pytest.approx(100.0)
        assert m["bias_mw"] == pytest.approx(100.0)
        assert body["coverage"]["coverage"] == pytest.approx(1.0)
        assert body["data_status"]["status"] == "sufficient"

    def test_the_interpretation_is_stated_on_every_analysis(self, held_client: TestClient) -> None:
        a = held_client.get("/api/summary").json()["analysis"]
        assert a["forecast_block_minutes"] == 60
        assert a["forecast_alignment"] == "hold"
        assert "both half-hours" in a["forecast_alignment_note"]
        assert "interpolated" in a["forecast_alignment_note"]

    def test_hindsight_comparator_uses_the_same_block(self, held_client: TestClient) -> None:
        hind = held_client.get("/api/summary").json()["hindsight_latest"]
        assert hind["n"] == N
        assert hind["mae_mw"] == pytest.approx(10.0)  # the post-cutoff revision, hindsight only

    def test_vintages_of_an_off_hour_start_show_the_hours_publications(
        self, held_client: TestClient
    ) -> None:
        body = held_client.get(
            "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00Z"}
        ).json()
        assert body["start_time"].startswith("2026-01-15T08:30")
        assert body["forecast_for_time"].startswith("2026-01-15T08:00")
        assert body["forecast_block_minutes"] == 60
        assert body["n_vintages"] == 3 and body["n_eligible"] == 2
        assert sum(1 for v in body["vintages"] if v["selected"]) == 1
        assert body["selected"]["forecast_mw"] == pytest.approx(1100.0)
        assert "both half-hours" in body["forecast_alignment_note"]

    def test_vintages_of_an_on_hour_start_refer_to_themselves(
        self, held_client: TestClient
    ) -> None:
        body = held_client.get(
            "/api/forecast-vintages", params={"start": "2026-01-15T08:00:00Z"}
        ).json()
        assert body["forecast_for_time"] == body["start_time"]

    def test_csv_names_the_forecast_hour_each_row_refers_to(self, held_client: TestClient) -> None:
        text = held_client.get(
            "/api/intervals/export", params={"from": "2026-01-14", "to": "2026-01-14"}
        ).text
        lines = [ln for ln in text.splitlines() if not ln.startswith("#")]
        header = lines[0].split(",")
        col = header.index("forecast_valid_for_utc")
        start = header.index("start_time_utc")
        row = next(
            ln.split(",") for ln in lines[1:] if ln.split(",")[start] == "2026-01-15T08:30:00Z"
        )
        assert row[col] == "2026-01-15T08:00:00Z"

    def test_the_manifest_records_the_grid_it_was_measured_on(
        self, held_client: TestClient
    ) -> None:
        q = held_client.get("/api/metadata").json()["quality"]
        assert q["forecast_profile"]["start_resolution_minutes"] == 60.0


class TestExactAlignment:
    def test_off_hour_half_hours_are_missing_not_filled(
        self, exact_mode_client: TestClient
    ) -> None:
        body = exact_mode_client.get("/api/summary").json()
        assert body["metrics"]["n"] == N // 2
        assert body["coverage"]["missing_forecast"] == N // 2
        assert body["coverage"]["coverage"] == pytest.approx(0.5)
        assert body["data_status"]["status"] == "insufficient"

    def test_the_note_says_what_happens_to_the_other_half_hours(
        self, exact_mode_client: TestClient
    ) -> None:
        a = exact_mode_client.get("/api/summary").json()["analysis"]
        assert a["forecast_block_minutes"] == 30
        assert a["forecast_alignment"] == "exact"
        assert "missing" in a["forecast_alignment_note"]

    def test_an_off_hour_start_has_no_vintages_to_show(self, exact_mode_client: TestClient) -> None:
        body = exact_mode_client.get(
            "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00Z"}
        ).json()
        assert body["n_vintages"] == 0
        assert "No WINDFOR publication" in body["explanation"]
