"""Per-client token-bucket rate limiter, in isolation (burst, refill, per-client budgets, exemptions, key bounds)."""

import json
from typing import Any

from starlette.types import Scope

from app.api.middleware import RateLimitMiddleware, client_key

from .asgi_helpers import Clock, CountingApp, call, run


class TestRateLimit:
    def limiter(self, **kw: Any) -> tuple[RateLimitMiddleware, CountingApp, Clock]:
        clock = Clock()
        inner = CountingApp()
        mw = RateLimitMiddleware(inner, clock=clock, **{"per_minute": 60, "burst": 3, **kw})
        return mw, inner, clock

    def test_allows_a_burst_then_answers_429_with_a_json_envelope_and_retry_after(self) -> None:
        mw, inner, _ = self.limiter()
        codes = [run(call(mw))[0] for _ in range(5)]
        assert codes == [200, 200, 200, 429, 429]
        status, headers, body = run(call(mw))
        assert status == 429
        assert int(headers["retry-after"]) >= 1
        assert headers["cache-control"] == "no-store"
        assert json.loads(body)["error"]["code"] == "rate_limited"
        assert inner.calls == 3  # the application never ran for rejected requests

    def test_tokens_refill_over_time(self) -> None:
        mw, _, clock = self.limiter()  # 60 per minute = 1 token per second
        for _ in range(3):
            run(call(mw))
        assert run(call(mw))[0] == 429
        clock.now += 1.0
        assert run(call(mw))[0] == 200
        assert run(call(mw))[0] == 429

    def test_clients_have_separate_budgets(self) -> None:
        mw, _, _ = self.limiter()
        for _ in range(3):
            assert run(call(mw, headers={"X-Forwarded-For": "203.0.113.5"}))[0] == 200
        assert run(call(mw, headers={"X-Forwarded-For": "203.0.113.5"}))[0] == 429
        assert run(call(mw, headers={"X-Forwarded-For": "203.0.113.6"}))[0] == 200

    def test_the_first_forwarded_hop_identifies_the_client(self) -> None:
        scope: Scope = {
            "type": "http",
            "headers": [(b"x-forwarded-for", b" 198.51.100.7 , 10.1.1.1")],
            "client": ("10.9.9.9", 1),
        }
        assert client_key(scope) == "198.51.100.7"
        assert (
            client_key({"type": "http", "headers": [], "client": ("192.0.2.1", 1)}) == "192.0.2.1"
        )
        assert client_key({"type": "http", "headers": [], "client": None}) == "unknown"

    def test_health_checks_and_preflights_are_never_limited(self) -> None:
        mw, _, _ = self.limiter(burst=1)
        run(call(mw))  # spends the only token
        assert [run(call(mw, "/api/health"))[0] for _ in range(5)] == [200] * 5
        assert [run(call(mw, method="OPTIONS"))[0] for _ in range(5)] == [200] * 5

    def test_zero_disables_the_limiter(self) -> None:
        mw, inner, _ = self.limiter(per_minute=0)
        assert [run(call(mw))[0] for _ in range(50)] == [200] * 50
        assert inner.calls == 50

    def test_memory_is_bounded_and_oversized_keys_are_truncated(self) -> None:
        mw, _, _ = self.limiter(max_clients=3)
        for i in range(10):
            run(call(mw, headers={"X-Forwarded-For": f"198.51.100.{i}"}))
        assert len(mw._buckets) == 3
        long_ip = "9" * 5000
        assert (
            len(client_key({"type": "http", "headers": [(b"x-forwarded-for", long_ip.encode())]}))
            <= 64
        )


# --- response cache ----------------------------------------------------------------------------------------------
