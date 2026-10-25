"""FastAPI dependencies shared by the routers."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import Depends, Query, Request

from app.config import Settings
from app.domain.windows import Basis
from app.services.analysis import AnalysisService, Ctx
from app.services.ingestion import IngestionService
from app.store.dataset import DataStore

CUTOFF_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_store(request: Request) -> DataStore:
    store: DataStore = request.app.state.store
    return store


def get_service(request: Request) -> AnalysisService:
    service: AnalysisService = request.app.state.service
    return service


def get_ingestion(request: Request) -> IngestionService:
    ingestion: IngestionService = request.app.state.ingestion
    return ingestion


CutoffParam = Annotated[
    str | None,
    Query(
        pattern=CUTOFF_PATTERN,
        description="Decision cutoff as 24h HH:MM Europe/London on the day before delivery. Defaults to the configured value (09:20).",
        examples=["09:20"],
    ),
]


def get_ctx(
    service: Annotated[AnalysisService, Depends(get_service)],
    basis: Annotated[
        Basis | None,
        Query(
            description="How 'January' is interpreted. `decision_date` (default) or `delivery_date`."
        ),
    ] = None,
    date_from: Annotated[
        date | None,
        Query(alias="from", description="First date (inclusive), in the date type of `basis`."),
    ] = None,
    date_to: Annotated[
        date | None,
        Query(alias="to", description="Last date (inclusive), in the date type of `basis`."),
    ] = None,
    cutoff: CutoffParam = None,
) -> Ctx:
    return service.context(basis, date_from, date_to, cutoff)


AnalysisCtx = Annotated[Ctx, Depends(get_ctx)]
