"""Per-client token-bucket rate limiting (pure ASGI)."""

from __future__ import annotations

import math
import time
from collections import OrderedDict
from collections.abc import Callable, Iterable

from starlette.types import ASGIApp, Receive, Scope, Send

from .shared import client_key, json_error


class RateLimitMiddleware:
    """Token bucket per client. ``per_minute <= 0`` disables it. Health checks and CORS preflights are exempt."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        per_minute: int,
        burst: int | None = None,
        exempt_paths: Iterable[str] = ("/api/health",),
        max_clients: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.rate = max(per_minute, 0) / 60.0  # tokens per second
        self.capacity = float(burst if burst is not None else max(10, per_minute // 5))
        self.exempt = frozenset(exempt_paths)
        self.max_clients = max_clients
        self.clock = clock
        self._buckets: OrderedDict[str, tuple[float, float]] = (
            OrderedDict()
        )  # key -> (tokens, last_seen)

    def _take(self, key: str) -> tuple[bool, float]:
        """Consume one token. Returns (allowed, seconds until a token is available)."""
        now = self.clock()
        tokens, last = self._buckets.pop(key, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - last) * self.rate)
        allowed = tokens >= 1.0
        if allowed:
            tokens -= 1.0
        self._buckets[key] = (
            tokens,
            now,
        )  # re-insert last: the OrderedDict stays ordered by recency
        while len(self._buckets) > self.max_clients:
            self._buckets.popitem(last=False)
        return allowed, 0.0 if allowed else (1.0 - tokens) / self.rate

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or self.rate <= 0
            or scope["method"] == "OPTIONS"
            or scope["path"] in self.exempt
        ):
            await self.app(scope, receive, send)
            return
        allowed, wait = self._take(client_key(scope))
        if allowed:
            await self.app(scope, receive, send)
            return
        body = json_error("rate_limited", "Too many requests. Please slow down and retry shortly.")
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(max(1, math.ceil(wait))).encode()),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
