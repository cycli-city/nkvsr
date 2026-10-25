"""Contract tests against RECORDED REAL Elexon responses (not synthetic fixtures).

``tests/fixtures/real`` holds one delivery day (2026-01-15, UTC == London in January) exactly as the live
API returned it on 2026-10-25 (see that folder's README for the queries). The tests pin down:

* the real payload shape is accepted by the contract check and the normalisers;
* the facts the product's rules depend on, as observed in that recording - hourly forecast start times,
  the publication times around the 09:20 cutoff, and what each rule therefore selects.

They assert properties of a frozen recording, not promises about what Elexon will publish tomorrow; if the
upstream shape changes, ``app.cli verify-upstream`` is the tool that reports it.
"""

import json
from datetime import date, time
from pathlib import Path

import pandas as pd
import pytest

from app.domain.matching import build_matched_frame
from app.domain.vintage import resolve_block_minutes
from app.elexon.contract import check_contract, unwrap_records
from app.elexon.normalize import normalize_actuals, normalize_forecasts, profile_forecasts

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "real"
DAY = date(2026, 1, 15)


def load(name: str) -> object:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture(scope="module")
def actuals() -> pd.DataFrame:
    records = unwrap_records(load("fuelhh_2026-01-15.json"), "FUELHH")
    check_contract(records, "FUELHH")
    frame, report = normalize_actuals(records)
    assert report.total_dropped == 0
    return frame


@pytest.fixture(scope="module")
def forecasts() -> pd.DataFrame:
    records = unwrap_records(load("windfor_for_2026-01-15.json"), "WINDFOR")
    check_contract(records, "WINDFOR")
    frame, report = normalize_forecasts(records)
    assert report.total_dropped == 0
    return frame


def matched(
    actuals: pd.DataFrame, forecasts: pd.DataFrame, *, cutoff: time = time(9, 20), block: int = 60
) -> pd.DataFrame:
    return build_matched_frame(
        delivery_from=DAY,
        delivery_to=DAY,
        cutoff_local=cutoff,
        actuals=actuals,
        forecasts=forecasts,
        forecast_block_minutes=block,
    )


def test_real_payloads_pass_the_contract_and_normalise_without_loss(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    assert len(actuals) == 48 and actuals["start_utc"].is_unique
    assert len(forecasts) == 192
    assert not forecasts.duplicated(["start_utc", "publish_utc"]).any()


def test_actuals_are_plausible_megawatts(actuals: pd.DataFrame) -> None:
    # GB wind output is thousands of MW; a unit mix-up (GW, or MWh per half-hour) would fall outside this.
    assert actuals["actual_mw"].between(1_000, 30_000).all()


def test_forecasts_are_hourly_while_actuals_are_half_hourly(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    assert (forecasts["start_utc"].dt.minute == 0).all()
    assert (actuals["start_utc"].dt.minute.isin([0, 30])).all()
    assert (actuals["start_utc"].dt.minute == 30).sum() == 24
    assert profile_forecasts(forecasts)["start_resolution_minutes"] == 60.0
    assert resolve_block_minutes("hold", 60.0) == 60


def test_eight_publications_were_made_on_the_day_before(forecasts: pd.DataFrame) -> None:
    times = sorted(forecasts["publish_utc"].dt.strftime("%H:%M").unique())
    assert times == ["02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30"]


def test_at_the_default_cutoff_the_0730_publication_is_the_latest_available(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    frame = matched(actuals, forecasts)
    assert (frame["match_status"] == "matched").all()
    assert (frame["publish_utc"] == pd.Timestamp("2026-01-14T07:30:00Z")).all()
    # 09:30 was published 10 minutes after the 09:20 cutoff, so it must not have been used...
    assert (frame["publish_utc"] < pd.Timestamp("2026-01-14T09:30:00Z")).all()
    # ...whereas the hindsight series does see the last publication of the day.
    assert (frame["latest_publish_utc"] == pd.Timestamp("2026-01-14T22:30:00Z")).all()


def test_the_gate_closure_presets_select_different_publications(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    epex = matched(actuals, forecasts, cutoff=time(9, 20))
    n2ex = matched(actuals, forecasts, cutoff=time(9, 50))
    assert (epex["publish_utc"].dt.strftime("%H:%M") == "07:30").all()
    assert (n2ex["publish_utc"].dt.strftime("%H:%M") == "09:30").all()
    assert not epex["forecast_mw"].equals(n2ex["forecast_mw"])


def test_each_half_hour_carries_its_own_hours_forecast_value(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    frame = matched(actuals, forecasts)
    used = forecasts[forecasts["publish_utc"] == pd.Timestamp("2026-01-14T07:30:00Z")].set_index(
        "start_utc"
    )["forecast_mw"]
    for row in frame.itertuples():
        hour = row.start_utc.floor("60min")
        assert row.forecast_mw == used[hour]
        assert row.forecast_for_utc == hour


def test_exact_matching_on_the_real_grid_scores_only_whole_hours(
    actuals: pd.DataFrame, forecasts: pd.DataFrame
) -> None:
    frame = matched(actuals, forecasts, block=30)
    assert frame["match_status"].value_counts().to_dict() == {"matched": 24, "missing_forecast": 24}
    assert (frame.loc[frame["match_status"] == "matched", "start_utc"].dt.minute == 0).all()
