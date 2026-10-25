from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from app.domain import timeutil as tu
from app.domain.baselines import add_baselines, persistence_at_cutoff, trailing_mean_same_period
from app.domain.breakdowns import by_daypart, by_delivery_day, by_slot, histogram, largest_errors
from app.domain.matching import build_matched_frame, expected_intervals
from app.domain.windows import (
    Basis,
    InvalidWindowError,
    basis_bounds,
    parse_month,
    required_delivery_coverage,
    resolve_window,
    validate_window,
)
from tests.factories import DEFAULT_CUTOFF, make_actuals, make_forecasts, ts

DAY = date(2026, 1, 15)


def history(first: date, last: date, value_fn) -> pd.DataFrame:  # type: ignore[no-untyped-def]
    starts = tu.delivery_range_intervals(first, last)
    return pd.DataFrame({"start_utc": starts, "actual_mw": [value_fn(s) for s in starts]})


class TestPersistenceBaseline:
    @pytest.mark.parametrize(
        "lag_minutes,expected",
        [
            (0, 830.0),  # 08:30-09:00 has ended by 09:20
            (
                30,
                800.0,
            ),  # default: it is not *published* until 09:30, so 08:00-08:30 is the latest usable
            (60, 730.0),
        ],
    )
    def test_uses_last_actual_that_was_available_at_the_cutoff(
        self, lag_minutes: int, expected: float
    ) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)  # cutoff = 14 Jan 09:20Z
        actuals = history(date(2026, 1, 13), DAY, lambda s: float(s.hour * 100 + s.minute))
        base = persistence_at_cutoff(
            iv, actuals, availability_lag=pd.Timedelta(minutes=lag_minutes)
        )
        assert (base == expected).all()

    def test_default_lag_is_conservative(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        actuals = history(date(2026, 1, 13), DAY, lambda s: float(s.hour * 100 + s.minute))
        assert (persistence_at_cutoff(iv, actuals) == 800.0).all()

    def test_an_actual_that_has_ended_but_is_not_yet_published_cannot_influence_it(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        base_actuals = history(date(2026, 1, 13), DAY, lambda s: 1.0)
        tampered = base_actuals.copy()
        # 08:30-09:00 ended at 09:00 (before the 09:20 cutoff) but, with the 30 min lag, is unpublished.
        tampered.loc[tampered["start_utc"] == ts("2026-01-14T08:30:00Z"), "actual_mw"] = 9999.0
        assert persistence_at_cutoff(iv, tampered).equals(persistence_at_cutoff(iv, base_actuals))

    def test_future_actuals_cannot_change_the_baseline(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        base_actuals = history(date(2026, 1, 13), DAY, lambda s: 1.0)
        tampered = base_actuals.copy()
        tampered.loc[tampered["start_utc"] >= ts("2026-01-14T08:30:00Z"), "actual_mw"] = 9999.0
        # Anything from 08:30 on is either still running or unpublished at 09:20, so tampering must not matter.
        assert persistence_at_cutoff(iv, tampered).equals(persistence_at_cutoff(iv, base_actuals))
        assert (persistence_at_cutoff(iv, tampered) == 1.0).all()

    def test_stale_persistence_is_not_used(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        old = history(date(2026, 1, 13), date(2026, 1, 13), lambda s: 5.0)  # >6 h before cutoff
        assert persistence_at_cutoff(iv, old).isna().all()

    def test_no_actuals_at_all(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        empty = pd.DataFrame({"start_utc": pd.Series(dtype="datetime64[ns, UTC]"), "actual_mw": []})
        assert persistence_at_cutoff(iv, empty).isna().all()


class TestTrailingMeanBaseline:
    @staticmethod
    def daily_level(start: pd.Timestamp) -> float:
        """Actual equals the local day-of-month times 100 (constant within the day)."""
        return float(start.tz_convert(tu.LONDON).day * 100)

    def test_mean_of_d_minus_8_to_d_minus_2(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)  # D = 15 Jan -> uses days 7..13
        actuals = history(date(2026, 1, 1), date(2026, 1, 20), self.daily_level)
        expected = np.mean([d * 100 for d in range(7, 14)])
        got = trailing_mean_same_period(iv, actuals)
        assert got.notna().all()
        assert np.allclose(got, expected)

    def test_decision_day_and_later_days_are_excluded(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        actuals = history(date(2026, 1, 1), date(2026, 1, 20), self.daily_level)
        tampered = actuals.copy()
        late = tampered["start_utc"] >= tu.local_midnight_utc(date(2026, 1, 14))  # D-1 onwards
        tampered.loc[late, "actual_mw"] = 123456.0
        assert np.allclose(
            trailing_mean_same_period(iv, tampered), trailing_mean_same_period(iv, actuals)
        )

    def test_insufficient_history_is_unavailable(self) -> None:
        iv = expected_intervals(DAY, DAY, DEFAULT_CUTOFF)
        short = history(
            date(2026, 1, 11), date(2026, 1, 13), self.daily_level
        )  # only 3 usable days
        assert trailing_mean_same_period(iv, short).isna().all()

    def test_add_baselines_adds_both_columns_without_changing_rows(self) -> None:
        actuals = history(date(2026, 1, 1), date(2026, 1, 20), self.daily_level)
        fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 1.0)])
        matched = build_matched_frame(
            delivery_from=DAY,
            delivery_to=DAY,
            cutoff_local=DEFAULT_CUTOFF,
            actuals=actuals,
            forecasts=fc,
        )
        out = add_baselines(matched, actuals)
        assert len(out) == len(matched) == 48
        assert {"baseline_persistence_mw", "baseline_trailing_mean_mw"} <= set(out.columns)


class TestBreakdowns:
    @staticmethod
    def matched_two_days() -> pd.DataFrame:
        d1, d2 = date(2026, 1, 15), date(2026, 1, 16)
        actuals = pd.concat([make_actuals(d1, 1000.0), make_actuals(d2, 1000.0)], ignore_index=True)
        fc = pd.concat(
            [
                make_forecasts(d1, [(ts("2026-01-14T08:00:00Z"), 1100.0)]),  # +100 on day 1
                make_forecasts(d2, [(ts("2026-01-15T08:00:00Z"), 800.0)]),  # -200 on day 2
            ],
            ignore_index=True,
        )
        return build_matched_frame(
            delivery_from=d1,
            delivery_to=d2,
            cutoff_local=time(9, 20),
            actuals=actuals,
            forecasts=fc,
        )

    def test_by_delivery_day(self) -> None:
        groups = by_delivery_day(self.matched_two_days())
        assert [g.key for g in groups] == [date(2026, 1, 15), date(2026, 1, 16)]
        assert groups[0].metrics.bias == pytest.approx(100.0)
        assert groups[1].metrics.bias == pytest.approx(-200.0)
        assert all(g.expected == 48 and g.coverage == 1.0 for g in groups)

    def test_by_slot_has_48_slots_and_counts_each_day(self) -> None:
        groups = by_slot(self.matched_two_days())
        assert len(groups) == 48 and groups[0].key == "00:00" and groups[-1].key == "23:30"
        assert all(g.metrics.n == 2 for g in groups)
        assert groups[0].metrics.mae == pytest.approx(150.0)

    def test_by_daypart_counts_32_day_and_16_night_slots_per_day(self) -> None:
        groups = {g.key: g for g in by_daypart(self.matched_two_days())}
        assert groups["day"].metrics.n == 2 * 32 and groups["night"].metrics.n == 2 * 16

    def test_group_with_no_matches_reports_zero_n_and_unavailable_metrics(self) -> None:
        m = self.matched_two_days()
        m.loc[
            m["delivery_date"] == date(2026, 1, 16), ["forecast_mw", "error_mw", "abs_error_mw"]
        ] = np.nan
        m.loc[m["delivery_date"] == date(2026, 1, 16), "match_status"] = "missing_forecast"
        groups = by_delivery_day(m)
        assert (
            groups[1].metrics.n == 0 and groups[1].metrics.mae is None and groups[1].coverage == 0.0
        )

    def test_histogram_bins_cover_all_values_and_align_to_zero(self) -> None:
        errors = np.array([-130.0, -20.0, 5.0, 60.0, 240.0])
        h = histogram(errors)
        width = h["bin_width_mw"]
        assert sum(b["count"] for b in h["bins"]) == len(errors)  # type: ignore[index, union-attr]
        assert all(b["lower"] % width == 0 for b in h["bins"])  # type: ignore[index, union-attr, operator]

    def test_histogram_empty(self) -> None:
        assert histogram(np.array([])) == {"bin_width_mw": None, "bins": []}

    def test_histogram_limits_bin_count(self) -> None:
        h = histogram(np.linspace(-9000, 9000, 1000))
        assert len(h["bins"]) <= 40 + 2  # type: ignore[arg-type]

    def test_largest_errors_sorted_descending_by_magnitude(self) -> None:
        top = largest_errors(self.matched_two_days(), n=3)
        assert (
            len(top) == 3 and (top["abs_error_mw"] == 200.0).all()
        )  # day-2 errors are the largest
        assert top["start_utc"].is_monotonic_increasing  # ties broken by earlier start


class TestWindows:
    def test_decision_basis_shifts_delivery_one_day_forward(self) -> None:
        w = resolve_window(Basis.DECISION_DATE, date(2026, 1, 1), date(2026, 1, 31))
        assert (w.delivery_from, w.delivery_to) == (date(2026, 1, 2), date(2026, 2, 1))

    def test_delivery_basis_shifts_decision_one_day_back(self) -> None:
        w = resolve_window(Basis.DELIVERY_DATE, date(2026, 1, 1), date(2026, 1, 31))
        assert (w.decision_from, w.decision_to) == (date(2025, 12, 31), date(2026, 1, 30))

    def test_reversed_range_rejected(self) -> None:
        with pytest.raises(InvalidWindowError):
            resolve_window(Basis.DECISION_DATE, date(2026, 1, 5), date(2026, 1, 4))

    def test_validate_against_analysis_month(self) -> None:
        bounds = basis_bounds("2026-01")
        ok = resolve_window(Basis.DECISION_DATE, date(2026, 1, 1), date(2026, 1, 31))
        validate_window(ok, bounds=bounds, max_days=62)
        bad = resolve_window(Basis.DECISION_DATE, date(2025, 12, 31), date(2026, 1, 5))
        with pytest.raises(InvalidWindowError, match="outside the analysis window"):
            validate_window(bad, bounds=bounds, max_days=62)

    def test_max_days_enforced(self) -> None:
        w = resolve_window(Basis.DELIVERY_DATE, date(2026, 1, 1), date(2026, 1, 31))
        with pytest.raises(InvalidWindowError, match="maximum"):
            validate_window(w, bounds=basis_bounds("2026-01"), max_days=10)

    def test_parse_month(self) -> None:
        assert parse_month("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))
        with pytest.raises(InvalidWindowError):
            parse_month("2026-13")
        with pytest.raises(InvalidWindowError):
            parse_month("January")

    def test_required_coverage_spans_both_bases(self) -> None:
        assert required_delivery_coverage("2026-01") == (date(2026, 1, 1), date(2026, 2, 1))
