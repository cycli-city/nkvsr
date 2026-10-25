"""Response cache, rate limit, pre-warm and security headers, exercised through the real application."""

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.prewarm import prewarm
from tests.conftest import make_settings, write_exact_snapshot

ORIGIN = "http://localhost:5173"  # the allowed origin in make_settings
UI_QUERY = {"basis": "decision_date", "from": "2026-01-01", "to": "2026-01-31", "cutoff": "09:20"}


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = make_settings(tmp_path)
    write_exact_snapshot(settings)
    with TestClient(create_app(settings)) as c:
        yield c


class TestResponseCache:
    def test_a_repeat_request_is_served_from_the_cache_with_identical_content(
        self, client: TestClient
    ) -> None:
        first = client.get("/api/summary", params=UI_QUERY)
        second = client.get("/api/summary", params=UI_QUERY)
        assert (first.headers["x-cache"], second.headers["x-cache"]) == ("MISS", "HIT")
        assert first.content == second.content
        assert first.headers["etag"] == second.headers["etag"]
        assert second.headers["cache-control"] == "public, max-age=300"

    def test_conditional_requests_return_304(self, client: TestClient) -> None:
        etag = client.get("/api/timeseries", params=UI_QUERY).headers["etag"]
        r = client.get("/api/timeseries", params=UI_QUERY, headers={"If-None-Match": etag})
        assert r.status_code == 304 and r.content == b"" and r.headers["etag"] == etag

    def test_the_cache_is_per_query_and_every_cacheable_endpoint_has_an_etag(
        self, client: TestClient
    ) -> None:
        a = client.get("/api/accuracy", params=UI_QUERY).headers["etag"]
        b = client.get("/api/accuracy", params={**UI_QUERY, "cutoff": "10:00"}).headers["etag"]
        assert a != b
        for path, params in [
            ("/api/summary", UI_QUERY),
            ("/api/intervals", {**UI_QUERY, "page_size": 5}),
            ("/api/intervals/export", UI_QUERY),
            ("/api/forecast-vintages", {"start": "2026-01-15T08:30:00Z"}),
            ("/api/decision-brief", {"decision_date": "2026-01-14"}),
        ]:
            r = client.get(path, params=params)
            assert r.status_code == 200 and "etag" in r.headers, path

    def test_csv_downloads_keep_their_filename_through_the_cache(self, client: TestClient) -> None:
        client.get("/api/intervals/export", params=UI_QUERY)
        r = client.get("/api/intervals/export", params=UI_QUERY)
        assert r.headers["x-cache"] == "HIT"
        assert "attachment" in r.headers["content-disposition"] and r.text.startswith(
            "start_time_utc,"
        )

    def test_errors_and_non_analytics_endpoints_are_not_cached(self, client: TestClient) -> None:
        bad = client.get("/api/summary", params={**UI_QUERY, "cutoff": "25:99"})
        assert bad.status_code == 422 and bad.headers["cache-control"] == "no-store"
        assert "x-cache" not in client.get("/api/metadata").headers
        assert "x-cache" not in client.get("/api/health").headers

    def test_cors_headers_belong_to_the_asking_origin_even_on_cached_responses(
        self, client: TestClient
    ) -> None:
        client.get("/api/summary", params=UI_QUERY, headers={"Origin": ORIGIN})  # populate
        allowed = client.get("/api/summary", params=UI_QUERY, headers={"Origin": ORIGIN})
        foreign = client.get(
            "/api/summary", params=UI_QUERY, headers={"Origin": "https://evil.example"}
        )
        none = client.get("/api/summary", params=UI_QUERY)
        assert allowed.headers["x-cache"] == "HIT"
        assert allowed.headers["access-control-allow-origin"] == ORIGIN
        assert (
            "access-control-allow-origin" not in foreign.headers
        )  # never leaked from the cached entry
        assert "access-control-allow-origin" not in none.headers
        assert "Origin" in allowed.headers["vary"]

    def test_a_refreshed_snapshot_invalidates_cached_responses_and_etags(
        self, tmp_path: Path
    ) -> None:
        settings = make_settings(tmp_path)
        write_exact_snapshot(settings)
        app = create_app(settings)
        with TestClient(app) as c:
            before = c.get("/api/summary", params=UI_QUERY)
            write_exact_snapshot(
                settings, drop_actual_every=20
            )  # a different dataset appears on disk
            app.state.store.load_from_disk()  # what a successful refresh does
            after = c.get(
                "/api/summary", params=UI_QUERY, headers={"If-None-Match": before.headers["etag"]}
            )
        assert after.status_code == 200 and after.headers["x-cache"] == "MISS"
        assert after.headers["etag"] != before.headers["etag"]
        assert after.json()["coverage"]["coverage"] < before.json()["coverage"]["coverage"]

    def test_browser_cache_lifetime_is_configurable(self, tmp_path: Path) -> None:
        settings = make_settings(tmp_path, browser_cache_seconds=0)
        write_exact_snapshot(settings)
        with TestClient(create_app(settings)) as c:
            r = c.get("/api/summary", params=UI_QUERY)
        assert r.headers["cache-control"] == "no-cache" and "etag" in r.headers

    def test_nothing_is_cached_while_no_dataset_is_loaded(self, tmp_path: Path) -> None:
        with TestClient(create_app(make_settings(tmp_path))) as c:
            r = c.get("/api/summary", params=UI_QUERY)
            again = c.get("/api/summary", params=UI_QUERY, headers={"If-None-Match": "*"})
        assert r.status_code == 503 and again.status_code == 503 and "x-cache" not in r.headers


