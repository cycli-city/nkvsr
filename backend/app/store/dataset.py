"""In-memory dataset + process-wide store with refresh-state tracking.

``Dataset`` is immutable; a refresh builds a new one and swaps the reference, so concurrent requests
always see a complete, internally-consistent snapshot.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import Settings
from app.errors import DataUnavailableError
from app.store.snapshot import Manifest, SnapshotError, read_snapshot, utcnow

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Dataset:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    manifest: Manifest

    @property
    def retrieved_at(self) -> pd.Timestamp:
        return pd.Timestamp(self.manifest.retrieved_at).tz_convert("UTC")

    @property
    def fingerprint(self) -> str:
        """Identity used in cache keys: changes whenever the underlying files change."""
        return "|".join(f"{k}:{v[:12]}" for k, v in sorted(self.manifest.files.items()))

    @property
    def is_synthetic(self) -> bool:
        return self.manifest.provenance == "synthetic_dev"


@dataclass
class RefreshState:
    """Outcome of the latest ingestion attempt, persisted next to the snapshots."""

    status: str = "never"  # never | running | ok | failed
    last_attempt_at: str | None = None
    last_success_at: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DataStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._dataset: Dataset | None = None
        self._load_error: str | None = None
        self._lock = threading.Lock()
        self.refresh_state = self._read_refresh_state()

    # --- dataset ---------------------------------------------------------------------------------

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def get(self) -> Dataset:
        dataset = self._dataset
        if dataset is None:
            raise DataUnavailableError(
                self._load_error or "No dataset has been ingested yet.",
                details={
                    "remedy": "Run `python -m app.cli ingest` (needs access to data.elexon.co.uk) "
                    "or start the API with AUTO_INGEST_ON_START=true.",
                    "refresh": self.refresh_state.to_dict(),
                },
            )
        return dataset

    def maybe_get(self) -> Dataset | None:
        return self._dataset

    def load_from_disk(self) -> Dataset | None:
        """Load the configured snapshot; on any problem stay (or become) empty with a reason."""
        directory = self._settings.snapshot_dir
        try:
            snap = read_snapshot(directory)
        except SnapshotError as exc:
            self._set(None, str(exc))
            logger.warning("No usable snapshot at %s: %s", directory, exc)
            return None
        if snap.manifest.provenance == "synthetic_dev" and self._settings.is_production:
            message = "Refusing to serve synthetic development data when APP_ENV=production."
            self._set(None, message)
            logger.error(message)
            return None
        dataset = Dataset(snap.actuals, snap.forecasts, snap.manifest)
        self._set(dataset, None)
        logger.info(
            "Loaded snapshot (%s): %d actuals, %d forecast rows, retrieved %s",
            dataset.manifest.provenance,
            len(dataset.actuals),
            len(dataset.forecasts),
            dataset.manifest.retrieved_at,
        )
        return dataset

    def _set(self, dataset: Dataset | None, error: str | None) -> None:
        with self._lock:
            self._dataset = dataset
            self._load_error = error

    # --- refresh state -----------------------------------------------------------------------------

    def _read_refresh_state(self) -> RefreshState:
        path: Path = self._settings.refresh_state_path
        try:
            return RefreshState(**json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, TypeError):
            return RefreshState()

    def record_refresh(self, status: str, *, error: str | None = None) -> None:
        now = utcnow().isoformat()
        state = self.refresh_state
        state.status = status
        state.error = error
        if status != "running":
            state.last_attempt_at = now
        if status == "ok":
            state.last_success_at = now
        elif status == "running":
            state.last_attempt_at = now
        try:
            path = self._settings.refresh_state_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(state.to_dict(), indent=2), encoding="utf-8")
        except OSError as exc:  # read-only filesystem on some hosts: state stays in memory only
            logger.warning("Could not persist refresh state: %s", exc)
