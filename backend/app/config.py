"""Environment-driven configuration (12-factor). See ``.env.example`` for every variable."""

from __future__ import annotations

from datetime import time
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.domain.timeutil import parse_hhmm
from app.domain.windows import Basis, parse_month

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- runtime -----------------------------------------------------------------------------
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:8080",
    ]

    # --- data location -----------------------------------------------------------------------
    data_dir: Path = REPO_ROOT / "data"
    snapshot_name: str = "current"

    # --- analysis semantics --------------------------------------------------------------------
    analysis_month: str = "2026-01"  # the month of purchase decisions under analysis
    default_basis: Basis = Basis.DECISION_DATE
    decision_cutoff_local: str = (
        "09:20"  # Europe/London on D-1 (earliest GB day-ahead gate closure)
    )
    max_range_days: int = Field(default=62, ge=1, le=366)
    coverage_sufficient: float = Field(default=0.98, ge=0, le=1)
    coverage_partial: float = Field(default=0.90, ge=0, le=1)
    stale_forecast_hours: float = Field(default=36.0, gt=0)

    # --- Elexon upstream ---------------------------------------------------------------------
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_seconds: float = Field(default=60.0, gt=0)
    elexon_connect_timeout_seconds: float = Field(default=10.0, gt=0)
    elexon_max_retries: int = Field(default=4, ge=0, le=10)
    elexon_backoff_seconds: float = Field(default=1.0, ge=0)
    elexon_concurrency: int = Field(default=3, ge=1, le=10)
    elexon_actuals_chunk_days: int = Field(default=7, ge=1, le=31)
    elexon_forecast_chunk_days: int = Field(default=2, ge=1, le=14)
    forecast_lookback_days: int = Field(
        default=4, ge=0, le=21
    )  # publications before first delivery day
    actuals_lookback_days: int = Field(default=10, ge=0, le=31)  # history needed by the baselines

    # --- operations --------------------------------------------------------------------------
    auto_ingest_on_start: bool = False  # ingest in the background when no snapshot exists
    admin_token: str | None = None  # enables POST /api/admin/refresh when set

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("admin_token")
    @classmethod
    def _validate_admin_token(cls, value: str | None) -> str | None:
        """Empty means disabled; anything else must be long enough not to be guessable."""
        if value is None or value.strip() == "":
            return None
        if len(value.strip()) < 16:
            raise ValueError(
                "ADMIN_TOKEN must be at least 16 characters (or empty to disable the endpoint)"
            )
        return value.strip()

    @field_validator("decision_cutoff_local")
    @classmethod
    def _validate_cutoff(cls, value: str) -> str:
        parse_hhmm(value)
        return value

    @field_validator("analysis_month")
    @classmethod
    def _validate_month(cls, value: str) -> str:
        parse_month(value)
        return value

    @property
    def cutoff_time(self) -> time:
        return parse_hhmm(self.decision_cutoff_local)

    @property
    def snapshot_dir(self) -> Path:
        return self.data_dir / "snapshots" / self.snapshot_name

    @property
    def refresh_state_path(self) -> Path:
        return self.data_dir / "snapshots" / "refresh_state.json"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
