"""Analysis windows: how "purchase decisions made in January 2026" maps onto delivery days.

The brief is ambiguous: January may refer to when the *decision* is taken or when the power is
*delivered*. Both readings are supported, each expressed in its own date type, and their statistics
are never mixed (see docs/02-DOMAIN-ASSUMPTIONS.md section B).

A day-ahead decision taken on local date ``D`` buys power for delivery on local date ``D + 1``.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

DAY = timedelta(days=1)


class InvalidWindowError(ValueError):
    """The requested date range is malformed or outside the permitted analysis window."""


class Basis(StrEnum):
    DECISION_DATE = "decision_date"
    DELIVERY_DATE = "delivery_date"


@dataclass(frozen=True, slots=True)
class AnalysisWindow:
    basis: Basis
    decision_from: date
    decision_to: date
    delivery_from: date
    delivery_to: date

    @property
    def n_days(self) -> int:
        return (self.delivery_to - self.delivery_from).days + 1


def resolve_window(basis: Basis, date_from: date, date_to: date) -> AnalysisWindow:
    """Build a window from a range expressed in the date type of ``basis`` (inclusive bounds)."""
    if date_to < date_from:
        raise InvalidWindowError(f"'to' ({date_to}) is before 'from' ({date_from})")
    if basis is Basis.DECISION_DATE:
        return AnalysisWindow(basis, date_from, date_to, date_from + DAY, date_to + DAY)
    return AnalysisWindow(basis, date_from - DAY, date_to - DAY, date_from, date_to)


def parse_month(month: str) -> tuple[date, date]:
    """``'2026-01'`` -> (first day, last day) of the calendar month."""
    try:
        year_s, month_s = month.split("-")
        year, mon = int(year_s), int(month_s)
        last = calendar.monthrange(year, mon)[1]
        return date(year, mon, 1), date(year, mon, last)
    except (ValueError, TypeError) as exc:
        raise InvalidWindowError(f"Invalid month {month!r}; expected 'YYYY-MM'") from exc


def basis_bounds(month: str) -> tuple[date, date]:
    """Permitted ``from``/``to`` range for either basis: the analysis month in that basis' own date type."""
    return parse_month(month)


def required_delivery_coverage(month: str) -> tuple[date, date]:
    """Delivery dates the snapshot must cover to serve *both* bases for ``month``.

    ``decision_date`` basis needs deliveries ``month_start+1 .. month_end+1``;
    ``delivery_date`` basis needs ``month_start .. month_end``. The union is ``month_start .. month_end+1``.
    """
    first, last = parse_month(month)
    return first, last + DAY


def validate_window(
    window: AnalysisWindow,
    *,
    bounds: tuple[date, date],
    max_days: int,
) -> None:
    """Reject windows outside the analysis month or longer than ``max_days``."""
    lo, hi = bounds
    requested_from = (
        window.decision_from if window.basis is Basis.DECISION_DATE else window.delivery_from
    )
    requested_to = window.decision_to if window.basis is Basis.DECISION_DATE else window.delivery_to
    if requested_from < lo or requested_to > hi:
        raise InvalidWindowError(
            f"Range {requested_from}..{requested_to} is outside the analysis window "
            f"{lo}..{hi} for basis '{window.basis.value}'"
        )
    if window.n_days > max_days:
        raise InvalidWindowError(f"Range spans {window.n_days} days; the maximum is {max_days}")
