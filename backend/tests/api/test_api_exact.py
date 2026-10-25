"""API integration tests against the closed-form ``exact`` dataset (see conftest)."""

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ACTUAL_MW, ELIGIBLE_MW, POST_CUTOFF_MW

N_DECISION_BASIS = 31 * 48  # 2 Jan .. 1 Feb 2026
N_DELIVERY_BASIS = 31 * 48  # 1 Jan .. 31 Jan 2026


class TestSummary:
    def test_headline_metrics_use_the_decision_time_forecast_not_the_latest_revision(
        self, exact_client: TestClient
    ) -> None:
        body = exact_client.get("/api/summary").json()
        m = body["metrics"]
        assert m["n"] == N_DECISION_BASIS
        assert m["mae_mw"] == pytest.approx(100.0)  # 1100 - 1000, NOT 1010 - 1000
        assert m["rmse_mw"] == pytest.approx(100.0)
        assert m["bias_mw"] == pytest.approx(100.0)  # forecast - actual, positive = over-forecast
        assert m["wape"] == pytest.approx(0.1)
        assert m["mean_forecast_mw"] == pytest.approx(ELIGIBLE_MW)
        assert m["mean_actual_mw"] == pytest.approx(ACTUAL_MW)

    def test_hindsight_comparator_is_reported_separately(self, exact_client: TestClient) -> None:
        hind = exact_client.get("/api/summary").json()["hindsight_latest"]
        assert hind["mae_mw"] == pytest.approx(POST_CUTOFF_MW - ACTUAL_MW)
        assert hind["n"] == N_DECISION_BASIS
        assert "not available" in hind["note"].lower()

    def test_full_coverage_and_sufficient_status(self, exact_client: TestClient) -> None:
        body = exact_client.get("/api/summary").json()
        assert body["coverage"] == {
            "expected": N_DECISION_BASIS, "matched": N_DECISION_BASIS,
            "missing_forecast": 0, "missing_actual": 0, "missing_both": 0, "coverage": 1.0,
        }  # fmt: skip
        assert body["data_status"]["status"] == "sufficient"

    def test_echoes_the_interpretation_used(self, exact_client: TestClient) -> None:
        a = exact_client.get("/api/summary").json()["analysis"]
        assert (a["basis"], a["decision_from"], a["decision_to"]) == (
            "decision_date",
            "2026-01-01",
            "2026-01-31",
        )
        assert (a["delivery_from"], a["delivery_to"]) == ("2026-01-02", "2026-02-01")
        assert a["cutoff_local"] == "09:20" and a["cutoff_timezone"] == "Europe/London"
        assert (
            a["error_convention"] == "forecast_minus_actual"
            and a["forecast_basis"] == "decision_time"
        )

    def test_delivery_basis_is_a_distinct_window_and_never_mixed(
        self, exact_client: TestClient
    ) -> None:
        body = exact_client.get("/api/summary", params={"basis": "delivery_date"}).json()
        a = body["analysis"]
        assert (a["delivery_from"], a["delivery_to"]) == ("2026-01-01", "2026-01-31")
        assert (a["decision_from"], a["decision_to"]) == ("2025-12-31", "2026-01-30")
        assert body["metrics"]["n"] == N_DELIVERY_BASIS

    def test_later_cutoff_selects_the_later_publication(self, exact_client: TestClient) -> None:
        # Publications sit at 03:20, 09:10 and 09:50 UTC on the decision day.
        late = exact_client.get("/api/summary", params={"cutoff": "10:00"}).json()["metrics"]
        assert late["mean_forecast_mw"] == pytest.approx(POST_CUTOFF_MW)  # 09:50 is now eligible
        default = exact_client.get("/api/summary").json()["metrics"]
        assert default["mean_forecast_mw"] == pytest.approx(
            ELIGIBLE_MW
        )  # 09:10 is the latest <= 09:20
        early = exact_client.get("/api/summary", params={"cutoff": "09:00"}).json()["metrics"]
        assert early["mean_forecast_mw"] == pytest.approx(
            1200.0
        )  # only the 03:20 publication is eligible

    def test_perfect_baselines_have_unavailable_skill_not_infinity(
        self, exact_client: TestClient
    ) -> None:
        for baseline in exact_client.get("/api/summary").json()["baselines"]:
            assert baseline["mae_baseline_mw"] == pytest.approx(0.0)
            assert baseline["skill"] is None

    def test_sub_range_only_counts_its_own_days(self, exact_client: TestClient) -> None:
        body = exact_client.get(
            "/api/summary", params={"from": "2026-01-05", "to": "2026-01-11"}
        ).json()
        assert body["metrics"]["n"] == 7 * 48
        assert body["analysis"]["n_delivery_days"] == 7


