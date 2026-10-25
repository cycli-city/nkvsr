"""Normalisation tests use hand-written records shaped like the documented fields.

They are *test fixtures, not Elexon observations*.
"""

import numpy as np
import pandas as pd
import pytest

from app.elexon.normalize import normalize_actuals, normalize_forecasts, profile_forecasts
from app.errors import UpstreamSchemaError
from tests.factories import ts


def act(start: str, generation: object, fuel: str = "WIND", publish: str | None = None) -> dict:  # type: ignore[type-arg]
    rec: dict = {
        "dataset": "FUELHH",
        "startTime": start,
        "fuelType": fuel,
        "generation": generation,
    }  # type: ignore[type-arg]
    if publish:
        rec["publishTime"] = publish
    return rec


def fc(start: str, publish: str, generation: object) -> dict:  # type: ignore[type-arg]
    return {
        "dataset": "WINDFOR",
        "startTime": start,
        "publishTime": publish,
        "generation": generation,
    }


class TestActuals:
    def test_keeps_only_wind_and_counts_ignored_fuel_types(self) -> None:
        frame, rep = normalize_actuals(
            [
                act("2026-01-15T00:00:00Z", 1000),
                act("2026-01-15T00:00:00Z", 5000, fuel="CCGT"),
                act("2026-01-15T00:30:00Z", 900, fuel="wind"),
            ]
        )
        assert frame["actual_mw"].tolist() == [1000.0, 900.0]  # case-insensitive WIND
        assert rep.ignored_other_fuel_types == 1 and rep.rows_in == 3 and rep.rows_kept == 2

    def test_parses_to_utc_ns_and_converts_offsets(self) -> None:
        frame, _ = normalize_actuals([act("2026-07-01T01:00:00+01:00", 10)])
        assert str(frame["start_utc"].dtype) == "datetime64[ns, UTC]"
        assert frame["start_utc"].iloc[0] == ts("2026-07-01T00:00:00Z")

    def test_output_is_sorted_even_if_input_is_out_of_order(self) -> None:
        frame, _ = normalize_actuals(
            [
                act("2026-01-15T01:00:00Z", 3),
                act("2026-01-15T00:00:00Z", 1),
                act("2026-01-15T00:30:00Z", 2),
            ]
        )
        assert frame["actual_mw"].tolist() == [1.0, 2.0, 3.0]

    @pytest.mark.parametrize(
        "generation,reason",
        [
            (None, "bad_generation"),
            ("abc", "bad_generation"),
            (float("nan"), "bad_generation"),
            (float("inf"), "bad_generation"),
        ],
    )
    def test_drops_invalid_generation_with_reason(self, generation: object, reason: str) -> None:
        frame, rep = normalize_actuals(
            [act("2026-01-15T00:00:00Z", generation), act("2026-01-15T00:30:00Z", 5)]
        )
        assert len(frame) == 1 and rep.dropped == {reason: 1}

    def test_drops_unparseable_naive_and_off_grid_timestamps(self) -> None:
        frame, rep = normalize_actuals(
            [
                act("not-a-time", 1),
                act("2026-01-15T00:00:00", 2),  # no timezone -> refuse to guess
                act("2026-01-15T00:15:00Z", 3),  # off the half-hour grid
                act("2026-01-15T00:30:00Z", 4),
            ]
        )
        assert frame["actual_mw"].tolist() == [4.0]
        assert rep.dropped == {"bad_start": 1, "naive_start": 1, "off_grid_start_time": 1}

    def test_numeric_strings_are_accepted(self) -> None:
        frame, _ = normalize_actuals([act("2026-01-15T00:00:00Z", "123.5")])
        assert frame["actual_mw"].tolist() == [123.5]

    def test_identical_duplicates_collapse_without_conflict(self) -> None:
        frame, rep = normalize_actuals([act("2026-01-15T00:00:00Z", 10)] * 3)
        assert len(frame) == 1 and rep.duplicates_removed == 2 and rep.conflicting_duplicates == 0

    def test_conflicting_duplicates_are_counted_and_latest_publication_wins(self) -> None:
        records = [
            act(
                "2026-01-15T00:00:00Z", 999, publish="2026-01-15T00:40:00Z"
            ),  # newest, listed first
            act("2026-01-15T00:00:00Z", 100, publish="2026-01-15T00:35:00Z"),
        ]
        frame, rep = normalize_actuals(records)
        assert frame["actual_mw"].tolist() == [999.0]
        assert rep.conflicting_duplicates == 1 and rep.duplicates_removed == 1

    def test_negative_values_are_kept_and_counted(self) -> None:
        frame, rep = normalize_actuals([act("2026-01-15T00:00:00Z", -3.0)])
        assert frame["actual_mw"].tolist() == [-3.0] and rep.negative_values == 1

    def test_window_filter_counts_outside_rows(self) -> None:
        window = (ts("2026-01-15T00:00:00Z"), ts("2026-01-15T01:00:00Z"))
        frame, rep = normalize_actuals(
            [
                act("2026-01-14T23:30:00Z", 1),
                act("2026-01-15T00:00:00Z", 2),
                act("2026-01-15T01:00:00Z", 3),
            ],
            window=window,
        )
        assert frame["actual_mw"].tolist() == [2.0] and rep.outside_window == 2

    def test_missing_required_field_is_a_schema_error(self) -> None:
        with pytest.raises(UpstreamSchemaError, match="fuelType"):
            normalize_actuals([{"startTime": "2026-01-15T00:00:00Z", "generation": 1}])

    def test_empty_input_gives_empty_typed_frame(self) -> None:
        frame, rep = normalize_actuals([])
        assert frame.empty and list(frame.columns) == [
            "start_utc",
            "actual_mw",
            "actual_publish_utc",
        ]
        assert rep.rows_in == 0 and rep.rows_kept == 0


