"""Snapshot integrity, settings validation and the live-verification routine (mock transport)."""

import json
from pathlib import Path

import httpx
import pandas as pd
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services.verification import render_markdown, save_artifacts, verify_upstream
from app.store.snapshot import SnapshotError, read_manifest, read_snapshot, write_snapshot
from tests.conftest import exact_frames, make_settings, manifest_for


class TestSnapshot:
    def write(self, tmp_path: Path):  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path)
        actuals, forecasts = exact_frames()
        write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest_for(settings))
        return settings, actuals, forecasts

    def test_round_trip_preserves_values_and_utc_ns_dtypes(self, tmp_path: Path) -> None:
        settings, actuals, forecasts = self.write(tmp_path)
        snap = read_snapshot(settings.snapshot_dir)
        assert len(snap.actuals) == len(actuals) and len(snap.forecasts) == len(forecasts)
        for frame, cols in (
            (snap.actuals, ["start_utc"]),
            (snap.forecasts, ["start_utc", "publish_utc"]),
        ):
            for col in cols:
                assert str(frame[col].dtype) == "datetime64[ns, UTC]"
        assert snap.manifest.actuals_rows == len(actuals) and set(snap.manifest.files) == {
            "actuals.parquet",
            "forecasts.parquet",
        }

    def test_forecasts_are_returned_sorted_by_publication(self, tmp_path: Path) -> None:
        settings, _, _ = self.write(tmp_path)
        assert read_snapshot(settings.snapshot_dir).forecasts["publish_utc"].is_monotonic_increasing

    def test_tampered_file_fails_checksum(self, tmp_path: Path) -> None:
        settings, _, _ = self.write(tmp_path)
        path = settings.snapshot_dir / "forecasts.parquet"
        path.write_bytes(path.read_bytes() + b"x")
        with pytest.raises(SnapshotError, match="Checksum mismatch"):
            read_snapshot(settings.snapshot_dir)

    def test_missing_manifest_and_files(self, tmp_path: Path) -> None:
        with pytest.raises(SnapshotError, match="No snapshot manifest"):
            read_manifest(tmp_path / "nope")
        settings, _, _ = self.write(tmp_path)
        (settings.snapshot_dir / "actuals.parquet").unlink()
        with pytest.raises(SnapshotError, match="missing"):
            read_snapshot(settings.snapshot_dir)

    def test_unsupported_schema_version(self, tmp_path: Path) -> None:
        settings, _, _ = self.write(tmp_path)
        path = settings.snapshot_dir / "manifest.json"
        data = json.loads(path.read_text())
        data["schema_version"] = 99
        path.write_text(json.dumps(data))
        with pytest.raises(SnapshotError, match="not supported"):
            read_manifest(settings.snapshot_dir)

    def test_failed_write_leaves_the_previous_snapshot_intact_and_no_staging_dir(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        settings, actuals, forecasts = self.write(tmp_path)
        before = (settings.snapshot_dir / "manifest.json").read_text()

        def boom(*_: object, **__: object) -> None:
            raise OSError("disk full")

        monkeypatch.setattr(pd.DataFrame, "to_parquet", boom)
        with pytest.raises(OSError, match="disk full"):
            write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest_for(settings))
        assert (settings.snapshot_dir / "manifest.json").read_text() == before
        assert read_snapshot(settings.snapshot_dir).manifest.actuals_rows == len(actuals)
        assert not [p for p in settings.snapshot_dir.parent.iterdir() if p.name.startswith(".")]

    def test_replacing_a_snapshot_swaps_it_atomically(self, tmp_path: Path) -> None:
        settings, actuals, forecasts = self.write(tmp_path)
        write_snapshot(
            settings.snapshot_dir, actuals.head(10), forecasts.head(20), manifest_for(settings)
        )
        snap = read_snapshot(settings.snapshot_dir)
        assert len(snap.actuals) == 10 and len(snap.forecasts) == 20