class TestPrewarm:
    def test_the_dashboards_first_requests_are_already_cached_after_prewarm(
        self, tmp_path: Path
    ) -> None:
        settings = make_settings(tmp_path)
        write_exact_snapshot(settings)
        app = create_app(settings)
        with TestClient(app) as c:
            warmed = asyncio.run(prewarm(app))
            assert warmed == 10  # 4 analytics views + the brief, for each of the 2 readings
            for basis, brief_date in (
                ("decision_date", "2026-01-31"),
                ("delivery_date", "2026-01-30"),
            ):
                params = {
                    "basis": basis,
                    "from": "2026-01-01",
                    "to": "2026-01-31",
                    "cutoff": "09:20",
                }
                for path in (
                    "/api/summary",
                    "/api/timeseries",
                    "/api/accuracy",
                    "/api/cutoff-sensitivity",
                    "/api/cutoff-sensitivity",
                ):
                    assert c.get(path, params=params).headers["x-cache"] == "HIT", (basis, path)
                brief = c.get(
                    "/api/decision-brief", params={"decision_date": brief_date, "cutoff": "09:20"}
                )
                assert brief.headers["x-cache"] == "HIT", basis

    def test_prewarm_does_nothing_without_data_and_never_raises(self, tmp_path: Path) -> None:
        app = create_app(make_settings(tmp_path))
        with TestClient(app):
            assert asyncio.run(prewarm(app)) == 0

    def test_prewarm_runs_on_startup_when_enabled(self, tmp_path: Path) -> None:
        settings = make_settings(tmp_path, prewarm_on_start=True)
        write_exact_snapshot(settings)
        with TestClient(create_app(settings)) as c:
            for _ in range(100):  # the task runs in the background; give it a moment
                if c.get("/api/summary", params=UI_QUERY).headers["x-cache"] == "HIT":
                    break
                asyncio.run(asyncio.sleep(0.05))
            else:
                pytest.fail("start-up pre-warm never populated the cache")


class TestRateLimit:
    def test_a_client_that_exceeds_its_budget_gets_429_with_cors_headers(
        self, tmp_path: Path
    ) -> None:
        settings = make_settings(tmp_path, rate_limit_per_minute=10)  # burst = max(10, 2) = 10
        write_exact_snapshot(settings)
        with TestClient(create_app(settings)) as c:
            codes = [
                c.get(
                    "/api/summary", params=UI_QUERY, headers={"X-Forwarded-For": "198.51.100.1"}
                ).status_code
                for _ in range(14)
            ]
            limited = c.get(
                "/api/summary",
                params=UI_QUERY,
                headers={"X-Forwarded-For": "198.51.100.1", "Origin": ORIGIN},
            )
            other = c.get(
                "/api/summary", params=UI_QUERY, headers={"X-Forwarded-For": "198.51.100.2"}
            )
            health = c.get("/api/health", headers={"X-Forwarded-For": "198.51.100.1"})
        assert codes[:10] == [200] * 10 and set(codes[10:]) == {429}
        assert limited.status_code == 429 and int(limited.headers["retry-after"]) >= 1
        assert limited.json()["error"]["code"] == "rate_limited"
        assert (
            limited.headers["access-control-allow-origin"] == ORIGIN
        )  # the browser can read the error
        assert other.status_code == 200 and health.status_code == 200

    def test_the_default_budget_is_generous_for_a_person(self, tmp_path: Path) -> None:
        settings = make_settings(tmp_path)
        assert settings.rate_limit_per_minute == 0  # tests disable it...
        from app.config import Settings

        default = Settings(_env_file=None)  # type: ignore[call-arg]
        assert (
            default.rate_limit_per_minute >= 120
        )  # ...production default allows several requests a second


class TestSecurityHeaders:
    def test_json_endpoints_carry_the_full_set(self, client: TestClient) -> None:
        h = client.get("/api/summary", params=UI_QUERY).headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["x-frame-options"] == "DENY"
        assert h["referrer-policy"] == "no-referrer"
        assert "default-src 'none'" in h["content-security-policy"]
        assert "frame-ancestors 'none'" in h["content-security-policy"]
        assert "geolocation=()" in h["permissions-policy"]
        assert h["cross-origin-opener-policy"] == "same-origin"

    def test_error_responses_carry_them_too(self, client: TestClient) -> None:
        h = client.get("/api/does-not-exist").headers
        assert h["x-content-type-options"] == "nosniff" and "content-security-policy" in h

    def test_swagger_docs_are_exempt_from_the_strict_csp_because_they_load_from_a_cdn(
        self, client: TestClient
    ) -> None:
        r = client.get("/api/docs")
        assert r.status_code == 200 and "content-security-policy" not in r.headers
        assert r.headers["x-content-type-options"] == "nosniff"

    def test_hsts_is_sent_only_over_https(self, client: TestClient) -> None:
        assert "strict-transport-security" not in client.get("/api/health").headers
        secure = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
        assert secure.headers["strict-transport-security"].startswith("max-age=")
