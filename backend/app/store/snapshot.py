"""On-disk snapshot: two Parquet files + ``manifest.json`` (provenance, retrieval time, quality, hashes).

Layout::

    <data_dir>/snapshots/<name>/
        actuals.parquet      start_utc, actual_mw, actual_publish_utc
        forecasts.parquet    start_utc, publish_utc, forecast_mw   (every publication kept)
        manifest.json

Writes are atomic (temp directory then rename) so a crash or failed refresh can never leave a
half-written snapshot: readers see either the previous complete snapshot or the new one.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from pydantic import BaseModel, Field

from app.domain.timeutil import as_utc_ns

SCHEMA_VERSION = 1
ACTUALS_FILE = "actuals.parquet"
FORECASTS_FILE = "forecasts.parquet"
MANIFEST_FILE = "manifest.json"

Provenance = Literal["elexon_live", "synthetic_dev"]


class DatasetSource(BaseModel):
    code: str
    endpoint: str
    documentation_url: str
    query_parameters: dict[str, str] = Field(default_factory=dict)


class Manifest(BaseModel):
    schema_version: int = SCHEMA_VERSION
    provenance: Provenance
    source_name: str
    base_url: str
    datasets: list[DatasetSource]
    retrieved_at: datetime
    unit: str = "MW"
    analysis_month: str
    delivery_coverage_from: date
    delivery_coverage_to: date
    actuals_rows: int
    forecasts_rows: int
    quality: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    files: dict[str, str] = Field(default_factory=dict)  # file name -> sha256


class SnapshotError(RuntimeError):
    """The snapshot is missing, corrupt, or from an incompatible schema version."""


@dataclass(frozen=True)
class LoadedSnapshot:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    manifest: Manifest


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_snapshot(
    target_dir: Path,
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    manifest: Manifest,
) -> Manifest:
    """Atomically replace ``target_dir`` with a new snapshot; returns the manifest as written."""
    target_dir = Path(target_dir)
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = target_dir.parent / f".{target_dir.name}.staging-{os.getpid()}"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir()
    try:
        actuals.to_parquet(staging / ACTUALS_FILE, index=False, compression="zstd")
        forecasts.to_parquet(staging / FORECASTS_FILE, index=False, compression="zstd")
        final = manifest.model_copy(
            update={
                "actuals_rows": len(actuals),
                "forecasts_rows": len(forecasts),
                "files": {
                    ACTUALS_FILE: _sha256(staging / ACTUALS_FILE),
                    FORECASTS_FILE: _sha256(staging / FORECASTS_FILE),
                },
            }
        )
        (staging / MANIFEST_FILE).write_text(final.model_dump_json(indent=2), encoding="utf-8")

        backup = target_dir.parent / f".{target_dir.name}.previous"
        if backup.exists():
            shutil.rmtree(backup)
        if target_dir.exists():
            target_dir.rename(backup)
        staging.rename(target_dir)
        if backup.exists():
            shutil.rmtree(backup)
        return final
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def read_manifest(snapshot_dir: Path) -> Manifest:
    path = Path(snapshot_dir) / MANIFEST_FILE
    if not path.is_file():
        raise SnapshotError(f"No snapshot manifest at {path}")
    try:
        manifest = Manifest.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except (ValueError, OSError) as exc:
        raise SnapshotError(f"Unreadable snapshot manifest {path}: {exc}") from exc
    if manifest.schema_version != SCHEMA_VERSION:
        raise SnapshotError(
            f"Snapshot schema v{manifest.schema_version} is not supported (expected v{SCHEMA_VERSION})"
        )
    return manifest


def read_snapshot(snapshot_dir: Path, *, verify_hashes: bool = True) -> LoadedSnapshot:
    snapshot_dir = Path(snapshot_dir)
    manifest = read_manifest(snapshot_dir)
    for name in (ACTUALS_FILE, FORECASTS_FILE):
        path = snapshot_dir / name
        if not path.is_file():
            raise SnapshotError(f"Snapshot file missing: {path}")
        if verify_hashes and manifest.files.get(name) != _sha256(path):
            raise SnapshotError(
                f"Checksum mismatch for {path}; the snapshot was modified or corrupted"
            )

    actuals = pd.read_parquet(snapshot_dir / ACTUALS_FILE)
    forecasts = pd.read_parquet(snapshot_dir / FORECASTS_FILE)
    for col in ("start_utc", "actual_publish_utc"):
        if col in actuals:
            actuals[col] = as_utc_ns(actuals[col])
    for col in ("start_utc", "publish_utc"):
        forecasts[col] = as_utc_ns(forecasts[col])
    forecasts = forecasts.sort_values(["publish_utc", "start_utc"], kind="stable").reset_index(
        drop=True
    )
    return LoadedSnapshot(actuals=actuals, forecasts=forecasts, manifest=manifest)


def utcnow() -> datetime:
    return datetime.now(tz=UTC)