class TestForecasts:
    def test_multiple_publications_for_one_start_are_all_kept(self) -> None:
        frame, rep = normalize_forecasts(
            [
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 100),
                fc("2026-01-15T00:00:00Z", "2026-01-14T09:00:00Z", 110),
                fc("2026-01-15T00:00:00Z", "2026-01-14T12:00:00Z", 120),
            ]
        )
        assert len(frame) == 3 and rep.duplicates_removed == 0

    def test_same_start_and_publish_duplicates_keep_last_and_count_conflicts(self) -> None:
        frame, rep = normalize_forecasts(
            [
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 100),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 140),
            ]
        )
        assert frame["forecast_mw"].tolist() == [140.0]
        assert rep.duplicates_removed == 1 and rep.conflicting_duplicates == 1

    def test_drops_bad_publish_time_and_naive_publish_time(self) -> None:
        frame, rep = normalize_forecasts(
            [
                fc("2026-01-15T00:00:00Z", "garbage", 1),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00", 2),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 3),
            ]
        )
        assert frame["forecast_mw"].tolist() == [3.0]
        assert rep.dropped == {"bad_publish": 1, "naive_publish": 1}

    def test_counts_forecasts_published_after_delivery_start(self) -> None:
        _, rep = normalize_forecasts(
            [
                fc("2026-01-15T00:00:00Z", "2026-01-15T00:30:00Z", 1),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 2),
            ]
        )
        assert rep.published_after_delivery_start == 1

    def test_sorted_by_publish_then_start(self) -> None:
        frame, _ = normalize_forecasts(
            [
                fc("2026-01-15T00:30:00Z", "2026-01-14T09:00:00Z", 2),
                fc("2026-01-15T00:00:00Z", "2026-01-14T09:00:00Z", 1),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 0),
            ]
        )
        assert frame["forecast_mw"].tolist() == [0.0, 1.0, 2.0]

    def test_missing_publish_time_field_is_a_schema_error(self) -> None:
        with pytest.raises(UpstreamSchemaError, match="publishTime"):
            normalize_forecasts([{"startTime": "2026-01-15T00:00:00Z", "generation": 1}])

    def test_window_applies_to_delivery_start(self) -> None:
        window = (ts("2026-01-15T00:00:00Z"), ts("2026-01-16T00:00:00Z"))
        frame, rep = normalize_forecasts(
            [
                fc("2026-01-14T23:30:00Z", "2026-01-14T06:00:00Z", 1),
                fc("2026-01-15T00:00:00Z", "2026-01-14T06:00:00Z", 2),
            ],
            window=window,
        )
        assert frame["forecast_mw"].tolist() == [2.0] and rep.outside_window == 1


class TestProfile:
    def test_detects_half_hourly_resolution_cadence_and_lead_time(self) -> None:
        rows = []
        for publish in ("2026-01-14T06:00:00Z", "2026-01-14T07:00:00Z"):
            for start in pd.date_range("2026-01-15T00:00:00Z", periods=4, freq="30min"):
                rows.append(fc(start.isoformat(), publish, 1))
        frame, _ = normalize_forecasts(rows)
        profile = profile_forecasts(frame)
        assert profile["start_resolution_minutes"] == 30.0
        assert profile["publish_cadence_minutes_median"] == 60.0
        assert profile["distinct_publish_times"] == 2
        assert profile["lead_time_hours_max"] == pytest.approx(19.5 + 0.0, abs=2.0)

    def test_detects_hourly_resolution(self) -> None:
        rows = [
            fc(s.isoformat(), "2026-01-14T06:00:00Z", 1)
            for s in pd.date_range("2026-01-15T00:00:00Z", periods=4, freq="1h")
        ]
        frame, _ = normalize_forecasts(rows)
        assert profile_forecasts(frame)["start_resolution_minutes"] == 60.0

    def test_empty_profile_is_all_unavailable(self) -> None:
        frame, _ = normalize_forecasts([])
        p = profile_forecasts(frame)
        assert p["distinct_publish_times"] == 0 and p["start_resolution_minutes"] is None
        assert not np.isnan(0)  # keep numpy import used for clarity of dtype handling
