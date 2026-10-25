"""Client behaviour against a mocked transport: no live Elexon access is required or used."""

import asyncio
import itertools
from collections.abc import Callable
from datetime import UTC, date, datetime

import httpx
import pytest

from app.config import Settings
from app.elexon import endpoints
from app.elexon.client import ElexonClient, chunk_dates, chunk_datetimes
from app.errors import UpstreamRequestError, UpstreamSchemaError, UpstreamUnavailableError

OK_ROW = {
    "dataset": "FUELHH",
    "startTime": "2026-01-15T00:00:00Z",
    "fuelType": "WIND",
    "generation": 1,
}
FC_ROW = {
    "dataset": "WINDFOR",
    "startTime": "2026-01-15T00:00:00Z",
    "publishTime": "2026-01-14T06:00:00Z",
    "generation": 1,
}


def make_settings(**overrides: object) -> Settings:
    base = {
        "_env_file": None,
        "app_env": "test",
        "elexon_max_retries": 3,
        "elexon_backoff_seconds": 1.0,
        "elexon_actuals_chunk_days": 7,
        "elexon_forecast_chunk_days": 2,
        "elexon_concurrency": 3,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


class Harness:
    """Builds a client on a MockTransport and records sleeps (so tests run instantly)."""

    def __init__(
        self, handler: Callable[[httpx.Request], httpx.Response], **settings: object
    ) -> None:
        self.sleeps: list[float] = []
        self.requests: list[httpx.Request] = []

        async def fake_sleep(seconds: float) -> None:
            self.sleeps.append(seconds)

        def recording(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return handler(request)

        self.client = ElexonClient(
            make_settings(**settings),
            transport=httpx.MockTransport(recording),
            sleep=fake_sleep,
            jitter=lambda: 0.0,
        )

    def run(self, coro_fn: Callable[[ElexonClient], object]):  # type: ignore[no-untyped-def]
        async def go():  # type: ignore[no-untyped-def]
            try:
                return await coro_fn(self.client)  # type: ignore[misc]
            finally:
                await self.client.aclose()

        return asyncio.run(go())


def request_fuelhh() -> endpoints.UpstreamRequest:
    return endpoints.fuelhh_wind_request(date(2026, 1, 15), date(2026, 1, 15))


class TestChunking:
    def test_dates_cover_range_without_overlap(self) -> None:
        assert chunk_dates(date(2026, 1, 1), date(2026, 1, 15), 7) == [
            (date(2026, 1, 1), date(2026, 1, 7)),
            (date(2026, 1, 8), date(2026, 1, 14)),
            (date(2026, 1, 15), date(2026, 1, 15)),
        ]

    def test_dates_empty_when_reversed(self) -> None:
        assert chunk_dates(date(2026, 1, 2), date(2026, 1, 1), 7) == []

    def test_datetime_windows_share_boundaries_and_cover_range(self) -> None:
        start, end = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 6, tzinfo=UTC)
        windows = chunk_datetimes(start, end, 2)
        assert windows[0][0] == start and windows[-1][1] == end
        assert all(a[1] == b[0] for a, b in itertools.pairwise(windows))
        assert len(windows) == 3


class TestEndpoints:
    def test_fuelhh_requests_only_wind(self) -> None:
        req = endpoints.fuelhh_wind_request(date(2026, 1, 1), date(2026, 1, 7))
        assert req.path == "/datasets/FUELHH/stream"
        assert req.params == {
            "settlementDateFrom": "2026-01-01",
            "settlementDateTo": "2026-01-07",
            "fuelType": "WIND",
        }

    def test_windfor_params_are_utc_iso_minutes(self) -> None:
        req = endpoints.windfor_request(
            datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 3, 12, 30, tzinfo=UTC)
        )
        assert req.path == "/datasets/WINDFOR/stream"
        assert req.params == {
            "publishDateTimeFrom": "2026-01-01T00:00Z",
            "publishDateTimeTo": "2026-01-03T12:30Z",
        }

    def test_windfor_rejects_naive_datetimes(self) -> None:
        with pytest.raises(ValueError):
            endpoints.windfor_request(datetime(2026, 1, 1), datetime(2026, 1, 2))


