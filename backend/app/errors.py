"""Application errors and their mapping to a single, predictable JSON error envelope.

Every non-2xx response has the shape ``{"error": {"code": str, "message": str, "details": object|null}}``.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for errors that map directly to an HTTP response."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, *, details: Any | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class InvalidRequestError(AppError):
    status_code = 422
    code = "invalid_request"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class DataUnavailableError(AppError):
    """No usable dataset is loaded (never ingested, or the snapshot is unusable)."""

    status_code = 503
    code = "data_unavailable"


class AdminDisabledError(AppError):
    status_code = 404
    code = "admin_disabled"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


# --- upstream (Elexon) ---------------------------------------------------------------------------


class UpstreamError(Exception):
    """Base class for failures talking to Elexon (used by ingestion, never by request handlers)."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class UpstreamUnavailableError(UpstreamError):
    """Network failure, timeout, 429 or 5xx persisted after all retries."""


class UpstreamRequestError(UpstreamError):
    """A non-retryable 4xx: our request is wrong (bad parameter name, auth required, ...)."""


class UpstreamSchemaError(UpstreamError):
    """The response does not match the documented contract; refuse to guess."""


class IngestionError(Exception):
    """The ingestion pipeline could not produce a trustworthy snapshot."""
