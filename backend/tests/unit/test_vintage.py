"""The most important rule in the product: only forecasts published at/before the cutoff may be used."""

from datetime import date

import pandas as pd

from app.domain import timeutil as tu
from app.domain.vintage import latest_published, list_vintages, select_at_cutoff
from tests.factories import cutoff_for, day_starts, make_forecasts, ts

DAY = date(2026, 1, 15)
CUTOFF = cutoff_for(DAY)  # 2026-01-14 09:20Z


def intervals_for(day: date = DAY) -> pd.DataFrame:
    starts = day_starts(day)
    return pd.DataFrame({"start_utc": starts, "cutoff_utc": cutoff_for(day)})


def test_cutoff_under_test_is_the_expected_instant() -> None:
    assert ts("2026-01-14T09:20:00Z") == CUTOFF


def test_selects_latest_publication_at_or_before_cutoff() -> None:
    fc = make_forecasts(
        DAY,
        [
            (ts("2026-01-14T03:00:00Z"), 100.0),
            (ts("2026-01-14T09:00:00Z"), 200.0),  # latest eligible
            (ts("2026-01-14T10:00:00Z"), 300.0),  # after cutoff -> must be ignored
        ],
    )
    chosen = select_at_cutoff(intervals_for(), fc)
    assert (chosen["forecast_mw"] == 200.0).all()
    assert (chosen["publish_utc"] == ts("2026-01-14T09:00:00Z")).all()


def test_forecast_published_after_cutoff_is_never_selected() -> None:
    fc = make_forecasts(DAY, [(ts("2026-01-14T09:20:01Z"), 999.0)])
    chosen = select_at_cutoff(intervals_for(), fc)
    assert chosen["forecast_mw"].isna().all()
    assert chosen["publish_utc"].isna().all()


def test_publication_exactly_at_cutoff_is_eligible() -> None:
    fc = make_forecasts(DAY, [(CUTOFF, 555.0), (CUTOFF + pd.Timedelta(seconds=1), 1.0)])
    chosen = select_at_cutoff(intervals_for(), fc)
    assert (chosen["forecast_mw"] == 555.0).all()


def test_many_revisions_do_not_inflate_row_count() -> None:
    pubs = [(ts("2026-01-13T00:00:00Z") + pd.Timedelta(hours=h), float(h)) for h in range(0, 60)]
    fc = make_forecasts(DAY, pubs)
    assert len(fc) == 48 * 60
    chosen = select_at_cutoff(intervals_for(), fc)
    assert len(chosen) == 48


def test_exact_duplicate_publications_are_collapsed_keeping_the_last() -> None:
    base = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 100.0)])
    dup = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 150.0)])
    chosen = select_at_cutoff(intervals_for(), pd.concat([base, dup], ignore_index=True))
    assert len(chosen) == 48
    assert (chosen["forecast_mw"] == 150.0).all()


def test_result_is_aligned_to_input_order_even_if_unsorted() -> None:
    iv = intervals_for().iloc[::-1].reset_index(drop=True)  # reverse order
    fc = make_forecasts(DAY, [(ts("2026-01-14T08:00:00Z"), 1.0)])
    fc.loc[fc["start_utc"] == iv.loc[0, "start_utc"], "forecast_mw"] = 42.0
    chosen = select_at_cutoff(iv, fc)
    assert chosen.loc[0, "forecast_mw"] == 42.0
    assert (chosen.loc[1:, "forecast_mw"] == 1.0).all()


def test_forecasts_for_other_delivery_intervals_are_not_borrowed() -> None:
    iv = intervals_for().head(2)
    fc = pd.DataFrame(
        {
            "start_utc": [iv.loc[0, "start_utc"]],
            "publish_utc": [ts("2026-01-14T08:00:00Z")],
            "forecast_mw": [123.0],
        }
    )
    chosen = select_at_cutoff(iv, fc)
    assert chosen.loc[0, "forecast_mw"] == 123.0
    assert pd.isna(chosen.loc[1, "forecast_mw"])


def test_each_interval_uses_its_own_cutoff_across_days() -> None:
    d1, d2 = date(2026, 1, 15), date(2026, 1, 16)
    iv = pd.concat([intervals_for(d1).head(1), intervals_for(d2).head(1)], ignore_index=True)
    fc = pd.DataFrame(
        {
            "start_utc": [iv.loc[0, "start_utc"]] * 2 + [iv.loc[1, "start_utc"]] * 2,
            "publish_utc": [ts("2026-01-14T09:00:00Z"), ts("2026-01-14T12:00:00Z")] * 2,
            "forecast_mw": [1.0, 2.0, 3.0, 4.0],
        }
    )
    chosen = select_at_cutoff(iv, fc)
    # d1 cutoff 14 Jan 09:20 -> only the 09:00 publication; d2 cutoff 15 Jan 09:20 -> the 12:00 one.
    assert chosen["forecast_mw"].tolist() == [1.0, 4.0]


def test_empty_forecasts_yield_all_missing() -> None:
    empty = pd.DataFrame({"start_utc": [], "publish_utc": [], "forecast_mw": []})
    chosen = select_at_cutoff(intervals_for(), empty)
    assert len(chosen) == 48 and chosen["forecast_mw"].isna().all()


def test_latest_published_is_hindsight_and_includes_post_cutoff_revisions() -> None:
    fc = make_forecasts(
        DAY,
        [(ts("2026-01-14T09:00:00Z"), 200.0), (ts("2026-01-15T06:00:00Z"), 777.0)],
    )
    latest = latest_published(fc, intervals_for()["start_utc"])
    assert (latest["latest_forecast_mw"] == 777.0).all()
    assert (latest["latest_publish_utc"] == ts("2026-01-15T06:00:00Z")).all()
    assert len(latest) == 48


def test_list_vintages_marks_eligibility_and_single_selected() -> None:
    start = tu.delivery_day_intervals(DAY)[10]
    fc = make_forecasts(
        DAY,
        [
            (ts("2026-01-13T12:00:00Z"), 10.0),
            (ts("2026-01-14T09:00:00Z"), 20.0),
            (ts("2026-01-14T09:30:00Z"), 30.0),
        ],
    )
    vint = list_vintages(fc, start, CUTOFF)
    assert vint["eligible"].tolist() == [True, True, False]
    assert vint["selected"].tolist() == [False, True, False]
    assert vint.loc[vint["selected"], "forecast_mw"].iloc[0] == 20.0
    assert (
        vint["lead_time_h"].iloc[0] > vint["lead_time_h"].iloc[-1]
    )  # older publication => longer lead


def test_list_vintages_with_no_eligible_publication_selects_nothing() -> None:
    start = tu.delivery_day_intervals(DAY)[0]
    fc = make_forecasts(DAY, [(ts("2026-01-14T10:00:00Z"), 1.0)])
    vint = list_vintages(fc, start, CUTOFF)
    assert not vint["selected"].any()
