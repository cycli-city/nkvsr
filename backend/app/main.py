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
from app.api.routes import analysis, system
from app.config import Settings, get_settings
from app.errors import AppError, IngestionError, UpstreamError
from app.services.analysis import AnalysisService
from app.services.ingestion import IngestionService
from app.store.dataset import DataStore

logger = logging.getLogger("windscope")

DESCRIPTION = """
Day-ahead **wind forecast analytics** for GB power procurement (Elexon FUELHH / WINDFOR, national WIND only).

* Every KPI uses the forecast **available at the day-ahead decision cutoff** - never later revisions.
* Signed error is `forecast - actual` (positive = over-forecast).
* Metrics that cannot be defined are `null` ("unavailable"), never zero.
* Wind forecast error is **not** the utility's net procurement requirement.
"""


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
        background: asyncio.Task[Any] | None = None
        if store.maybe_get() is None and settings.auto_ingest_on_start:
            logger.info("No snapshot found; starting background ingestion (AUTO_INGEST_ON_START)")
            background = asyncio.create_task(_safe_ingest(app.state.ingestion))
        yield
        if background and not background.done():
            background.cancel()

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

    app.add_middleware(GZipMiddleware, minimum_size=1024)
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
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
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


async def _safe_ingest(ingestion: IngestionService) -> None:
    try:
        await ingestion.run()
    except Exception as exc:  # already recorded in refresh state; never crash the server
        logger.error("Background ingestion failed: %s", exc)
