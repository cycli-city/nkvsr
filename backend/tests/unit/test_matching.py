from datetime import date, time

import numpy as np
import pandas as pd
import pytest

from app.domain import timeutil as tu
from app.domain.matching import build_matched_frame, expected_intervals, matched_only
from app.domain.vintage import InvariantError
from tests.factories import DEFAULT_CUTOFF, cutoff_for, make_actuals, make_forecasts, ts

DAY = date(2026, 1, 15)


def build(actuals: pd.DataFrame, forecasts: pd.DataFrame, **kw) -> pd.DataFrame:  # type: ignore[no-untyped-def]
    return build_matched_frame(
        delivery_from=kw.pop("delivery_from", DAY),
        delivery_to=kw.pop("delivery_to", DAY),
        cutoff_local=kw.pop("cutoff_local", DEFAULT_CUTOFF),
        actuals=actuals,
        forecasts=forecasts,
        **kw,
    )


def test_one_row_per_expected_interval_even_with_many_vintages() -> None:
    pubs = [(ts("2026-01-13T00:00:00Z") + pd.Timedelta(hours=h), 100.0 + h) for h in range(48)]
    frame = build(make_actuals(DAY), make_forecasts(DAY, pubs))
    assert len(frame) == 48
    assert frame["start_utc"].is_unique
    assert (frame["match_status"] == "matched").all()


def test_decision_time_forecast_differs_from_latest_published() -> None:
    fc = make_forecasts(
        DAY,
        [(ts("2026-01-14T09:00:00Z"), 200.0), (ts("2026-01-15T05:00:00Z"), 900.0)],
    )
    frame = build(make_actuals(DAY, 1000.0), fc)
    assert (frame["forecast_mw"] == 200.0).all()
    assert (frame["latest_forecast_mw"] == 900.0).all()
    # Metrics inputs use the decision-time forecast: error = 200 - 1000, not 900 - 1000.
    assert (frame["error_mw"] == -800.0).all()


def test_error_sign_is_forecast_minus_actual() -> None:
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 1200.0)])
    frame = build(make_actuals(DAY, 1000.0), fc)
    assert (frame["error_mw"] == 200.0).all()  # over-forecast is positive
    assert (frame["abs_error_mw"] == 200.0).all()


def test_missing_forecast_and_missing_actual_statuses() -> None:
    starts = tu.delivery_day_intervals(DAY)
    actuals = make_actuals(DAY, 500.0)
    actuals = actuals.iloc[1:].reset_index(drop=True)  # first interval has no actual
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 400.0)])
    fc = fc[fc["start_utc"] != starts[1]]  # second interval has no forecast
    fc = fc[
        fc["start_utc"] != starts[0]
    ].copy()  # first interval also has no forecast -> missing_both? (no actual)
    frame = build(actuals, fc)

    status = frame.set_index("start_utc")["match_status"]
    assert status[starts[0]] == "missing_both"
    assert status[starts[1]] == "missing_forecast"
    assert status[starts[2]] == "matched"
    assert (frame.loc[frame["match_status"] != "matched", "error_mw"].isna()).all()


def test_missing_actual_only() -> None:
    starts = tu.delivery_day_intervals(DAY)
    actuals = make_actuals(DAY, 500.0).iloc[1:]
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 400.0)])
    frame = build(actuals, fc)
    assert frame.set_index("start_utc")["match_status"][starts[0]] == "missing_actual"


def test_matched_only_returns_just_matched_rows() -> None:
    actuals = make_actuals(DAY, 500.0).iloc[2:]
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 400.0)])
    frame = build(actuals, fc)
    assert len(matched_only(frame)) == 46


def test_duplicate_actuals_are_rejected_not_silently_summed() -> None:
    actuals = pd.concat([make_actuals(DAY, 500.0), make_actuals(DAY, 600.0)], ignore_index=True)
    with pytest.raises(InvariantError):
        build(actuals, make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 400.0)]))


def test_as_of_excludes_intervals_not_yet_finished() -> None:
    as_of = ts("2026-01-15T12:00:00Z")
    frame = build(
        make_actuals(DAY, 500.0),
        make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 1.0)]),
        as_of=as_of,
    )
    assert len(frame) == 24  # 00:00-11:30 starts end by 12:00
    assert frame["start_utc"].max() == ts("2026-01-15T11:30:00Z")


def test_expected_interval_counts_on_dst_days() -> None:
    assert len(expected_intervals(date(2026, 3, 29), date(2026, 3, 29), time(9, 20))) == 46
    assert len(expected_intervals(date(2026, 10, 25), date(2026, 10, 25), time(9, 20))) == 50


def test_cutoff_is_previous_local_day_for_every_row() -> None:
    frame = expected_intervals(DAY, DAY, time(9, 20))
    assert (frame["cutoff_utc"] == cutoff_for(DAY)).all()


def test_daypart_boundaries_are_07_and_23_local() -> None:
    frame = expected_intervals(DAY, DAY, time(9, 20)).set_index("slot")
    assert frame.loc["06:30", "daypart"] == "night"
    assert frame.loc["07:00", "daypart"] == "day"
    assert frame.loc["22:30", "daypart"] == "day"
    assert frame.loc["23:00", "daypart"] == "night"


def test_forecast_age_and_lead_time_hours() -> None:
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:20:00Z"), 1.0)])
    frame = build(make_actuals(DAY, 1.0), fc)
    assert np.isclose(frame["forecast_age_h"].iloc[0], 1.0)  # cutoff 09:20 - publish 08:20
    first_start = frame["start_utc"].iloc[0]  # 2026-01-15 00:00Z
    assert np.isclose(
        frame["lead_time_h"].iloc[0],
        (first_start - ts("2026-01-14T08:20:00Z")) / pd.Timedelta(hours=1),
    )


def test_custom_cutoff_changes_the_selected_vintage() -> None:
    fc = make_forecasts(
        DAY,
        [(ts("2026-01-14T09:00:00Z"), 1.0), (ts("2026-01-14T09:40:00Z"), 2.0)],
    )
    early = build(make_actuals(DAY, 1.0), fc, cutoff_local=time(9, 20))
    late = build(make_actuals(DAY, 1.0), fc, cutoff_local=time(9, 50))
    assert (early["forecast_mw"] == 1.0).all()
    assert (late["forecast_mw"] == 2.0).all()
