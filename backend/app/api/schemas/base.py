"""Base model, literals shared by several responses, and the error envelope."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

MatchStatus = Literal["matched", "missing_forecast", "missing_actual", "missing_both"]
Provenance = Literal["elexon_live", "synthetic_dev"]


class ApiModel(BaseModel):
    """Base for every response model.

    ``json_schema_serialization_defaults_required`` makes fields that have defaults (e.g. empty lists,
    ``None``) *required* in the OpenAPI output schema. The API always sends them, and the generated
    TypeScript types are then accurate instead of forcing needless optional-chaining in the UI.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class ErrorBody(ApiModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody
