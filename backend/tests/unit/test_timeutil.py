from datetime import date, time

import pandas as pd
import pytest

from app.domain import timeutil as tu
from tests.factories import ts


class TestParseHhmm:
    @pytest.mark.parametrize(
        "raw,expected", [("09:20", time(9, 20)), ("00:00", time(0, 0)), ("23:59", time(23, 59))]
    )
    def test_valid(self, raw: str, expected: time) -> None:
        assert tu.parse_hhmm(raw) == expected

    @pytest.mark.parametrize("raw", ["9:20", "24:00", "09:60", "0920", "", "09:20:00", "ab:cd"])
    def test_invalid(self, raw: str) -> None:
        with pytest.raises(ValueError):
            tu.parse_hhmm(raw)


class TestToUtc:
    def test_converts_offset_aware_value(self) -> None:
        assert tu.to_utc("2026-07-01T10:00:00+01:00") == pd.Timestamp("2026-07-01T09:00:00Z")

    def test_rejects_naive_timestamps(self) -> None:
        with pytest.raises(ValueError, match="naive"):
            tu.to_utc("2026-01-01T00:00:00")


class TestDeliveryDays:
    @pytest.mark.parametrize(
        "day,expected_count",
        [
            (date(2026, 1, 15), 48),  # ordinary GMT day
            (date(2026, 7, 15), 48),  # ordinary BST day
            (date(2026, 3, 29), 46),  # spring forward: 23-hour day
            (date(2026, 10, 25), 50),  # autumn back: 25-hour day
        ],
    )
    def test_interval_counts(self, day: date, expected_count: int) -> None:
        assert len(tu.delivery_day_intervals(day)) == expected_count

    def test_bst_day_starts_one_hour_before_midnight_utc(self) -> None:
        start, end = tu.delivery_day_bounds(date(2026, 7, 1))
        assert start == ts("2026-06-30T23:00:00Z")
        assert end == ts("2026-07-01T23:00:00Z")

    def test_intervals_are_ns_utc_and_half_hour_spaced(self) -> None:
        idx = tu.delivery_day_intervals(date(2026, 1, 15))
        assert str(idx.dtype) == "datetime64[ns, UTC]"
        assert set(idx.to_series().diff().dropna()) == {pd.Timedelta(minutes=30)}

    def test_range_across_spring_forward_has_48_46_48(self) -> None:
        idx = tu.delivery_range_intervals(date(2026, 3, 28), date(2026, 3, 30))
        assert len(idx) == 48 + 46 + 48
        assert idx.is_unique

    def test_range_rejects_reversed_dates(self) -> None:
        with pytest.raises(ValueError):
            tu.delivery_range_intervals(date(2026, 1, 2), date(2026, 1, 1))


class TestSettlementPeriods:
    def test_ordinary_day_is_1_to_48(self) -> None:
        starts = pd.Series(tu.delivery_day_intervals(date(2026, 1, 15)))
        periods = tu.settlement_periods(starts)
        assert periods.tolist() == list(range(1, 49))

    def test_short_day_is_1_to_46(self) -> None:
        periods = tu.settlement_periods(pd.Series(tu.delivery_day_intervals(date(2026, 3, 29))))
        assert periods.tolist() == list(range(1, 47))

    def test_long_day_is_1_to_50(self) -> None:
        periods = tu.settlement_periods(pd.Series(tu.delivery_day_intervals(date(2026, 10, 25))))
        assert periods.tolist() == list(range(1, 51))

    def test_first_bst_half_hour_is_period_1_of_the_local_day(self) -> None:
        starts = pd.Series([ts("2026-06-30T23:00:00Z")])  # 00:00 BST on 1 July
        assert tu.settlement_periods(starts).tolist() == [1]
        assert tu.local_date_of(starts).tolist() == [date(2026, 7, 1)]


class TestLocalDateAndSlot:
    def test_local_date_differs_from_utc_date_in_summer(self) -> None:
        starts = pd.Series([ts("2026-06-30T23:30:00Z")])  # 00:30 BST next day
        assert tu.local_date_of(starts).tolist() == [date(2026, 7, 1)]
        assert tu.local_slot_label(starts).tolist() == ["00:30"]

    def test_autumn_overlap_hour_shares_a_slot_label(self) -> None:
        labels = tu.local_slot_label(
            pd.Series(tu.delivery_day_intervals(date(2026, 10, 25)))
        ).tolist()
        assert labels.count("01:00") == 2 and labels.count("01:30") == 2

    def test_spring_gap_hour_has_no_slot(self) -> None:
        labels = tu.local_slot_label(
            pd.Series(tu.delivery_day_intervals(date(2026, 3, 29)))
        ).tolist()
        assert "01:00" not in labels and "01:30" not in labels


class TestCutoffs:
    def test_gmt_cutoff_is_09_20_utc_on_previous_day(self) -> None:
        assert tu.cutoff_utc_for_delivery_date(date(2026, 1, 15), time(9, 20)) == ts(
            "2026-01-14T09:20:00Z"
        )

    def test_bst_cutoff_is_one_hour_earlier_in_utc(self) -> None:
        assert tu.cutoff_utc_for_delivery_date(date(2026, 7, 2), time(9, 20)) == ts(
            "2026-07-01T08:20:00Z"
        )

    def test_cutoff_on_dst_change_day_uses_that_days_offset(self) -> None:
        # Delivery 30 Mar 2026 -> decision day 29 Mar (BST begins 01:00 UTC); 09:20 BST == 08:20Z.
        assert tu.cutoff_utc_for_delivery_date(date(2026, 3, 30), time(9, 20)) == ts(
            "2026-03-29T08:20:00Z"
        )
        # Delivery 26 Oct 2026 -> decision day 25 Oct (back to GMT); 09:20 GMT == 09:20Z.
        assert tu.cutoff_utc_for_delivery_date(date(2026, 10, 26), time(9, 20)) == ts(
            "2026-10-25T09:20:00Z"
        )

    def test_nonexistent_local_time_resolves_without_error(self) -> None:
        # 01:30 does not exist on 29 Mar 2026 in London; the resolved instant must still be valid.
        cutoff = tu.cutoff_utc_for_delivery_date(date(2026, 3, 30), time(1, 30))
        assert cutoff == ts("2026-03-29T01:30:00Z")

    def test_cutoffs_computed_once_per_distinct_date(self) -> None:
        days = [date(2026, 1, 2), date(2026, 1, 2), date(2026, 1, 3)]
        result = tu.cutoffs_for_dates(days, time(9, 20))
        assert set(result) == {date(2026, 1, 2), date(2026, 1, 3)}


class TestAlignment:
    def test_flags_off_grid_instants(self) -> None:
        values = pd.Series(
            pd.to_datetime(
                [
                    "2026-01-01T00:00:00Z",
                    "2026-01-01T00:15:00Z",
                    "2026-01-01T00:30:00Z",
                    "2026-01-01T00:30:01Z",
                ],
                utc=True,
            )
        )
        assert tu.is_half_hour_aligned(values).tolist() == [True, False, True, False]
