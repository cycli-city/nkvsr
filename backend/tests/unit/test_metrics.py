import math

import numpy as np
import pandas as pd
import pytest

from app.domain.metrics import (
    Coverage,
    compute_coverage,
    compute_error_distribution,
    compute_error_metrics,
    data_status,
    skill_vs_baseline,
)


class TestErrorMetrics:
    def test_known_values(self) -> None:
        m = compute_error_metrics([10, 20, 30], [12, 18, 33])  # errors: -2, +2, -3
        assert m.n == 3
        assert m.mae == pytest.approx(7 / 3)
        assert m.rmse == pytest.approx(math.sqrt((4 + 4 + 9) / 3))
        assert m.bias == pytest.approx(-1.0)
        assert m.wape == pytest.approx(7 / 63)
        assert m.mean_forecast == pytest.approx(20.0)
        assert m.mean_actual == pytest.approx(21.0)

    def test_bias_sign_positive_when_forecast_exceeds_actual(self) -> None:
        assert compute_error_metrics([110, 210], [100, 200]).bias == pytest.approx(10.0)

    def test_bias_sign_negative_when_forecast_below_actual(self) -> None:
        assert compute_error_metrics([90, 190], [100, 200]).bias == pytest.approx(-10.0)

    def test_perfect_forecast_has_zero_error_but_defined_wape(self) -> None:
        m = compute_error_metrics([5, 6], [5, 6])
        assert (m.mae, m.rmse, m.bias, m.wape) == (0.0, 0.0, 0.0, 0.0)

    def test_wape_unavailable_when_total_actual_is_zero(self) -> None:
        m = compute_error_metrics([1, 2], [0, 0])
        assert m.wape is None
        assert m.mae == pytest.approx(1.5)  # the other metrics are still defined

    def test_wape_unavailable_when_total_actual_is_negative(self) -> None:
        assert compute_error_metrics([1.0], [-2.0]).wape is None

    def test_empty_input_gives_unavailable_metrics_not_zeros(self) -> None:
        m = compute_error_metrics([], [])
        assert m.n == 0
        assert (m.mae, m.rmse, m.bias, m.wape, m.mean_forecast, m.mean_actual) == (None,) * 6

    def test_rmse_is_never_below_mae(self) -> None:
        rng = np.random.default_rng(0)
        f, a = rng.normal(100, 30, 500), rng.normal(100, 30, 500)
        m = compute_error_metrics(f, a)
        assert m.rmse is not None and m.mae is not None and m.rmse >= m.mae

    def test_length_mismatch_raises(self) -> None:
        with pytest.raises(ValueError, match="same length"):
            compute_error_metrics([1, 2], [1])

    def test_non_finite_values_raise_instead_of_being_silently_dropped(self) -> None:
        with pytest.raises(ValueError, match="non-finite"):
            compute_error_metrics([1.0, float("nan")], [1.0, 2.0])

    def test_accepts_pandas_series(self) -> None:
        m = compute_error_metrics(pd.Series([2.0, 4.0]), pd.Series([1.0, 5.0]))
        assert m.mae == pytest.approx(1.0)


class TestErrorDistribution:
    def test_over_under_split(self) -> None:
        d = compute_error_distribution([10, -20, 0, 30, -40])
        assert (d.n, d.n_over, d.n_under, d.n_exact) == (5, 2, 2, 1)
        assert d.share_over == pytest.approx(0.4) and d.share_under == pytest.approx(0.4)
        assert d.mean_over_mw == pytest.approx(20.0)
        assert d.mean_under_mw == pytest.approx(30.0)  # magnitude, reported positive
        assert d.max_over_mw == pytest.approx(30.0) and d.max_under_mw == pytest.approx(40.0)

    def test_quantiles_match_numpy_linear_interpolation(self) -> None:
        data = np.arange(-50, 51, dtype=float)  # -50..50
        d = compute_error_distribution(data)
        assert d.signed_p50 == pytest.approx(0.0)
        assert d.signed_p05 == pytest.approx(np.percentile(data, 5))
        assert d.signed_p95 == pytest.approx(np.percentile(data, 95))
        assert d.abs_p90 == pytest.approx(np.percentile(np.abs(data), 90))

    def test_all_over_forecast_has_no_under_stats(self) -> None:
        d = compute_error_distribution([5.0, 10.0])
        assert d.n_under == 0 and d.mean_under_mw is None and d.max_under_mw is None

    def test_empty_distribution_is_unavailable(self) -> None:
        d = compute_error_distribution([])
        assert d.n == 0 and d.signed_p50 is None and d.share_over is None

    def test_non_finite_errors_are_ignored(self) -> None:
        assert compute_error_distribution([1.0, float("nan"), -1.0]).n == 2


class TestCoverage:
    @staticmethod
    def frame(statuses: list[str]) -> pd.DataFrame:
        return pd.DataFrame({"match_status": statuses})

    def test_counts_and_ratio(self) -> None:
        cov = compute_coverage(
            self.frame(
                ["matched"] * 6 + ["missing_forecast"] * 2 + ["missing_actual"] + ["missing_both"]
            )
        )
        assert cov == Coverage(
            expected=10,
            matched=6,
            missing_forecast=2,
            missing_actual=1,
            missing_both=1,
            coverage=0.6,
        )

    def test_empty_frame_has_unavailable_coverage(self) -> None:
        assert compute_coverage(self.frame([])).coverage is None


class TestDataStatus:
    def cov(self, matched: int, expected: int) -> Coverage:
        return Coverage(
            expected, matched, expected - matched, 0, 0, matched / expected if expected else None
        )

    def test_thresholds(self) -> None:
        kw = {"sufficient": 0.98, "partial": 0.90}
        assert data_status(self.cov(100, 100), **kw) == "sufficient"
        assert data_status(self.cov(98, 100), **kw) == "sufficient"
        assert data_status(self.cov(95, 100), **kw) == "partial"
        assert data_status(self.cov(50, 100), **kw) == "insufficient"
        assert data_status(self.cov(0, 100), **kw) == "no_data"
        assert data_status(self.cov(0, 0), **kw) == "no_data"


class TestSkill:
    def test_positive_skill_when_forecast_beats_baseline(self) -> None:
        a = pd.Series([100.0, 100.0])
        s = skill_vs_baseline(pd.Series([90.0, 110.0]), pd.Series([50.0, 150.0]), a)
        assert s["n"] == 2 and s["skill"] == pytest.approx(1 - 10 / 50)

    def test_negative_skill_when_baseline_is_better(self) -> None:
        a = pd.Series([100.0])
        assert skill_vs_baseline(pd.Series([50.0]), pd.Series([90.0]), a)["skill"] < 0  # type: ignore[operator]

    def test_uses_only_rows_where_all_three_are_available(self) -> None:
        f = pd.Series([1.0, 2.0, 3.0])
        b = pd.Series([1.0, np.nan, 3.0])
        a = pd.Series([2.0, 2.0, 2.0])
        assert skill_vs_baseline(f, b, a)["n"] == 2

    def test_perfect_baseline_gives_unavailable_skill(self) -> None:
        a = pd.Series([1.0, 2.0])
        assert skill_vs_baseline(pd.Series([2.0, 3.0]), a.copy(), a)["skill"] is None

    def test_no_common_rows(self) -> None:
        s = skill_vs_baseline(pd.Series([1.0]), pd.Series([np.nan]), pd.Series([1.0]))
        assert s == {"n": 0, "mae_forecast": None, "mae_baseline": None, "skill": None}
