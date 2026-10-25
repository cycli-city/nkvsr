"""Response-contract checks: fail loudly if Elexon's payload is not what we expect.

The brief names the fields we depend on; anything else Elexon returns is ignored. We never guess
alternative field names - a mismatch raises :class:`UpstreamSchemaError` so it is visible in the UI
and logs rather than silently producing an empty or wrong analysis.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Final

from app.elexon.endpoints import FUELHH, WINDFOR
from app.errors import UpstreamSchemaError

REQUIRED_FIELDS: Final[dict[str, tuple[str, ...]]] = {
    FUELHH: ("startTime", "generation", "fuelType"),
    WINDFOR: ("startTime", "publishTime", "generation"),
}

# How many leading records are inspected for the structural check (the rest are validated row-wise).
SAMPLE_SIZE: Final = 50


def unwrap_records(payload: Any, dataset: str) -> list[dict[str, Any]]:
    """Accept a bare JSON array (stream endpoints) or ``{"data": [...]}`` (non-stream endpoints)."""
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, Mapping) and isinstance(payload.get("data"), list):
        records = payload["data"]
    else:
        kind = type(payload).__name__
        keys = sorted(payload.keys())[:10] if isinstance(payload, Mapping) else None
        raise UpstreamSchemaError(
            f"{dataset}: expected a JSON array or an object with a 'data' array, got {kind}"
            + (f" with keys {keys}" if keys else "")
        )
    if not all(isinstance(r, Mapping) for r in records[:SAMPLE_SIZE]):
        raise UpstreamSchemaError(f"{dataset}: response array does not contain JSON objects")
    return records


def check_contract(records: Sequence[Mapping[str, Any]], dataset: str) -> None:
    """Raise if the leading records lack any required field (empty input is *not* a schema error)."""
    required = REQUIRED_FIELDS[dataset]
    for index, record in enumerate(records[:SAMPLE_SIZE]):
        missing = [name for name in required if name not in record]
        if missing:
            raise UpstreamSchemaError(
                f"{dataset}: record #{index} is missing required field(s) {missing}; "
                f"fields present: {sorted(record.keys())}. "
                "Update app/elexon/endpoints.py + contract.py after running `verify-upstream`."
            )
