"""Compute the default dashboard views once, in the background, right after start-up.

On a small free-tier host the first request for each view costs a full pandas pass (about 1.7 s measured on
Render's free plan versus ~0.3 s once cached). Pre-warming moves that cost to boot time so the first visitor
gets the cached answer. It goes through the real ASGI stack (so the response cache, rate limiter and CORS
logic are exercised exactly as for a browser) and it is strictly best-effort: any failure is logged and ignored.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import httpx
from fastapi import FastAPI

from app.api import schemas as s

logger = logging.getLogger(__name__)

DASHBOARD_PATHS = ("/api/summary", "/api/timeseries", "/api/accuracy", "/api/cutoff-sensitivity")


def dashboard_requests(meta: s.MetadataResponse) -> list[tuple[str, dict[str, str]]]:
    """The requests the dashboard makes on first load, for each interpretation (mirrors ``frontend/src/api/client.ts``)."""
    requests: list[tuple[str, dict[str, str]]] = []
    for basis in meta.bases:
        params = {
            "basis": basis.id.value,
            "from": basis.default_from.isoformat(),
            "to": basis.default_to.isoformat(),
            "cutoff": meta.default_cutoff,
        }
        requests.extend((path, params) for path in DASHBOARD_PATHS)
        # The decision brief shows the last decision date of the range (the day before, for the delivery reading).
        last = (
            basis.default_to
            if basis.date_type == "decision"
            else basis.default_to - timedelta(days=1)
        )
        requests.append(
            (
                "/api/decision-brief",
                {"decision_date": last.isoformat(), "cutoff": meta.default_cutoff},
            )
        )
    return requests


async def prewarm(app: FastAPI) -> int:
    """Issue the dashboard's first-load requests against ``app``; returns how many succeeded."""
    meta = app.state.service.metadata()
    if not meta.data_available:
        return 0
    ok = 0
    transport = httpx.ASGITransport(app=app)
    headers = {"Accept-Encoding": "gzip"}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://prewarm.invalid", headers=headers, timeout=120.0
    ) as client:
        for path, params in dashboard_requests(meta):
            try:
                response: Any = await client.get(path, params=params)
                ok += int(response.status_code == 200)
            except Exception as exc:  # best-effort by design
                logger.warning("Pre-warm of %s failed: %s", path, exc)
    logger.info("Pre-warmed %d dashboard views", ok)
    return ok