class TestGetRecords:
    def test_accepts_bare_array(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[OK_ROW]))
        assert h.run(lambda c: c.get_records(request_fuelhh())) == [OK_ROW]

    def test_accepts_data_envelope(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json={"data": [OK_ROW]}))
        assert h.run(lambda c: c.get_records(request_fuelhh())) == [OK_ROW]

    def test_sends_documented_query_parameters(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[OK_ROW]))
        h.run(lambda c: c.get_records(request_fuelhh()))
        url = h.requests[0].url
        assert url.path.endswith("/datasets/FUELHH/stream")
        assert dict(url.params) == {
            "settlementDateFrom": "2026-01-15",
            "settlementDateTo": "2026-01-15",
            "fuelType": "WIND",
        }

    def test_retries_server_errors_with_exponential_backoff_then_succeeds(self) -> None:
        responses = iter(
            [httpx.Response(500), httpx.Response(503), httpx.Response(200, json=[OK_ROW])]
        )
        h = Harness(lambda r: next(responses))
        assert h.run(lambda c: c.get_records(request_fuelhh())) == [OK_ROW]
        assert h.sleeps == [1.0, 2.0] and len(h.requests) == 3

    def test_honours_retry_after_header_on_429(self) -> None:
        responses = iter(
            [httpx.Response(429, headers={"Retry-After": "7"}), httpx.Response(200, json=[OK_ROW])]
        )
        h = Harness(lambda r: next(responses))
        h.run(lambda c: c.get_records(request_fuelhh()))
        assert h.sleeps == [7.0]

    def test_gives_up_after_max_retries_with_unavailable_error(self) -> None:
        h = Harness(lambda r: httpx.Response(503), elexon_max_retries=2)
        with pytest.raises(UpstreamUnavailableError, match="3 attempts"):
            h.run(lambda c: c.get_records(request_fuelhh()))
        assert len(h.requests) == 3 and len(h.sleeps) == 2

    def test_client_errors_are_not_retried_and_surface_the_body(self) -> None:
        h = Harness(lambda r: httpx.Response(400, text="Unknown parameter settlementDateFrom"))
        with pytest.raises(UpstreamRequestError, match="Unknown parameter") as info:
            h.run(lambda c: c.get_records(request_fuelhh()))
        assert info.value.status_code == 400 and len(h.requests) == 1 and h.sleeps == []

    def test_timeouts_and_transport_errors_are_retried(self) -> None:
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ReadTimeout("slow", request=request)
            if calls["n"] == 2:
                raise httpx.ConnectError("refused", request=request)
            return httpx.Response(200, json=[OK_ROW])

        h = Harness(handler)
        assert h.run(lambda c: c.get_records(request_fuelhh())) == [OK_ROW]
        assert calls["n"] == 3

    def test_persistent_timeout_raises_unavailable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("slow", request=request)

        h = Harness(handler, elexon_max_retries=1)
        with pytest.raises(UpstreamUnavailableError, match="ReadTimeout"):
            h.run(lambda c: c.get_records(request_fuelhh()))

    def test_truncated_json_is_retried(self) -> None:
        responses = iter(
            [httpx.Response(200, content=b'[{"startTime": '), httpx.Response(200, json=[OK_ROW])]
        )
        h = Harness(lambda r: next(responses))
        assert h.run(lambda c: c.get_records(request_fuelhh())) == [OK_ROW]

    def test_schema_mismatch_is_not_retried(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[{"start": "x", "value": 1}]))
        with pytest.raises(UpstreamSchemaError, match="missing required field"):
            h.run(lambda c: c.get_records(request_fuelhh()))
        assert len(h.requests) == 1

    def test_unexpected_envelope_is_a_schema_error(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json={"error": "nope"}))
        with pytest.raises(UpstreamSchemaError):
            h.run(lambda c: c.get_records(request_fuelhh()))

    def test_empty_array_is_valid_not_an_error(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[]))
        assert h.run(lambda c: c.get_records(request_fuelhh())) == []


class TestDatasetFetches:
    def test_actuals_are_chunked_by_settlement_date_and_concatenated_in_order(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            marker = request.url.params["settlementDateFrom"]
            return httpx.Response(200, json=[{**OK_ROW, "generation": int(marker[-2:])}])

        h = Harness(handler, elexon_actuals_chunk_days=7)
        records = h.run(lambda c: c.fetch_actuals(date(2026, 1, 1), date(2026, 1, 15)))
        assert [r["generation"] for r in records] == [1, 8, 15]
        assert len(h.requests) == 3

    def test_forecasts_are_chunked_by_publish_window(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[FC_ROW]), elexon_forecast_chunk_days=2)
        records = h.run(
            lambda c: c.fetch_forecasts(
                datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 6, tzinfo=UTC)
            )
        )
        assert len(records) == 3
        windows = sorted(
            (r.url.params["publishDateTimeFrom"], r.url.params["publishDateTimeTo"])
            for r in h.requests
        )
        assert windows == [
            ("2026-01-01T00:00Z", "2026-01-03T00:00Z"),
            ("2026-01-03T00:00Z", "2026-01-05T00:00Z"),
            ("2026-01-05T00:00Z", "2026-01-06T00:00Z"),
        ]

    def test_one_failing_chunk_fails_the_whole_fetch_rather_than_returning_partial_data(
        self,
    ) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.params["settlementDateFrom"] == "2026-01-08":
                return httpx.Response(503)
            return httpx.Response(200, json=[OK_ROW])

        h = Harness(handler, elexon_max_retries=0)
        with pytest.raises(UpstreamUnavailableError):
            h.run(lambda c: c.fetch_actuals(date(2026, 1, 1), date(2026, 1, 15)))

    def test_empty_range_makes_no_requests(self) -> None:
        h = Harness(lambda r: httpx.Response(200, json=[]))
        assert h.run(lambda c: c.fetch_actuals(date(2026, 1, 2), date(2026, 1, 1))) == []
        assert h.requests == []