class TestMissingData:
    def test_missing_actuals_reduce_coverage_and_are_counted(
        self, gappy_client: TestClient
    ) -> None:
        body = gappy_client.get("/api/summary").json()
        cov = body["coverage"]
        assert cov["missing_actual"] > 0 and cov["missing_forecast"] == 0
        assert cov["matched"] + cov["missing_actual"] == cov["expected"]
        assert 0.90 < cov["coverage"] < 0.98  # between the 'partial' and 'sufficient' thresholds
        assert body["data_status"]["status"] == "partial"
        # Metrics are still computed on the matched set only, so the closed-form values are unchanged.
        assert body["metrics"]["mae_mw"] == pytest.approx(100.0)
        assert body["metrics"]["n"] == cov["matched"]

    def test_gaps_surface_as_null_points_never_filled(self, gappy_client: TestClient) -> None:
        points = gappy_client.get("/api/timeseries").json()["points"]
        missing = [p for p in points if p["match_status"] == "missing_actual"]
        assert missing and all(p["actual_mw"] is None and p["error_mw"] is None for p in missing)
        assert all(p["forecast_mw"] == pytest.approx(ELIGIBLE_MW) for p in missing)

    def test_interval_explorer_can_filter_to_the_gaps(self, gappy_client: TestClient) -> None:
        body = gappy_client.get(
            "/api/intervals", params={"status": "missing_actual", "page_size": 500}
        ).json()
        cov = gappy_client.get("/api/summary").json()["coverage"]
        assert body["total"] == cov["missing_actual"]


class TestTimeseriesAndAccuracy:
    def test_timeseries_has_one_point_per_expected_interval_with_distinct_forecast_fields(
        self, exact_client: TestClient
    ) -> None:
        points = exact_client.get(
            "/api/timeseries", params={"from": "2026-01-14", "to": "2026-01-14"}
        ).json()["points"]
        assert len(points) == 48
        p = points[0]
        assert p["forecast_mw"] == pytest.approx(ELIGIBLE_MW)
        assert p["latest_forecast_mw"] == pytest.approx(POST_CUTOFF_MW)
        assert p["forecast_publish_time"] < p["latest_publish_time"]
        assert p["error_mw"] == pytest.approx(100.0)

    def test_accuracy_breakdowns_are_consistent_with_the_headline(
        self, exact_client: TestClient
    ) -> None:
        body = exact_client.get(
            "/api/accuracy", params={"from": "2026-01-05", "to": "2026-01-11"}
        ).json()
        assert len(body["daily"]) == 7 and len(body["by_slot"]) == 48
        assert sum(d["n"] for d in body["daily"]) == body["metrics"]["n"]
        assert sum(x["n"] for x in body["by_daypart"]) == body["metrics"]["n"]
        assert sum(b["count"] for b in body["histogram"]["bins"]) == body["metrics"]["n"]
        assert all(d["mae_mw"] == pytest.approx(100.0) for d in body["daily"])
        # Every error is +100 -> 100 % over-forecast.
        dist = body["error_distribution"]
        assert dist["share_over"] == 1.0 and dist["n_under"] == 0 and dist["mean_under_mw"] is None
        # Decision dates 5..11 Jan map to delivery dates 6..12 Jan.
        assert [d["decision_date"] for d in body["daily"]] == [
            f"2026-01-{day:02d}" for day in range(5, 12)
        ]
        assert [d["delivery_date"] for d in body["daily"]] == [
            f"2026-01-{day:02d}" for day in range(6, 13)
        ]

    def test_daypart_split_is_32_day_and_16_night_slots(self, exact_client: TestClient) -> None:
        parts = {
            p["daypart"]: p
            for p in exact_client.get(
                "/api/accuracy", params={"from": "2026-01-05", "to": "2026-01-05"}
            ).json()["by_daypart"]
        }
        assert parts["day"]["n"] == 32 and parts["night"]["n"] == 16


