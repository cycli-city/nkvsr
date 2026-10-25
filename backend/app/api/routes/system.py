"""Health, metadata and the optional (token-guarded) refresh endpoint."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app import __version__
from app.api import schemas as s
from app.api.deps import get_ingestion, get_service, get_settings_dep, get_store
from app.config import Settings
from app.errors import AdminDisabledError, UnauthorizedError
from app.services.analysis import AnalysisService
from app.services.ingestion import IngestionService
from app.store.dataset import DataStore

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health", response_model=s.HealthResponse, summary="Liveness probe")
def health(store: Annotated[DataStore, Depends(get_store)]) -> s.HealthResponse:
    """Always 200 while the process is up; `data_loaded` says whether a snapshot is being served."""
    return s.HealthResponse(version=__version__, data_loaded=store.maybe_get() is not None)


@router.get(
    "/metadata", response_model=s.MetadataResponse, summary="Provenance, windows and assumptions"
)
def metadata(service: Annotated[AnalysisService, Depends(get_service)]) -> s.MetadataResponse:
    """Everything the UI needs to describe its data honestly: source, retrieval time, refresh outcome,
    permitted date windows, cutoff presets, data-quality report and thresholds. Works with no dataset loaded."""
    return service.metadata()


@router.post(
    "/admin/refresh",
    response_model=s.RefreshResponse,
    responses={
        401: {"model": s.ErrorResponse},
        404: {"model": s.ErrorResponse},
        502: {"model": s.ErrorResponse},
    },
    summary="Re-ingest from Elexon (disabled unless ADMIN_TOKEN is set)",
    tags=["admin"],
)
async def refresh(
    settings: Annotated[Settings, Depends(get_settings_dep)],
    ingestion: Annotated[IngestionService, Depends(get_ingestion)],
    x_admin_token: Annotated[str | None, Header()] = None,
) -> s.RefreshResponse:
    """Runs a full ingestion. On failure the previous snapshot keeps being served and the failure is
    recorded in `/api/metadata`."""
    if not settings.admin_token:
        raise AdminDisabledError(
            "The refresh endpoint is disabled (ADMIN_TOKEN is not configured)."
        )
    if not x_admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise UnauthorizedError("Missing or invalid X-Admin-Token header.")
    manifest = await ingestion.run()
    return s.RefreshResponse(
        status="ok",
        retrieved_at=manifest.retrieved_at,
        actuals_rows=manifest.actuals_rows,
        forecasts_rows=manifest.forecasts_rows,
        warnings=manifest.warnings,
    )
