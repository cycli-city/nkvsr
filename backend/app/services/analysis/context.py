"""Per-request values shared by every query: the resolved analysis window and the interval-explorer query."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from typing import Any

from app.store.dataset import Dataset


@dataclass(frozen=True)
class Ctx:
    dataset: Dataset
    window: Any  # AnalysisWindow
    cutoff: time
    cutoff_str: str

    @property
    def key(self) -> tuple[str, str, date, date, str]:
        return (
            self.dataset.fingerprint,
            self.window.basis.value,
            self.window.delivery_from,
            self.window.delivery_to,
            self.cutoff_str,
        )


@dataclass(frozen=True)
class IntervalQuery:
    page: int = 1
    page_size: int = 50
    sort_by: str = "start_time"
    sort_dir: str = "asc"
    status: str = "all"
    direction: str | None = None  # "over" | "under"
    min_abs_error: float | None = None
    q: str | None = None