class TestIntervals:
    def test_pagination_and_sorting(self, exact_client: TestClient) -> None:
        r = exact_client.get(
            "/api/intervals",
            params={"page": 2, "page_size": 10, "sort_by": "start_time", "sort_dir": "desc"},
        ).json()
        assert r["total"] == N_DECISION_BASIS and r["page"] == 2 and r["total_pages"] == 149
        assert len(r["items"]) == 10
        starts = [i["start_time"] for i in r["items"]]
        assert starts == sorted(starts, reverse=True)
        assert r["items"][0]["start_time"] < "2026-02-01T23:30:00Z"

    def test_page_is_clamped_to_the_last_page(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/intervals", params={"page": 99999, "page_size": 500}).json()
        assert r["page"] == r["total_pages"] and len(r["items"]) > 0

    def test_direction_filter_and_min_abs_error(self, exact_client: TestClient) -> None:
        assert (
            exact_client.get("/api/intervals", params={"direction": "under"}).json()["total"] == 0
        )
        assert (
            exact_client.get("/api/intervals", params={"direction": "over"}).json()["total"]
            == N_DECISION_BASIS
        )
        assert (
            exact_client.get("/api/intervals", params={"min_abs_error": 100.5}).json()["total"] == 0
        )
        assert (
            exact_client.get("/api/intervals", params={"min_abs_error": 100}).json()["total"]
            == N_DECISION_BASIS
        )

    def test_text_search(self, exact_client: TestClient) -> None:
        r = exact_client.get("/api/intervals", params={"q": "2026-01-15 08:30"}).json()
        assert r["total"] == 1 and r["items"][0]["local_label"] == "2026-01-15 08:30"
        assert exact_client.get("/api/intervals", params={"q": "zzz"}).json()["total"] == 0

    def test_row_exposes_the_cutoff_and_publication_times(self, exact_client: TestClient) -> None:
        row = exact_client.get("/api/intervals", params={"q": "2026-01-15 08:30"}).json()["items"][
            0
        ]
        assert row["decision_cutoff_time"] == "2026-01-14T09:20:00Z"
        assert row["forecast_publish_time"] == "2026-01-14T09:10:00Z"
        assert row["forecast_age_h"] == pytest.approx(10 / 60)
        assert row["settlement_period"] == 18

    def test_csv_export_matches_filters_and_labels_the_sign_convention(
        self, exact_client: TestClient
    ) -> None:
        r = exact_client.get(
            "/api/intervals/export", params={"from": "2026-01-14", "to": "2026-01-14"}
        )
        assert r.headers["content-type"].startswith("text/csv")
        assert "attachment" in r.headers["content-disposition"]
        lines = r.text.strip().splitlines()
        assert len(lines) == 1 + 48
        assert "error_mw_forecast_minus_actual" in lines[0]


class TestVintagesAndBrief:
    def test_vintages_mark_the_single_eligible_selection(self, exact_client: TestClient) -> None:
        r = exact_client.get(
            "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00Z"}
        ).json()
        assert r["n_vintages"] == 3 and r["n_eligible"] == 2
        flags = [(v["forecast_mw"], v["eligible"], v["selected"]) for v in r["vintages"]]
        assert flags == [(1200.0, True, False), (1100.0, True, True), (1010.0, False, False)]
        assert r["selected"]["forecast_mw"] == 1100.0 and r["latest"]["forecast_mw"] == 1010.0
        assert r["actual_mw"] == ACTUAL_MW and r["explanation"] is None
        assert r["vintages"][0]["minutes_from_cutoff"] < 0 < r["vintages"][2]["minutes_from_cutoff"]

    def test_vintages_accept_offset_timestamps(self, exact_client: TestClient) -> None:
        r = exact_client.get(
            "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00+00:00"}
        )
        assert r.status_code == 200

    def test_vintages_outside_delivery_coverage_are_not_found(
        self, exact_client: TestClient
    ) -> None:
        # 31 Dec 2025 is inside the actuals history but outside delivery coverage -> 404 (nothing fabricated).
        assert (
            exact_client.get(
                "/api/forecast-vintages", params={"start": "2025-12-31T08:30:00Z"}
            ).status_code
            == 404
        )

    def test_interval_without_any_publication_returns_an_explanation_instead_of_an_empty_chart(
        self, settings
    ) -> None:  # type: ignore[no-untyped-def]
        import pandas as pd

        from app.main import create_app
        from app.store.snapshot import write_snapshot
        from tests.conftest import exact_frames, manifest_for

        actuals, forecasts = exact_frames()
        target = pd.Timestamp("2026-01-15T08:30:00Z")
        forecasts = forecasts[forecasts["start_utc"] != target]
        write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest_for(settings))
        with TestClient(create_app(settings)) as client:
            r = client.get(
                "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00Z"}
            ).json()
        assert r["n_vintages"] == 0 and r["vintages"] == [] and r["selected"] is None
        assert "No WINDFOR publication is stored" in r["explanation"]
        assert r["actual_mw"] == ACTUAL_MW  # the actual is still shown

    def test_interval_whose_publications_all_came_after_the_cutoff_has_no_selection(
        self, settings
    ) -> None:  # type: ignore[no-untyped-def]
        import pandas as pd

        from app.main import create_app
        from app.store.snapshot import write_snapshot
        from tests.conftest import exact_frames, manifest_for

        actuals, forecasts = exact_frames()
        target = pd.Timestamp("2026-01-15T08:30:00Z")
        cutoff = pd.Timestamp("2026-01-14T09:20:00Z")
        keep = (forecasts["start_utc"] != target) | (forecasts["publish_utc"] > cutoff)
        write_snapshot(settings.snapshot_dir, actuals, forecasts[keep], manifest_for(settings))
        with TestClient(create_app(settings)) as client:
            r = client.get(
                "/api/forecast-vintages", params={"start": "2026-01-15T08:30:00Z"}
            ).json()
            tl = client.get(
                "/api/timeseries", params={"from": "2026-01-14", "to": "2026-01-14"}
            ).json()["points"]
        assert r["n_vintages"] == 1 and r["n_eligible"] == 0 and r["selected"] is None
        assert "released after" in r["explanation"]
        gap = next(p for p in tl if p["start_time"] == "2026-01-15T08:30:00Z")
        assert gap["match_status"] == "missing_forecast" and gap["forecast_mw"] is None
        assert (
            gap["latest_forecast_mw"] == POST_CUTOFF_MW
        )  # hindsight exists but is never used as a stand-in

    def test_decision_brief_describes_the_forecast_visible_at_the_cutoff(
        self, exact_client: TestClient
    ) -> None:
        b = exact_client.get("/api/decision-brief", params={"decision_date": "2026-01-14"}).json()
        assert (b["decision_date"], b["delivery_date"]) == ("2026-01-14", "2026-01-15")
        assert b["cutoff_time"] == "2026-01-14T09:20:00Z"
        fs = b["forecast_set"]
        assert fs["n_intervals"] == fs["n_with_forecast"] == 48 and fs["distinct_publications"] == 1
        assert fs["mean_mw"] == pytest.approx(ELIGIBLE_MW)
        assert fs["energy_mwh"] == pytest.approx(ELIGIBLE_MW * 0.5 * 48)
        assert b["hindsight"]["mae_mw"] == pytest.approx(100.0)
        assert len(b["points"]) == 48 and b["points"][0]["slot"] == "00:00"


