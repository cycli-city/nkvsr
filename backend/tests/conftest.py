"""Shared fixtures.

``exact`` datasets are built so every metric has a closed-form expected value:

* actual generation is a constant 1000 MW,
* for every delivery interval three publications exist -
  ``cutoff - 6 h`` = 1200 MW, ``cutoff - 10 min`` = 1100 MW (**eligible, latest**), and
  ``cutoff + 30 min`` = 1010 MW (published *after* the cutoff, hindsight only).

So decision-time error is exactly +100 MW everywhere (MAE = RMSE = bias = 100, WAPE = 0.1) while a
(wrong) use of the latest revision would give +10 MW. They are test fixtures, not Elexon observations.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.domain import timeutil as tu
from app.main import create_app
from app.store.snapshot import DatasetSource, Manifest, utcnow, write_snapshot

ACTUAL_MW = 1000.0
ELIGIBLE_MW = 1100.0
OLD_MW = 1200.0
POST_CUTOFF_MW = 1010.0
CUTOFF = time(9, 20)


def make_settings(tmp_path: Path, **overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "app_env": "test",
        "data_dir": tmp_path,
        "cors_origins": ["http://localhost:5173"],
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def exact_frames(
    *, drop_actual_every: int | None = None, drop_forecast_every: int | None = None
) -> tuple[pd.DataFrame, pd.DataFrame]:
    actual_starts = tu.delivery_range_intervals(date(2025, 12, 20), date(2026, 2, 2))
    actuals = pd.DataFrame(
        {
            "start_utc": actual_starts,
            "actual_mw": ACTUAL_MW,
            "actual_publish_utc": actual_starts + pd.Timedelta(minutes=40),
        }
    )
    if drop_actual_every:
        actuals = actuals[np.arange(len(actuals)) % drop_actual_every != 0].reset_index(drop=True)

    targets = tu.delivery_range_intervals(date(2026, 1, 1), date(2026, 2, 1))
    days = tu.local_date_of(pd.Series(targets)).to_numpy()
    cutoffs = tu.as_utc_ns(pd.Series([tu.cutoff_utc_for_delivery_date(d, CUTOFF) for d in days]))
    pieces = []
    for offset, value in (
        (-pd.Timedelta(hours=6), OLD_MW),
        (-pd.Timedelta(minutes=10), ELIGIBLE_MW),
        (pd.Timedelta(minutes=30), POST_CUTOFF_MW),
    ):
        pieces.append(
            pd.DataFrame(
                {
                    "start_utc": pd.Series(targets).to_numpy(),
                    "publish_utc": (cutoffs + offset).to_numpy(),
                    "forecast_mw": value,
                }
            )
        )
    forecasts = pd.concat(pieces, ignore_index=True)
    forecasts["start_utc"] = tu.as_utc_ns(forecasts["start_utc"])
    forecasts["publish_utc"] = tu.as_utc_ns(forecasts["publish_utc"])
    if drop_forecast_every:
        forecasts = forecasts[np.arange(len(forecasts)) % drop_forecast_every != 0].reset_index(
            drop=True
        )
    return actuals, forecasts


def manifest_for(settings: Settings, provenance: str = "elexon_live") -> Manifest:
    return Manifest(
        provenance=provenance,  # type: ignore[arg-type]
        source_name="TEST FIXTURE",
        base_url="https://example.invalid",
        datasets=[
            DatasetSource(
                code="FUELHH", endpoint="x", documentation_url="https://example.invalid/f"
            ),
            DatasetSource(
                code="WINDFOR", endpoint="x", documentation_url="https://example.invalid/w"
            ),
        ],
        retrieved_at=utcnow(),
        analysis_month=settings.analysis_month,
        delivery_coverage_from=date(2026, 1, 1),
        delivery_coverage_to=date(2026, 2, 1),
        actuals_rows=0,
        forecasts_rows=0,
    )


def write_exact_snapshot(
    settings: Settings, *, provenance: str = "elexon_live", **gaps: int | None
) -> None:
    actuals, forecasts = exact_frames(**gaps)
    write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest_for(settings, provenance))


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def exact_client(settings: Settings) -> Iterator[TestClient]:
    write_exact_snapshot(settings)
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def gappy_client(settings: Settings) -> Iterator[TestClient]:
    write_exact_snapshot(
        settings, drop_actual_every=20
    )  # every 20th actual missing -> ~95 % coverage
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def empty_client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as client:
        yield client
