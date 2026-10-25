"""Hourly WINDFOR vs half-hourly FUELHH.

Live inspection (docs/generated/elexon-verification.md) showed WINDFOR ``startTime`` on whole hours only.
These tests pin down how a half-hour is mapped onto the forecast block that contains it, and - just as
important - what must NOT happen: no interpolation, no borrowing from the next hour, no use of a
publication made after the cutoff.
"""

from datetime import date

import pandas as pd
import pytest

from app.domain.matching import build_matched_frame
from app.domain.vintage import (
    forecast_block_starts,
    latest_published,
    list_vintages,
    resolve_block_minutes,
    select_at_cutoff,
)
from tests.factories import DEFAULT_CUTOFF, cutoff_for, day_starts, make_actuals, ts

DAY = date(2026, 1, 15)
CUTOFF = cutoff_for(DAY)  # 2026-01-14 09:20Z


def hourly(
    publications: list[tuple[pd.Timestamp, float]], *, value_is_hour: bool = False
) -> pd.DataFrame:
    """Forecast rows on whole hours only, like the live WINDFOR feed.

    ``value_is_hour`` makes each forecast equal to its own hour-of-day, so a wrong hour is visible.
    """
    rows = []
    for start in day_starts(DAY):
        if start.minute != 0:
            continue
        for publish, value in publications:
            rows.append((start, publish, float(start.hour) if value_is_hour else value))
    return pd.DataFrame(rows, columns=["start_utc", "publish_utc", "forecast_mw"])


def intervals() -> pd.DataFrame:
    return pd.DataFrame({"start_utc": day_starts(DAY), "cutoff_utc": CUTOFF})


class TestResolveBlockMinutes:
    @pytest.mark.parametrize(
        ("alignment", "observed", "expected"),
        [
            ("hold", 60.0, 60),
            ("hold", 30.0, 30),
            ("hold", None, 30),  # unknown resolution: never assume a hold
            ("exact", 60.0, 30),  # strict mode never holds
            ("hold", 120.0, 30),  # longer blocks would be a modelling claim we do not make
            ("hold", 45.0, 30),
        ],
    )
    def test_cases(self, alignment: str, observed: float | None, expected: int) -> None:
        assert resolve_block_minutes(alignment, observed) == expected  # type: ignore[arg-type]


class TestBlockStarts:
    def test_hour_blocks_floor_the_half_hour(self) -> None:
        s = pd.Series([ts("2026-01-15T08:00:00Z"), ts("2026-01-15T08:30:00Z")])
        out = forecast_block_starts(s, 60)
        assert list(out) == [ts("2026-01-15T08:00:00Z")] * 2

    def test_half_hour_blocks_are_the_identity(self) -> None:
        s = pd.Series([ts("2026-01-15T08:30:00Z")])
        assert list(forecast_block_starts(s, 30)) == [ts("2026-01-15T08:30:00Z")]

    def test_unsupported_block_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="block_minutes"):
            forecast_block_starts(pd.Series([ts("2026-01-15T08:00:00Z")]), 45)


class TestSelectAtCutoffHeld:
    def test_every_half_hour_gets_the_forecast_of_its_hour(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 777.0)])
        chosen = select_at_cutoff(intervals(), fc, block_minutes=60)
        assert chosen["forecast_mw"].notna().all()
        assert (chosen["forecast_mw"] == 777.0).all()

    def test_second_half_hour_never_borrows_the_next_hour(self) -> None:
        # forecast value == hour-of-day: 08:30 must carry 8, not 9 (that would be look-ahead).
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 0.0)], value_is_hour=True)
        out = select_at_cutoff(intervals(), fc, block_minutes=60)
        by_start = pd.Series(out["forecast_mw"].to_numpy(), index=day_starts(DAY))
        assert by_start[ts("2026-01-15T08:00:00Z")] == 8.0
        assert by_start[ts("2026-01-15T08:30:00Z")] == 8.0
        assert by_start[ts("2026-01-15T09:00:00Z")] == 9.0

    def test_reports_which_block_the_value_refers_to(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 1.0)])
        out = select_at_cutoff(intervals(), fc, block_minutes=60)
        starts = day_starts(DAY)
        for start, block in zip(starts, out["forecast_start_utc"], strict=True):
            assert block == start.floor("60min")

    def test_publication_after_cutoff_is_not_used_even_when_held(self) -> None:
        fc = hourly([(ts("2026-01-14T07:30:00Z"), 200.0), (ts("2026-01-14T09:30:00Z"), 900.0)])
        chosen = select_at_cutoff(intervals(), fc, block_minutes=60)
        assert (chosen["forecast_mw"] == 200.0).all()
        assert (chosen["publish_utc"] == ts("2026-01-14T07:30:00Z")).all()

    def test_an_hour_with_no_forecast_leaves_both_halves_missing_not_interpolated(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 5.0)])
        fc = fc[fc["start_utc"] != ts("2026-01-15T10:00:00Z")]
        out = select_at_cutoff(intervals(), fc, block_minutes=60)
        by_start = pd.Series(out["forecast_mw"].to_numpy(), index=day_starts(DAY))
        assert pd.isna(by_start[ts("2026-01-15T10:00:00Z")])
        assert pd.isna(by_start[ts("2026-01-15T10:30:00Z")])
        assert by_start[ts("2026-01-15T09:30:00Z")] == 5.0  # neighbours untouched

    def test_many_revisions_still_give_one_row_per_interval(self) -> None:
        pubs = [(ts("2026-01-13T00:00:00Z") + pd.Timedelta(hours=h), float(h)) for h in range(60)]
        out = select_at_cutoff(intervals(), hourly(pubs), block_minutes=60)
        assert len(out) == 48


