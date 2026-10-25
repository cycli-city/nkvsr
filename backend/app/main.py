"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.middleware import RateLimitMiddleware, ResponseCacheMiddleware
from app.api.routes import analysis, system
from app.config import Settings, get_settings
from app.errors import AppError, IngestionError, UpstreamError
from app.services.analysis import AnalysisService
from app.services.ingestion import IngestionService
from app.services.prewarm import prewarm
from app.store.dataset import DataStore

logger = logging.getLogger("windscope")

DESCRIPTION = """
Day-ahead **wind forecast analytics** for GB power procurement (Elexon FUELHH / WINDFOR, national WIND only).

* Every KPI uses the forecast **available at the day-ahead decision cutoff** - never later revisions.
* Signed error is `forecast - actual` (positive = over-forecast).
* Metrics that cannot be defined are `null` ("unavailable"), never zero.
* Wind forecast error is **not** the utility's net procurement requirement.
"""


# Endpoints whose body is a pure function of (snapshot, query string): safe to cache and to answer with 304.
CACHEABLE_PATHS = (
    "/api/summary",
    "/api/timeseries",
    "/api/accuracy",
    "/api/intervals",
    "/api/intervals/export",
    "/api/forecast-vintages",
    "/api/decision-brief",
    "/api/cutoff-sensitivity",
)

# Defence in depth for a JSON API: nothing it returns should ever be rendered, framed or sniffed.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_PATH = "/api/docs"  # Swagger UI is HTML that loads scripts from a CDN, so it is exempt from the strict CSP
HSTS = "max-age=31536000"


def _envelope(code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store: DataStore = app.state.store
        store.load_from_disk()
        background: list[asyncio.Task[Any]] = []
        if store.maybe_get() is None and settings.auto_ingest_on_start:
            logger.info("No snapshot found; starting background ingestion (AUTO_INGEST_ON_START)")
            background.append(asyncio.create_task(_safe_ingest(app.state.ingestion)))
        elif store.maybe_get() is not None and settings.prewarm_on_start:
            background.append(asyncio.create_task(_safe_prewarm(app)))
        yield
        for task in background:
            if not task.done():
                task.cancel()

    app = FastAPI(
        title="WindScope UK API",
        version=__version__,
        description=DESCRIPTION,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    store = DataStore(settings)
    app.state.settings = settings
    app.state.store = store
    app.state.service = AnalysisService(store, settings)
    app.state.ingestion = IngestionService(settings, store)

    # Starlette puts the LAST added middleware OUTERMOST. Request path: access log -> CORS -> rate limit ->
    # response cache -> gzip -> routes. CORS wraps the limiter and the cache so that 429, 304 and cached
    # responses all carry the right Access-Control-* headers for the asking origin (the cache never stores them).
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        ResponseCacheMiddleware,
        version=app.state.service.cache_version,
        paths=CACHEABLE_PATHS,
        max_age_seconds=settings.browser_cache_seconds,
    )
    app.add_middleware(RateLimitMiddleware, per_minute=settings.rate_limit_per_minute)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Admin-Token"],
        allow_credentials=False,
        max_age=600,
    )

    @app.middleware("http")
    async def access_log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path != DOCS_PATH:
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        if request.headers.get("x-forwarded-proto", request.url.scheme) == "https":
            response.headers.setdefault("Strict-Transport-Security", HSTS)
        logger.info(
            "%s %s -> %d (%.0f ms)",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=_envelope(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(UpstreamError)
    async def handle_upstream(_: Request, exc: UpstreamError) -> JSONResponse:
        return JSONResponse(status_code=502, content=_envelope("upstream_error", exc.message))

    @app.exception_handler(IngestionError)
    async def handle_ingestion(_: Request, exc: IngestionError) -> JSONResponse:
        return JSONResponse(status_code=502, content=_envelope("ingestion_failed", str(exc)))

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        problems = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "query"), "message": e["msg"]}
            for e in exc.errors()
        ]
        summary = "; ".join(f"{p['field']}: {p['message']}" for p in problems) or "Invalid request"
        return JSONResponse(
            status_code=422, content=_envelope("invalid_request", summary, problems)
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(status_code=exc.status_code, content=_envelope(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error")
        return JSONResponse(
            status_code=500, content=_envelope("internal_error", "An unexpected error occurred.")
        )

    app.include_router(system.router)
    app.include_router(analysis.router)
    return app


async def _safe_prewarm(app: FastAPI) -> None:
    try:
        await prewarm(app)
    except Exception as exc:  # an optimisation only; never let it affect start-up
        logger.warning("Pre-warm failed: %s", exc)


async def _safe_ingest(ingestion: IngestionService) -> None:
    try:
        await ingestion.run()
    except Exception as exc:  # already recorded in refresh state; never crash the server
        logger.error("Background ingestion failed: %s", exc)
