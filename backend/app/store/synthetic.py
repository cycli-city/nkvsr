"""DEVELOPMENT-ONLY synthetic snapshot generator.

!!! This is NOT Elexon data. !!!

It exists so the UI and API can be built, demoed offline and browser-tested when the real Elexon
service is unreachable. Safeguards:

* the manifest is stamped ``provenance="synthetic_dev"`` and carries an explicit warning;
* the API refuses to load it when ``APP_ENV=production``;
* the frontend renders a persistent, unmistakable banner whenever it is served;
* the generator writes under ``data/dev/`` which is git-ignored.

The numbers are plausible-looking (autocorrelated wind, forecast error growing with lead time) but
carry no information about the real world and must never appear in a pitch or the README as results.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.config import Settings
from app.domain import timeutil as tu
from app.elexon import endpoints
from app.services.ingestion import compute_windows
from app.store.snapshot import DatasetSource, Manifest, utcnow, write_snapshot

CAPACITY_MW = 14_000.0
PUBLISH_STEP_HOURS = 1
MAX_LEAD_HOURS = 60
SYNTHETIC_WARNING = (
    "SYNTHETIC DEVELOPMENT DATA - generated locally, NOT retrieved from Elexon. "
    "Do not use for any analysis, screenshot or claim."
)


def generate(settings: Settings, *, seed: int = 7, gap_fraction: float = 0.002) -> Manifest:
    rng = np.random.default_rng(seed)
    w = compute_windows(settings)

    # Actual wind: smooth AR(1) in log-ish space with a slow diurnal component, clipped to capacity.
    starts = pd.date_range(
        w.actuals_window[0], w.coverage_to, freq="30min", inclusive="left", unit="ns"
    )
    n = len(starts)
    noise = rng.normal(0, 1, n)
    level = np.empty(n)
    level[0] = 0.0
    for i in range(1, n):
        level[i] = 0.985 * level[i - 1] + 0.17 * noise[i]
    diurnal = 0.15 * np.sin(2 * np.pi * (starts.hour + starts.minute / 60 - 3) / 24)
    share = 1 / (1 + np.exp(-(level + diurnal - 0.2)))
    actual = np.clip(share * CAPACITY_MW + rng.normal(0, 60, n), 40, CAPACITY_MW)
    actuals = pd.DataFrame(
        {
            "start_utc": starts,
            "actual_mw": actual,
            "actual_publish_utc": starts + pd.Timedelta(minutes=45),
        }
    )

    # Knock out a few actuals so the "missing data" states are exercised in dev.
    drop = rng.random(n) < gap_fraction
    actuals = actuals[~drop].reset_index(drop=True)

    # Forecast vintages: error std grows with lead time; errors are smooth across publications.
    # Like the live WINDFOR feed (observed 2026-10-25), forecasts exist for whole hours only.
    targets = pd.date_range(
        w.coverage_from, w.coverage_to, freq="60min", inclusive="left", unit="ns"
    )
    truth = pd.Series(actual, index=starts).reindex(targets).to_numpy()
    rows_start: list[pd.DatetimeIndex] = []
    rows_publish: list[pd.DatetimeIndex] = []
    rows_value: list[np.ndarray] = []
    bias = 0.01 * CAPACITY_MW  # slight systematic over-forecast
    shared = rng.normal(0, 1, len(targets))
    for lead in range(2, MAX_LEAD_HOURS + 1, PUBLISH_STEP_HOURS):
        publish = targets - pd.Timedelta(hours=lead)
        sigma = (0.025 + 0.0035 * lead) * CAPACITY_MW
        own = rng.normal(0, 1, len(targets))
        value = truth + bias + sigma * (0.7 * shared + 0.3 * own)
        rows_start.append(targets)
        rows_publish.append(publish)
        rows_value.append(np.clip(value, 0, CAPACITY_MW))
    forecasts = pd.DataFrame(
        {
            "start_utc": np.concatenate([r.to_numpy() for r in rows_start]),
            "publish_utc": np.concatenate([r.to_numpy() for r in rows_publish]),
            "forecast_mw": np.concatenate(rows_value),
        }
    )
    forecasts["start_utc"] = tu.as_utc_ns(forecasts["start_utc"])
    forecasts["publish_utc"] = tu.as_utc_ns(forecasts["publish_utc"])
    forecasts = forecasts[forecasts["publish_utc"] >= w.publish_from]
    forecasts = forecasts[rng.random(len(forecasts)) > gap_fraction]
    forecasts = forecasts.sort_values(["publish_utc", "start_utc"]).reset_index(drop=True)

    manifest = Manifest(
        provenance="synthetic_dev",
        source_name="SYNTHETIC DEVELOPMENT DATA (not Elexon)",
        base_url="n/a",
        datasets=[
            DatasetSource(
                code=code,
                endpoint="n/a (generated locally)",
                documentation_url=endpoints.DOC_LINKS[code],
            )
            for code in (endpoints.FUELHH, endpoints.WINDFOR)
        ],
        retrieved_at=utcnow(),
        analysis_month=settings.analysis_month,
        delivery_coverage_from=w.delivery_first,
        delivery_coverage_to=w.delivery_last,
        actuals_rows=len(actuals),
        forecasts_rows=len(forecasts),
        quality={
            "synthetic": True,
            "seed": seed,
            "forecast_profile": {"start_resolution_minutes": 60.0},
        },
        warnings=[SYNTHETIC_WARNING],
    )
    return write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest)
