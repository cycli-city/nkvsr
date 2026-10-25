"""Fixed tables used by the analysis queries: sort/filter vocabularies, baseline descriptions, cutoff presets."""

from __future__ import annotations

from typing import Literal

from app.api import schemas as s

CACHE_SIZE = 48
SORT_COLUMNS = {
    "start_time": "start_utc",
    "forecast": "forecast_mw",
    "actual": "actual_mw",
    "error": "error_mw",
    "abs_error": "abs_error_mw",
    "publish_time": "publish_utc",
    "forecast_age": "forecast_age_h",
}
STATUS_FILTERS = {
    "all",
    "matched",
    "missing_any",
    "missing_forecast",
    "missing_actual",
    "missing_both",
}
BaselineKey = Literal["persistence", "trailing_mean"]
BASELINES: dict[BaselineKey, tuple[str, str, str]] = {
    "persistence": (
        "baseline_persistence_mw",
        "Persistence at cutoff",
        "Last half-hour actual that was complete and published by the cutoff (assumed publication lag "
        "applies), held flat across the delivery day.",
    ),
    "trailing_mean": (
        "baseline_trailing_mean_mw",
        "Trailing 7-day mean",
        "Mean of the same settlement period over the 7 complete days D-8 to D-2 (D-1 is incomplete at the cutoff).",
    ),
}
DAYPART_DEFINITION = {"day": "07:00-23:00 local time", "night": "23:00-07:00 local time"}
CUTOFF_PRESETS = [
    s.CutoffPreset(
        value="09:20",
        label="EPEX SPOT GB gate closure",
        note="Default. Earliest GB day-ahead gate closure, so no forecast is used that could not have informed any day-ahead bid.",
    ),
    s.CutoffPreset(
        value="09:50",
        label="N2EX gate closure",
        note="Per Nord Pool; a secondary source quotes 09:40, so treat as indicative.",
    ),
    s.CutoffPreset(
        value="08:00",
        label="Early bid preparation",
        note="Sensitivity case: bids finalised ahead of gate closure.",
    ),
]
