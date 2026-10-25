"""Decision-time sensitivity: the analysis re-run with only the cutoff moved.

The exact fixture publishes, for every delivery interval, 1200 MW at cutoff-6h (03:20), 1100 MW at cutoff-10min
(09:10) and 1010 MW at cutoff+30min (09:50), against an actual of 1000 MW. So the closed-form answer at each
cutoff is known: after 03:20 -> MAE 200; after 09:10 and at the default 09:20 -> 100; after 09:50 -> 10.
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.store.snapshot import write_snapshot
from tests.conftest import exact_frames, make_settings, manifest_for, write_exact_snapshot

Q = {"basis": "decision_date", "from": "2026-01-01", "to": "2026-01-31", "cutoff": "09:20"}
N = 31 * 48


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    settings = make_settings(tmp_path)
    write_exact_snapshot(settings)
    with TestClient(create_app(settings)) as c:
        yield c


def by_cutoff(body: dict) -> dict[str, dict]:  # type: ignore[type-arg]
    return {p["cutoff_local"]: p for p in body["points"]}


def test_every_regular_run_plus_the_selected_cutoff_in_time_order(client: TestClient) -> None:
    body = client.get("/api/cutoff-sensitivity", params=Q).json()
    assert body["run_times_local"] == ["03:20", "09:10", "09:50"]
    assert [p["cutoff_local"] for p in body["points"]] == ["03:20", "09:10", "09:20", "09:50"]
    assert [p["is_selected"] for p in body["points"]] == [False, False, True, False]
    assert [p["is_run_time"] for p in body["points"]] == [True, True, False, True]
    assert body["selected_cutoff"] == "09:20"


def test_each_point_is_the_closed_form_answer_for_its_cutoff(client: TestClient) -> None:
    pts = by_cutoff(client.get("/api/cutoff-sensitivity", params=Q).json())
    assert pts["03:20"]["mae_mw"] == pytest.approx(200.0)
    assert pts["09:10"]["mae_mw"] == pytest.approx(100.0)
    assert pts["09:20"]["mae_mw"] == pytest.approx(100.0)
    assert pts["09:50"]["mae_mw"] == pytest.approx(
        10.0
    )  # the revision published after the default cutoff
    assert pts["09:50"]["bias_mw"] == pytest.approx(10.0)
    assert pts["09:50"]["rmse_mw"] == pytest.approx(10.0)
    for p in pts.values():
        assert p["n"] == N and p["coverage"] == pytest.approx(1.0)


def test_the_selected_point_equals_the_headline_summary(client: TestClient) -> None:
    summary = client.get("/api/summary", params=Q).json()["metrics"]
    selected = next(
        p
        for p in client.get("/api/cutoff-sensitivity", params=Q).json()["points"]
        if p["is_selected"]
    )
    for key in ("n", "mae_mw", "rmse_mw", "bias_mw", "wape"):
        assert selected[key] == pytest.approx(summary[key]), key


def test_which_run_supplied_the_forecast_and_how_old_it_was(client: TestClient) -> None:
    pts = by_cutoff(client.get("/api/cutoff-sensitivity", params=Q).json())
    assert pts["09:20"]["run_used_local"] == "09:10"
    assert pts["09:20"]["median_forecast_age_h"] == pytest.approx(10 / 60)
    assert pts["09:50"]["run_used_local"] == "09:50" and pts["09:50"][
        "median_forecast_age_h"
    ] == pytest.approx(0)
    assert pts["03:20"]["run_used_local"] == "03:20"


def test_choosing_a_cutoff_that_is_a_run_does_not_duplicate_it(client: TestClient) -> None:
    body = client.get("/api/cutoff-sensitivity", params={**Q, "cutoff": "09:50"}).json()
    assert [p["cutoff_local"] for p in body["points"]] == ["03:20", "09:10", "09:50"]
    selected = [p for p in body["points"] if p["is_selected"]]
    assert (
        len(selected) == 1 and selected[0]["is_run_time"] and selected[0]["cutoff_local"] == "09:50"
    )


def test_the_two_readings_of_january_are_never_mixed(client: TestClient) -> None:
    body = client.get("/api/cutoff-sensitivity", params={**Q, "basis": "delivery_date"}).json()
    assert body["analysis"]["basis"] == "delivery_date"
    assert body["analysis"]["delivery_from"] == "2026-01-01"
    assert all(p["n"] == N for p in body["points"])  # delivery 1-31 Jan is also 31 days


def test_a_one_off_publication_is_not_mistaken_for_a_regular_run(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    actuals, forecasts = exact_frames()
    one_day = pd.Timestamp("2026-01-14T12:25:00Z")  # a single off-schedule release
    extra = forecasts[forecasts["publish_utc"].dt.date == one_day.date()].head(1).copy()
    extra["publish_utc"] = one_day
    forecasts = pd.concat([forecasts, extra], ignore_index=True)
    write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest_for(settings))
    with TestClient(create_app(settings)) as c:
        body = c.get("/api/cutoff-sensitivity", params=Q).json()
    assert "12:25" not in body["run_times_local"]
    assert body["run_times_local"] == ["03:20", "09:10", "09:50"]


def test_it_is_cached_and_validated_like_every_other_analytics_endpoint(client: TestClient) -> None:
    first = client.get("/api/cutoff-sensitivity", params=Q)
    again = client.get("/api/cutoff-sensitivity", params=Q)
    assert first.headers["x-cache"] == "MISS" and again.headers["x-cache"] == "HIT"
    assert client.get("/api/cutoff-sensitivity", params={**Q, "cutoff": "9:2"}).status_code == 422
    assert (
        client.get("/api/cutoff-sensitivity", params={**Q, "from": "2025-06-01"}).status_code == 422
    )


def test_without_a_dataset_it_explains_instead_of_failing(tmp_path: Path) -> None:
    with TestClient(create_app(make_settings(tmp_path))) as c:
        r = c.get("/api/cutoff-sensitivity", params=Q)
    assert r.status_code == 503 and r.json()["error"]["code"]


def test_hourly_forecasts_work_the_same_way(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    actuals, forecasts = exact_frames()
    forecasts = forecasts[forecasts["start_utc"].dt.minute == 0].reset_index(drop=True)
    manifest = manifest_for(settings).model_copy(
        update={"quality": {"forecast_profile": {"start_resolution_minutes": 60.0}}}
    )
    write_snapshot(settings.snapshot_dir, actuals, forecasts, manifest)
    with TestClient(create_app(settings)) as c:
        pts = by_cutoff(c.get("/api/cutoff-sensitivity", params=Q).json())
    assert pts["09:50"]["mae_mw"] == pytest.approx(10.0) and pts["09:20"]["n"] == N
