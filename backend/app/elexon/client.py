"""Async Elexon client: timeouts, bounded concurrency, retry with backoff, windowed chunking.

Only the ingestion pipeline uses this client - API request handlers never call Elexon.

Retry policy
------------
* retried: connect/read timeouts, transport errors, HTTP 408/425/429/500/502/503/504, and 200 responses
  whose body is not valid JSON (truncated transfer). Waits ``Retry-After`` when the server sends it,
  otherwise ``backoff * 2**attempt`` (capped at 30 s) plus up to 25 % jitter.
* not retried: every other 4xx (our request is wrong - surfaced immediately and verbatim).
After the last attempt :class:`UpstreamUnavailableError` is raised; we never return partial data silently.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from types import TracebackType
from typing import Any

import httpx

from app.config import Settings
from app.elexon import endpoints
from app.elexon.contract import check_contract, unwrap_records
from app.errors import UpstreamRequestError, UpstreamUnavailableError

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
MAX_BACKOFF_SECONDS = 30.0

Sleep = Callable[[float], Awaitable[None]]
Jitter = Callable[[], float]


def chunk_dates(first: date, last: date, days: int) -> list[tuple[date, date]]:
    """Split ``first..last`` (inclusive) into consecutive inclusive ranges of at most ``days`` days."""
    if last < first:
        return []
    chunks: list[tuple[date, date]] = []
    cursor = first
    while cursor <= last:
        end = min(cursor + timedelta(days=days - 1), last)
        chunks.append((cursor, end))
        cursor = end + timedelta(days=1)
    return chunks


def chunk_datetimes(start: datetime, end: datetime, days: int) -> list[tuple[datetime, datetime]]:
    """Split ``[start, end]`` into consecutive windows of at most ``days`` days.

    Adjacent windows share their boundary instant on purpose (the upstream ``To`` bound may be
    exclusive); duplicate boundary rows are removed later by key-based de-duplication, a gap would not be.
    """
    if end <= start:
        return []
    windows: list[tuple[datetime, datetime]] = []
    cursor = start
    while cursor < end:
        nxt = min(cursor + timedelta(days=days), end)
        windows.append((cursor, nxt))
        cursor = nxt
    return windows


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    if raw.isdigit():
        return min(float(raw), MAX_BACKOFF_SECONDS)
    try:
        when = parsedate_to_datetime(raw)
        return max(
            0.0, min((when - datetime.now(tz=when.tzinfo)).total_seconds(), MAX_BACKOFF_SECONDS)
        )
    except (TypeError, ValueError):
        return None


class ElexonClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Sleep = asyncio.sleep,
        jitter: Jitter = random.random,
    ) -> None:
        self._settings = settings
        self._sleep = sleep
        self._jitter = jitter
        self._semaphore = asyncio.Semaphore(settings.elexon_concurrency)
        self._http = httpx.AsyncClient(
            base_url=settings.elexon_base_url,
            timeout=httpx.Timeout(
                settings.elexon_timeout_seconds, connect=settings.elexon_connect_timeout_seconds
            ),
            headers={
                "Accept": "application/json",
                "User-Agent": "WindScopeUK/0.1 (hiring-challenge)",
            },
            follow_redirects=True,
            transport=transport,
        )

    async def __aenter__(self) -> ElexonClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------------------------------
    # Low level
    # ------------------------------------------------------------------------------------------

    async def get_records(self, request: endpoints.UpstreamRequest) -> list[dict[str, Any]]:
        """GET one request with retries; returns validated record dictionaries."""
        settings = self._settings
        last_problem = "no attempt made"
        for attempt in range(settings.elexon_max_retries + 1):
            retry_after: float | None = None
            try:
                async with self._semaphore:
                    response = await self._http.get(request.path, params=request.params)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_problem = f"{type(exc).__name__}: {exc}"
            else:
                if response.status_code == 200:
                    try:
                        payload = response.json()
                    except ValueError as exc:
                        last_problem = f"HTTP 200 with invalid JSON ({exc})"
                    else:
                        records = unwrap_records(payload, request.dataset)
                        check_contract(records, request.dataset)
                        return records
                elif response.status_code in RETRYABLE_STATUS:
                    last_problem = f"HTTP {response.status_code}"
                    retry_after = _retry_after_seconds(response)
                else:
                    raise UpstreamRequestError(
                        f"{request.label}: HTTP {response.status_code}: {response.text[:300]}",
                        status_code=response.status_code,
                    )

            if attempt == settings.elexon_max_retries:
                break
            delay = retry_after
            if delay is None:
                delay = min(settings.elexon_backoff_seconds * 2**attempt, MAX_BACKOFF_SECONDS)
                delay += delay * 0.25 * self._jitter()
            logger.warning(
                "Elexon %s failed (%s); retry %d in %.1fs",
                request.dataset,
                last_problem,
                attempt + 1,
                delay,
            )
            await self._sleep(delay)

        raise UpstreamUnavailableError(
            f"{request.label}: giving up after {settings.elexon_max_retries + 1} attempts ({last_problem})"
        )

    # ------------------------------------------------------------------------------------------
    # Dataset level (chunked)
    # ------------------------------------------------------------------------------------------

    async def fetch_actuals(self, first: date, last: date) -> list[dict[str, Any]]:
        """FUELHH WIND records for settlement dates ``first..last`` inclusive."""
        chunks = chunk_dates(first, last, self._settings.elexon_actuals_chunk_days)
        requests = [endpoints.fuelhh_wind_request(a, b) for a, b in chunks]
        return await self._gather(requests)

    async def fetch_forecasts(
        self, publish_from: datetime, publish_to: datetime
    ) -> list[dict[str, Any]]:
        """WINDFOR records published within ``[publish_from, publish_to]`` (timezone-aware datetimes)."""
        windows = chunk_datetimes(
            publish_from, publish_to, self._settings.elexon_forecast_chunk_days
        )
        requests = [endpoints.windfor_request(a, b) for a, b in windows]
        return await self._gather(requests)

    async def _gather(self, requests: list[endpoints.UpstreamRequest]) -> list[dict[str, Any]]:
        """Fetch all requests concurrently (bounded by the semaphore); any failure aborts the rest.

        A partial dataset would silently understate coverage, so the first failure is re-raised as is.
        """
        pages: list[list[dict[str, Any]]] = [[] for _ in requests]

        async def run(index: int, request: endpoints.UpstreamRequest) -> None:
            pages[index] = await self.get_records(request)

        try:
            async with asyncio.TaskGroup() as group:
                for index, request in enumerate(requests):
                    group.create_task(run(index, request))
        except ExceptionGroup as failure:
            raise failure.exceptions[0] from None
        return [record for page in pages for record in page]