class TestSelectAtCutoffExact:
    def test_default_block_only_matches_identical_start_times(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 777.0)])
        out = select_at_cutoff(intervals(), fc)  # block_minutes defaults to 30
        starts = day_starts(DAY)
        on_hour = [s.minute == 0 for s in starts]
        assert out["forecast_mw"].notna().to_numpy().tolist() == on_hour


class TestLatestPublishedHeld:
    def test_hindsight_uses_the_same_block_as_the_decision_time_forecast(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 1.0), (ts("2026-01-15T03:00:00Z"), 2.0)])
        latest = latest_published(fc, day_starts(DAY).to_series(), block_minutes=60)
        assert latest["latest_forecast_mw"].notna().all()
        assert (latest["latest_forecast_mw"] == 2.0).all()

    def test_exact_block_leaves_off_hour_starts_missing(self) -> None:
        fc = hourly([(ts("2026-01-14T08:00:00Z"), 1.0)])
        latest = latest_published(fc, day_starts(DAY).to_series())
        assert int(latest["latest_forecast_mw"].isna().sum()) == 24


class TestListVintagesHeld:
    def fc(self) -> pd.DataFrame:
        return hourly(
            [
                (ts("2026-01-14T03:00:00Z"), 100.0),
                (ts("2026-01-14T07:30:00Z"), 200.0),
                (ts("2026-01-14T09:30:00Z"), 300.0),
            ]
        )

    def test_half_hour_lists_the_publications_of_its_hour(self) -> None:
        rows = list_vintages(self.fc(), ts("2026-01-15T08:30:00Z"), CUTOFF, block_minutes=60)
        assert rows["forecast_mw"].tolist() == [100.0, 200.0, 300.0]
        assert rows["eligible"].tolist() == [True, True, False]
        assert rows["selected"].tolist() == [False, True, False]

    def test_lead_time_is_measured_to_the_selected_half_hour_not_the_block(self) -> None:
        rows = list_vintages(self.fc(), ts("2026-01-15T08:30:00Z"), CUTOFF, block_minutes=60)
        expected = (ts("2026-01-15T08:30:00Z") - ts("2026-01-14T07:30:00Z")) / pd.Timedelta(hours=1)
        assert rows.loc[1, "lead_time_h"] == pytest.approx(expected)

    def test_exact_block_has_nothing_for_an_off_hour_start(self) -> None:
        rows = list_vintages(self.fc(), ts("2026-01-15T08:30:00Z"), CUTOFF)
        assert rows.empty


class TestMatchedFrame:
    def build(self, block: int) -> pd.DataFrame:
        return build_matched_frame(
            delivery_from=DAY,
            delivery_to=DAY,
            cutoff_local=DEFAULT_CUTOFF,
            actuals=make_actuals(DAY, 1000.0),
            forecasts=hourly([(ts("2026-01-14T07:30:00Z"), 1100.0)]),
            forecast_block_minutes=block,
        )

    def test_held_hourly_forecasts_match_every_half_hour(self) -> None:
        frame = self.build(60)
        assert len(frame) == 48
        assert (frame["match_status"] == "matched").all()
        assert (frame["error_mw"] == 100.0).all()
        assert (frame["forecast_for_utc"] == frame["start_utc"].dt.floor("60min")).all()

    def test_exact_mode_reports_the_off_hour_half_as_missing(self) -> None:
        frame = self.build(30)
        counts = frame["match_status"].value_counts().to_dict()
        assert counts == {"matched": 24, "missing_forecast": 24}
        assert (frame["forecast_for_utc"] == frame["start_utc"]).all()

    def test_held_mode_does_not_change_the_number_of_rows(self) -> None:
        assert len(self.build(60)) == len(self.build(30)) == 48
