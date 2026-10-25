"""Everything this application assumes about the Elexon Insights (BMRS) API, in one place.

STATUS: the host ``data.elexon.co.uk`` could not be reached from the authoring environment, so the
request shapes below follow Elexon's published documentation as far as it could be read second-hand and
are marked **UNVERIFIED** in ``docs/04-DATA-SOURCE-VERIFICATION.md`` until ``python -m app.cli
verify-upstream`` has been run against the live service. If verification disagrees, this module and
``contract.py`` are the only files that should need to change.

Datasets (names given by the assignment brief):

* ``FUELHH``  - half-hourly generation outturn by fuel type. We request ``fuelType=WIND`` and filter again
  client-side. Used fields: ``startTime``, ``generation``, ``fuelType`` (+ ``publishTime`` if present).
* ``WINDFOR`` - wind generation forecasts. Used fields: ``startTime`` (delivery), ``publishTime``
  (when the forecast was created) and ``generation``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Final

FUELHH: Final = "FUELHH"
WINDFOR: Final = "WINDFOR"
WIND_FUEL_TYPE: Final = "WIND"
UNIT: Final = "MW"  # UNVERIFIED for WINDFOR; FUELHH is documented as half-hourly average MW.

# Documentation / provenance links shown in the UI and README.
DOC_LINKS: Final = {
    FUELHH: "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
    WINDFOR: "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
}
ATTRIBUTION: Final = "Contains BMRS data © Elexon Limited copyright and database right"


@dataclass(frozen=True, slots=True)
class UpstreamRequest:
    dataset: str
    path: str
    params: dict[str, str]

    @property
    def label(self) -> str:
        return f"{self.dataset} {self.params}"


def _utc_iso_minute(value: datetime) -> str:
    """UTC ISO-8601 to the minute with a trailing Z, e.g. ``2026-01-01T00:00Z``."""
    if value.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%MZ")


def fuelhh_wind_request(settlement_date_from: date, settlement_date_to: date) -> UpstreamRequest:
    return UpstreamRequest(
        dataset=FUELHH,
        path=f"/datasets/{FUELHH}/stream",
        params={
            "settlementDateFrom": settlement_date_from.isoformat(),
            "settlementDateTo": settlement_date_to.isoformat(),
            "fuelType": WIND_FUEL_TYPE,
        },
    )


def windfor_request(publish_from_utc: datetime, publish_to_utc: datetime) -> UpstreamRequest:
    return UpstreamRequest(
        dataset=WINDFOR,
        path=f"/datasets/{WINDFOR}/stream",
        params={
            "publishDateTimeFrom": _utc_iso_minute(publish_from_utc),
            "publishDateTimeTo": _utc_iso_minute(publish_to_utc),
        },
    )
