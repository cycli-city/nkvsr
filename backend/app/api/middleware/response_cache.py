"""Snapshot-keyed response cache with weak ETags and ``304`` answers (pure ASGI)."""

from __future__ import annotations

import hashlib
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .shared import Headers, header


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

        presented = header(scope, b"if-none-match")
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

        key = (version, scope["path"], query, _accepts_gzip(header(scope, b"accept-encoding")))
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