class TestMetadataAndSystem:
    def test_metadata_describes_provenance_windows_and_thresholds(
        self, exact_client: TestClient
    ) -> None:
        m = exact_client.get("/api/metadata").json()
        assert m["data_available"] is True and m["provenance"]["is_synthetic"] is False
        assert [b["id"] for b in m["bases"]] == ["decision_date", "delivery_date"]
        assert m["default_cutoff"] == "09:20" and m["unit"] == "MW"
        assert (
            m["delivery_coverage_from"] == "2026-01-01"
            and m["delivery_coverage_to"] == "2026-02-01"
        )
        assert {p["value"] for p in m["cutoff_presets"]} >= {"09:20", "09:50"}
        assert "forecast - actual" in m["sign_convention"]
        assert "Elexon" in m["provenance"]["attribution"]

    def test_health(self, exact_client: TestClient) -> None:
        assert exact_client.get("/api/health").json() == {
            "status": "ok",
            "version": "0.1.0",
            "data_loaded": True,
        }

    def test_openapi_documents_every_endpoint(self, exact_client: TestClient) -> None:
        paths = exact_client.get("/api/openapi.json").json()["paths"]
        for path in ("/api/health", "/api/metadata", "/api/summary", "/api/timeseries", "/api/accuracy",
                     "/api/intervals", "/api/intervals/export", "/api/forecast-vintages", "/api/decision-brief"):  # fmt: skip
            assert path in paths
        assert exact_client.get("/api/docs").status_code == 200

    def test_cached_and_uncached_results_are_identical(self, exact_client: TestClient) -> None:
        first = exact_client.get(
            "/api/summary", params={"from": "2026-01-03", "to": "2026-01-09"}
        ).json()
        second = exact_client.get(
            "/api/summary", params={"from": "2026-01-03", "to": "2026-01-09"}
        ).json()
        assert first == second
