"""Validation, error envelopes, empty/failed-data states, CORS, admin guard, production safeguards."""

import pytest
from fastapi.testclient import TestClient

from app.errors import UpstreamUnavailableError
from app.main import create_app
from tests.conftest import make_settings, write_exact_snapshot


def error_of(response) -> dict:  # type: ignore[no-untyped-def,type-arg]
    body = response.json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message", "details"}
    return body["error"]  # type: ignore[no-any-return]


class TestValidation:
    @pytest.mark.parametrize(
        "path,params,code",
        [
            ("/api/summary", {"from": "2025-12-01", "to": "2026-01-05"}, "invalid_request"),
            ("/api/summary", {"from": "2026-01-10", "to": "2026-01-05"}, "invalid_request"),
            ("/api/summary", {"cutoff": "25:00"}, "invalid_request"),
            ("/api/summary", {"cutoff": "9:20"}, "invalid_request"),
            ("/api/summary", {"basis": "other"}, "invalid_request"),
            ("/api/summary", {"from": "not-a-date"}, "invalid_request"),
            ("/api/intervals", {"page": 0}, "invalid_request"),
            ("/api/intervals", {"page_size": 501}, "invalid_request"),
            ("/api/intervals", {"sort_by": "nope"}, "invalid_request"),
            ("/api/intervals", {"status": "nope"}, "invalid_request"),
            ("/api/intervals", {"min_abs_error": -1}, "invalid_request"),
            ("/api/forecast-vintages", {}, "invalid_request"),
            ("/api/forecast-vintages", {"start": "2026-01-15T08:15:00Z"}, "invalid_request"),
            ("/api/forecast-vintages", {"start": "2026-01-15T08:30:00"}, "invalid_request"),
            ("/api/decision-brief", {"decision_date": "2026-06-01"}, "invalid_request"),
        ],
    )
    def test_bad_parameters_return_422_with_the_standard_envelope(
        self, exact_client: TestClient, path: str, params: dict, code: str
    ) -> None:  # type: ignore[type-arg]
        r = exact_client.get(path, params=params)
        assert r.status_code == 422
        assert error_of(r)["code"] == code

    def test_range_longer_than_the_configured_maximum_is_rejected(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path, max_range_days=10)
        write_exact_snapshot(settings)
        with TestClient(create_app(settings)) as client:
            r = client.get("/api/summary", params={"from": "2026-01-01", "to": "2026-01-31"})
        assert r.status_code == 422 and "maximum" in error_of(r)["message"]

    def test_unknown_route_uses_the_envelope(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/nope")
        assert r.status_code == 404 and error_of(r)["code"] == "not_found"

    def test_wrong_method_uses_the_envelope(self, exact_client: TestClient) -> None:
        r = exact_client.post("/api/summary")
        assert r.status_code == 405 and error_of(r)["code"] == "method_not_allowed"

    def test_vintage_outside_coverage_is_404(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/forecast-vintages", params={"start": "2027-01-15T08:30:00Z"})
        assert r.status_code == 404 and error_of(r)["code"] == "not_found"


class TestNoDataStates:
    def test_data_endpoints_return_503_with_a_remedy(self, empty_client: TestClient) -> None:
        for path in ("/api/summary", "/api/timeseries", "/api/accuracy", "/api/intervals"):
            r = empty_client.get(path)
            err = error_of(r)
            assert r.status_code == 503 and err["code"] == "data_unavailable"
            assert "ingest" in err["details"]["remedy"]

    def test_metadata_and_health_still_work_and_say_why(self, empty_client: TestClient) -> None:
        meta = empty_client.get("/api/metadata").json()
        assert meta["data_available"] is False and meta["provenance"] is None
        assert meta["load_error"] and meta["refresh"]["status"] == "never"
        assert [b["id"] for b in meta["bases"]] == ["decision_date", "delivery_date"]
        assert empty_client.get("/api/health").json()["data_loaded"] is False

    def test_corrupt_snapshot_is_refused_not_served(self, settings) -> None:  # type: ignore[no-untyped-def]
        write_exact_snapshot(settings)
        (settings.snapshot_dir / "actuals.parquet").write_bytes(b"tampered")
        with TestClient(create_app(settings)) as client:
            meta = client.get("/api/metadata").json()
            assert meta["data_available"] is False and "Checksum mismatch" in meta["load_error"]
            assert client.get("/api/summary").status_code == 503


class TestProductionSafeguards:
    def test_synthetic_snapshot_is_refused_in_production(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path, app_env="production")
        write_exact_snapshot(settings, provenance="synthetic_dev")
        with TestClient(create_app(settings)) as client:
            meta = client.get("/api/metadata").json()
            assert meta["data_available"] is False
            assert "synthetic" in meta["load_error"].lower()
            assert client.get("/api/summary").status_code == 503

    def test_synthetic_snapshot_is_flagged_in_development(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path, app_env="development")
        write_exact_snapshot(settings, provenance="synthetic_dev")
        with TestClient(create_app(settings)) as client:
            body = client.get("/api/summary").json()
        assert (
            body["provenance"]["is_synthetic"] is True
            and body["provenance"]["provenance"] == "synthetic_dev"
        )


class TestCors:
    def test_allowed_origin_is_echoed(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        assert r.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_unlisted_origin_gets_no_cors_headers(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/health", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in r.headers

    def test_preflight_from_unlisted_origin_is_rejected(self, exact_client: TestClient) -> None:
        r = exact_client.options(
            "/api/summary",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
        assert r.status_code == 400

    def test_origins_come_from_comma_separated_env(self, tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
        from app.config import Settings

        assert Settings(_env_file=None, data_dir=tmp_path).cors_origins == [
            "https://a.example",
            "https://b.example",
        ]  # type: ignore[call-arg]


class TestAdminRefresh:
    class FakeIngestion:
        def __init__(self, outcome: Exception | None = None, manifest=None) -> None:  # type: ignore[no-untyped-def]
            self.outcome, self.manifest, self.calls = outcome, manifest, 0

        async def run(self, client=None):  # type: ignore[no-untyped-def]
            self.calls += 1
            if self.outcome:
                raise self.outcome
            return self.manifest

    def client(self, tmp_path, token: str | None):  # type: ignore[no-untyped-def]
        settings = make_settings(tmp_path, admin_token=token)
        write_exact_snapshot(settings)
        app = create_app(settings)
        return app, TestClient(app)

    def test_disabled_without_a_configured_token(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        _, client = self.client(tmp_path, None)
        with client:
            r = client.post("/api/admin/refresh", headers={"X-Admin-Token": "anything"})
        assert r.status_code == 404 and error_of(r)["code"] == "admin_disabled"

    def test_rejects_missing_or_wrong_token(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        app, client = self.client(tmp_path, "s3cret-s3cret-s3cret")
        app.state.ingestion = self.FakeIngestion()
        with client:
            assert client.post("/api/admin/refresh").status_code == 401
            assert (
                client.post("/api/admin/refresh", headers={"X-Admin-Token": "wrong"}).status_code
                == 401
            )
        assert app.state.ingestion.calls == 0

    def test_upstream_failure_is_a_502_with_the_reason(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        app, client = self.client(tmp_path, "s3cret-s3cret-s3cret")
        app.state.ingestion = self.FakeIngestion(UpstreamUnavailableError("Elexon is down"))
        with client:
            r = client.post("/api/admin/refresh", headers={"X-Admin-Token": "s3cret-s3cret-s3cret"})
        assert r.status_code == 502 and error_of(r) == {
            "code": "upstream_error",
            "message": "Elexon is down",
            "details": None,
        }

    def test_success_returns_snapshot_summary(self, tmp_path) -> None:  # type: ignore[no-untyped-def]
        from tests.conftest import manifest_for

        settings = make_settings(tmp_path, admin_token="s3cret-s3cret-s3cret")
        manifest = manifest_for(settings).model_copy(
            update={"actuals_rows": 5, "forecasts_rows": 7, "warnings": ["w"]}
        )
        write_exact_snapshot(settings)
        app = create_app(settings)
        app.state.ingestion = self.FakeIngestion(manifest=manifest)
        with TestClient(app) as client:
            r = client.post("/api/admin/refresh", headers={"X-Admin-Token": "s3cret-s3cret-s3cret"})
        assert r.status_code == 200
        assert (
            r.json()["actuals_rows"] == 5
            and r.json()["forecasts_rows"] == 7
            and r.json()["warnings"] == ["w"]
        )