class TestSettings:
    def test_defaults_match_the_documented_assumptions(self, tmp_path: Path) -> None:
        s = Settings(_env_file=None, data_dir=tmp_path)  # type: ignore[call-arg]
        assert s.decision_cutoff_local == "09:20" and s.analysis_month == "2026-01"
        assert (
            s.default_basis.value == "decision_date"
            and s.cutoff_time.hour == 9
            and s.cutoff_time.minute == 20
        )
        assert s.admin_token is None and s.auto_ingest_on_start is False

    @pytest.mark.parametrize(
        "field,value",
        [
            ("decision_cutoff_local", "9.20"),
            ("analysis_month", "2026-13"),
            ("coverage_sufficient", 1.5),
        ],
    )
    def test_invalid_values_are_rejected_at_startup(
        self, tmp_path: Path, field: str, value: object
    ) -> None:
        with pytest.raises((ValidationError, ValueError)):
            Settings(_env_file=None, data_dir=tmp_path, **{field: value})  # type: ignore[call-arg]


FUELHH_OK = [
    {
        "dataset": "FUELHH",
        "publishTime": "2026-01-15T00:35:00Z",
        "startTime": f"2026-01-15T0{h}:{m}:00Z",
        "settlementDate": "2026-01-15",
        "settlementPeriod": i + 1,
        "fuelType": "WIND",
        "generation": 3000 + i,
    }
    for i, (h, m) in enumerate([(0, "00"), (0, "30"), (1, "00"), (1, "30")])
]
WINDFOR_OK = [
    {
        "dataset": "WINDFOR",
        "publishTime": pub,
        "startTime": f"2026-01-15T0{h}:{m}:00Z",
        "generation": 3100 + h,
    }
    for pub in ("2026-01-14T06:00:00Z", "2026-01-14T07:00:00Z")
    for h, m in [(0, "00"), (0, "30"), (1, "00"), (1, "30")]
]


class TestVerification:
    def run(self, handler):  # type: ignore[no-untyped-def]
        import asyncio

        settings = make_settings(Path("/tmp/unused"))
        return asyncio.run(verify_upstream(settings, transport=httpx.MockTransport(handler)))

    def test_records_observed_schema_resolution_and_cadence(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            body = FUELHH_OK if "FUELHH" in request.url.path else WINDFOR_OK
            return httpx.Response(200, json=body, headers={"x-ratelimit-remaining": "99"})

        report = self.run(handler)
        assert report.all_ok and report.probe_day == "2026-01-15"
        fuel, wind = report.observations
        assert fuel.field_names == sorted(FUELHH_OK[0]) and fuel.timestamp_format_ok is True
        assert (
            fuel.facts["distinct_fuelType"] == ["WIND"]
            and fuel.facts["startTime_step_minutes_mode"] == 30.0
        )
        assert (
            wind.facts["distinct_publishTime"] == 2
            and wind.facts["publish_cadence_minutes_median"] == 60.0
        )
        assert (
            wind.facts["startTime_step_minutes_mode"] == 30.0
            and wind.facts["published_after_start"] == 0
        )
        assert fuel.ratelimit_headers == {"x-ratelimit-remaining": "99"}

    def test_flags_missing_required_fields(self) -> None:
        report = self.run(
            lambda r: httpx.Response(
                200, json=[{"startTime": "2026-01-15T00:00:00Z", "generation": 1}]
            )
        )
        assert not report.all_ok and report.observations[0].missing_required == ["fuelType"]

    def test_records_http_errors_and_network_failures_without_raising(self) -> None:
        report = self.run(lambda r: httpx.Response(403, text="Forbidden"))
        assert not report.all_ok and "HTTP 403" in (report.observations[0].error or "")

        def boom(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("blocked", request=request)

        report = self.run(boom)
        assert not report.all_ok and "ConnectError" in (report.observations[0].error or "")

    def test_empty_probe_is_a_failure_not_a_pass(self) -> None:
        assert not self.run(lambda r: httpx.Response(200, json=[])).all_ok

    def test_artifacts_are_written_and_marked_as_observed(self, tmp_path: Path) -> None:
        report = self.run(
            lambda r: httpx.Response(200, json=FUELHH_OK if "FUELHH" in r.url.path else WINDFOR_OK)
        )
        written = save_artifacts(report, tmp_path / "docs", tmp_path / "fixtures")
        names = {p.name for p in written}
        assert names == {"elexon-verification.md", "fuelhh_sample.json", "windfor_sample.json"}
        md = (tmp_path / "docs" / "elexon-verification.md").read_text()
        assert "PASS" in md and "observed in a real response" in md and "Units" in md
        assert render_markdown(report) == md
