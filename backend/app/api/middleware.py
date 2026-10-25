"""Small, dependency-free ASGI middleware: per-client rate limiting and a snapshot-keyed response cache.

Why these exist
---------------
Every analytics response is a **pure function of (snapshot, request)**: the snapshot only changes on a
deliberate refresh. That makes two things safe and valuable on a small free-tier host:

* ``ResponseCacheMiddleware`` keeps the *rendered* (compressed) JSON, so repeat requests skip pandas, Pydantic and
  gzip entirely, and answers ``If-None-Match`` with ``304`` without computing anything.
* ``RateLimitMiddleware`` bounds how much CPU one client can take from everyone else.

Both are pure ASGI (no ``BaseHTTPMiddleware``), so they add no body buffering or per-request task overhead, and
both are placed *inside* the CORS middleware in ``main.py`` so that 429/304/cached responses still carry the
correct CORS headers for the requesting origin (the cache never stores CORS headers).
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

Headers = list[tuple[bytes, bytes]]

MAX_KEY_LENGTH = 64  # client keys come from request headers: bound the memory one request can pin


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return str(value.decode("latin-1"))
    return ""


def client_key(scope: Scope) -> str:
    """Best-effort client identity: first ``X-Forwarded-For`` hop, else the socket peer.

    Trade-off (documented in docs/03-ARCHITECTURE.md): a client can spoof this header to evade *its own* limit, but cannot
    use it to consume anyone else's budget; trusting only the right-most hop would instead make every user share the
    proxy's bucket if the platform adds more than one proxy. Network-level abuse is the edge's job (Render sits behind
    Cloudflare); this limiter protects the application's CPU from a single noisy client.
    """
    forwarded = _header(scope, b"x-forwarded-for").split(",")[0].strip()
    if forwarded:
        return forwarded[:MAX_KEY_LENGTH]
    client = scope.get("client")
    return str(client[0])[:MAX_KEY_LENGTH] if client else "unknown"


def _json_error(code: str, message: str) -> bytes:
    return json.dumps({"error": {"code": code, "message": message, "details": None}}).encode()


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
        body = _json_error("rate_limited", "Too many requests. Please slow down and retry shortly.")
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


@dataclass(frozen=True)
class _Entry:
    status: int
    headers: Headers
    body: bytes


def _accepts_gzip(value: str) -> bool:
    return any(token.split(";")[0].strip().lower() == "gzip" for token in value.split(","))


def _etag_matches(header_value: str, etag: str) -> bool:
    """RFC 9110 weak comparison of an ``If-None-Match`` list against our (weak) ETag."""
    wanted = etag.removeprefix("W/")
    return any(
        candidate.strip() == "*" or candidate.strip().removeprefix("W/") == wanted
        for candidate in header_value.split(",")
    )


class ResponseCacheMiddleware:
    """Cache successful ``GET`` responses of pure endpoints, keyed by (snapshot version, path, query, gzip).

    * ``version`` returns an opaque string identifying the snapshot *and* the settings that shape results, or
      ``None`` when no dataset is loaded (nothing is cached or short-circuited then).
    * Only HTTP 200 responses are stored; everything else is marked ``no-store``.
    * The ETag is derived from the key, not the bytes: the content is a pure function of it, so a matching
      ``If-None-Match`` is answered with ``304`` *without running the endpoint*.
    * Memory is bounded by both entry count and total bytes (least-recently-used eviction).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        version: Callable[[], str | None],
        paths: Iterable[str],
        max_age_seconds: int = 300,
        max_entries: int = 256,
        max_bytes: int = 32 * 1024 * 1024,
        max_entry_bytes: int = 4 * 1024 * 1024,
    ) -> None:
        self.app = app
        self.version = version
        self.paths = frozenset(paths)
        self.cache_control = (
            f"public, max-age={max_age_seconds}".encode() if max_age_seconds > 0 else b"no-cache"
        )
        self.max_entries = max_entries
        self.max_bytes = max_bytes
        self.max_entry_bytes = max_entry_bytes
        self._entries: OrderedDict[tuple[str, str, str, bool], _Entry] = OrderedDict()
        self._bytes = 0
        self.hits = 0
        self.misses = 0

    # --- storage ---------------------------------------------------------------------------------

    def _get(self, key: tuple[str, str, str, bool]) -> _Entry | None:
        entry = self._entries.get(key)
        if entry is not None:
            self._entries.move_to_end(key)
        return entry

    def _put(self, key: tuple[str, str, str, bool], entry: _Entry) -> None:
        if len(entry.body) > self.max_entry_bytes:
            return
        old = self._entries.pop(key, None)
        if old is not None:
            self._bytes -= len(old.body)
        self._entries[key] = entry
        self._bytes += len(entry.body)
        while self._entries and (
            len(self._entries) > self.max_entries or self._bytes > self.max_bytes
        ):
            _, evicted = self._entries.popitem(last=False)
            self._bytes -= len(evicted.body)

    @property
    def size(self) -> tuple[int, int]:
        """(entries, bytes) currently held."""
        return len(self._entries), self._bytes

    # --- ASGI ------------------------------------------------------------------------------------

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "GET" or scope["path"] not in self.paths:
            await self.app(scope, receive, send)
            return
        version = self.version()
        if version is None:
            await self.app(scope, receive, send)
            return

        query = urlencode(
            sorted(
                parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
            )
        )
        digest = hashlib.sha256(f"{version}\n{scope['path']}\n{query}".encode()).hexdigest()
        etag = f'W/"{digest[:32]}"'
        etag_headers: Headers = [(b"etag", etag.encode()), (b"cache-control", self.cache_control)]

        presented = _header(scope, b"if-none-match")
        if presented and _etag_matches(presented, etag):
            self.hits += 1
            await send(
                {
                    "type": "http.response.start",
                    "status": 304,
                    "headers": [
                        *etag_headers,
                        (b"vary", b"Accept-Encoding"),
                        (b"x-cache", b"HIT-304"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": b""})
            return

        key = (version, scope["path"], query, _accepts_gzip(_header(scope, b"accept-encoding")))
        entry = self._get(key)
        if entry is not None:
            self.hits += 1
            await send(
                {
                    "type": "http.response.start",
                    "status": entry.status,
                    "headers": [*entry.headers, (b"x-cache", b"HIT")],
                }
            )
            await send({"type": "http.response.body", "body": entry.body})
            return

        self.misses += 1
        status = 0
        stored_headers: Headers = []
        chunks: list[bytes] = []
        size = 0

        async def capture(message: Message) -> None:
            nonlocal status, stored_headers, size
            if message["type"] == "http.response.start":
                status = int(message["status"])
                headers: Headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() not in (b"etag", b"cache-control")
                ]
                headers += etag_headers if status == 200 else [(b"cache-control", b"no-store")]
                stored_headers = list(headers)
                message = {**message, "headers": [*headers, (b"x-cache", b"MISS")]}
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                size += len(body)
                if status == 200 and size <= self.max_entry_bytes:
                    chunks.append(body)
                if (
                    not message.get("more_body", False)
                    and status == 200
                    and size <= self.max_entry_bytes
                ):
                    self._put(key, _Entry(status, stored_headers, b"".join(chunks)))
            await send(message)

        await self.app(scope, receive, capture)
