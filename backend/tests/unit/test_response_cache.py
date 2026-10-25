"""Snapshot-keyed response cache: hits, ETags and 304s, bounds, stale-data protection, error handling."""

from typing import Any

import pytest
from starlette.types import Receive, Scope, Send

from app.api.middleware import ResponseCacheMiddleware

from .asgi_helpers import BODY, CountingApp, call, run


class TestResponseCache:
    def cache(
        self, inner: CountingApp | None = None, *, version: str | None = "v1", **kw: Any
    ) -> tuple[ResponseCacheMiddleware, CountingApp, dict[str, str | None]]:
        state: dict[str, str | None] = {"version": version}
        inner = inner or CountingApp()
        mw = ResponseCacheMiddleware(
            inner, version=lambda: state["version"], paths=["/api/summary", "/api/other"], **kw
        )
        return mw, inner, state

    def test_second_identical_request_is_served_from_the_cache(self) -> None:
        mw, inner, _ = self.cache()
        first = run(call(mw, query="basis=x&from=1"))
        second = run(call(mw, query="basis=x&from=1"))
        assert first[2] == second[2] == BODY
        assert first[1]["x-cache"] == "MISS" and second[1]["x-cache"] == "HIT"
        assert inner.calls == 1
        assert second[1]["etag"] == first[1]["etag"]
        assert second[1]["cache-control"] == "public, max-age=300"

    def test_query_parameter_order_does_not_matter_but_values_do(self) -> None:
        mw, inner, _ = self.cache()
        run(call(mw, query="a=1&b=2"))
        assert run(call(mw, query="b=2&a=1"))[1]["x-cache"] == "HIT"
        assert run(call(mw, query="a=1&b=3"))[1]["x-cache"] == "MISS"
        assert inner.calls == 2

    def test_a_matching_etag_gets_304_without_running_the_application(self) -> None:
        mw, inner, _ = self.cache()
        etag = run(call(mw, query="a=1"))[1]["etag"]
        calls_before = inner.calls
        status, headers, body = run(call(mw, query="a=1", headers={"If-None-Match": etag}))
        assert (status, body) == (304, b"")
        assert headers["etag"] == etag and inner.calls == calls_before
        # Works even before this process has computed that exact request: the key alone proves the content.
        mw2, inner2, _ = self.cache()
        assert run(call(mw2, query="a=1", headers={"If-None-Match": etag}))[0] == 304
        assert inner2.calls == 0

    def test_a_stale_or_foreign_etag_gets_a_full_response(self) -> None:
        mw, _, _ = self.cache()
        assert run(call(mw, headers={"If-None-Match": 'W/"nope"'}))[0] == 200

    def test_if_none_match_accepts_lists_wildcards_and_weak_prefixes(self) -> None:
        mw, _, _ = self.cache()
        etag = run(call(mw))[1]["etag"]
        strong = etag.removeprefix("W/")
        for value in (f'"x", {etag}', strong, "*"):
            assert run(call(mw, headers={"If-None-Match": value}))[0] == 304

    def test_a_new_snapshot_version_invalidates_everything(self) -> None:
        mw, inner, state = self.cache()
        old = run(call(mw))[1]["etag"]
        state["version"] = "v2"
        status, headers, _ = run(call(mw, headers={"If-None-Match": old}))
        assert status == 200 and headers["x-cache"] == "MISS" and headers["etag"] != old
        assert inner.calls == 2

    def test_nothing_is_cached_or_short_circuited_without_a_dataset(self) -> None:
        mw, inner, _ = self.cache(version=None)
        run(call(mw))
        assert run(call(mw, headers={"If-None-Match": "*"}))[0] == 200
        assert inner.calls == 2

    def test_errors_are_never_cached_and_are_marked_no_store(self) -> None:
        mw, inner, _ = self.cache(CountingApp(status=422, body=b'{"error": {}}'))
        for _ in range(2):
            status, headers, _ = run(call(mw))
            assert (
                status == 422 and headers["cache-control"] == "no-store" and "etag" not in headers
            )
        assert inner.calls == 2

    def test_only_listed_get_requests_are_cached(self) -> None:
        mw, inner, _ = self.cache()
        for _ in range(2):
            assert "x-cache" not in run(call(mw, "/api/metadata"))[1]
            assert "x-cache" not in run(call(mw, method="POST"))[1]
        assert inner.calls == 4

    def test_gzip_and_identity_clients_have_separate_entries(self) -> None:
        mw, inner, _ = self.cache()
        run(call(mw, headers={"Accept-Encoding": "gzip, deflate, br"}))
        assert run(call(mw, headers={"Accept-Encoding": "identity"}))[1]["x-cache"] == "MISS"
        assert run(call(mw, headers={"Accept-Encoding": "br, gzip;q=0.9"}))[1]["x-cache"] == "HIT"
        assert inner.calls == 2

    def test_upstream_cache_headers_are_replaced_not_duplicated(self) -> None:
        class Opinionated(CountingApp):
            async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
                await send(
                    {
                        "type": "http.response.start",
                        "status": 200,
                        "headers": [(b"cache-control", b"private"), (b"etag", b'"app"')],
                    }
                )
                await send({"type": "http.response.body", "body": b"x"})

        mw, _, _ = self.cache(Opinionated())
        _, headers, _ = run(call(mw))
        assert headers["cache-control"] == "public, max-age=300" and headers["etag"].startswith(
            'W/"'
        )

    def test_entry_count_and_byte_budgets_evict_the_least_recently_used(self) -> None:
        mw, _inner, _ = self.cache(max_entries=2)
        for q in ("a=1", "a=2"):
            run(call(mw, query=q))
        run(call(mw, query="a=1"))  # touch: a=2 becomes the oldest
        run(call(mw, query="a=3"))  # evicts a=2
        assert run(call(mw, query="a=1"))[1]["x-cache"] == "HIT"
        assert run(call(mw, query="a=2"))[1]["x-cache"] == "MISS"
        small, _, _ = self.cache(max_bytes=len(BODY) * 2)
        for q in ("a=1", "a=2", "a=3"):
            run(call(small, query=q))
        entries, size = small.size
        assert entries == 2 and size <= len(BODY) * 2

    def test_oversized_bodies_are_passed_through_but_not_stored(self) -> None:
        mw, inner, _ = self.cache(CountingApp(body=b"x" * 100), max_entry_bytes=50)
        assert run(call(mw))[1]["x-cache"] == "MISS"
        assert run(call(mw))[1]["x-cache"] == "MISS"
        assert inner.calls == 2 and mw.size == (0, 0)

    def test_browser_caching_can_be_turned_off_while_keeping_revalidation(self) -> None:
        mw, _, _ = self.cache(max_age_seconds=0)
        headers = run(call(mw))[1]
        assert headers["cache-control"] == "no-cache" and "etag" in headers

    def test_a_streamed_body_is_reassembled_into_one_entry(self) -> None:
        class Streaming(CountingApp):
            async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
                self.calls += 1
                await send({"type": "http.response.start", "status": 200, "headers": []})
                for chunk in (b"ab", b"cd", b"ef"):
                    await send({"type": "http.response.body", "body": chunk, "more_body": True})
                await send({"type": "http.response.body", "body": b"", "more_body": False})

        mw, inner, _ = self.cache(Streaming())
        run(call(mw))
        status, _, body = run(call(mw))
        assert (status, body) == (200, b"abcdef") and inner.calls == 1


@pytest.mark.parametrize("value", ["gzip", "GZIP", "deflate, gzip;q=0.5", " br , gzip "])
def test_gzip_detection(value: str) -> None:
    from app.api.middleware import _accepts_gzip

    assert _accepts_gzip(value)


@pytest.mark.parametrize("value", ["", "identity", "br", "x-gzip-not"])
def test_gzip_detection_negative(value: str) -> None:
    from app.api.middleware import _accepts_gzip

    assert not _accepts_gzip(value)
