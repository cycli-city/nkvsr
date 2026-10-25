"""``GET /api/metadata``: what is loaded, where it came from, the two readings of "January", presets and thresholds."""

from __future__ import annotations

from datetime import timedelta

from app import __version__
from app.api import schemas as s
from app.domain.windows import Basis, parse_month
from app.elexon import endpoints

from .constants import CUTOFF_PRESETS
from .core import AnalysisCore


def build_metadata(core: AnalysisCore) -> s.MetadataResponse:
    cfg = core.settings
    first, last = parse_month(cfg.analysis_month)
    month_label = first.strftime("%B %Y")
    bases = [
        s.BasisInfo(
            id=Basis.DECISION_DATE,
            label=f"Decisions made in {month_label}",
            description=(
                f"Day-ahead decisions taken on {first:%d %b}-{last:%d %b %Y}, i.e. delivery on "
                f"{first + timedelta(days=1):%d %b}-{last + timedelta(days=1):%d %b %Y}. "
                "The literal reading of the brief."
            ),
            date_type="decision",
            min_date=first, max_date=last, default_from=first, default_to=last,
        ),
        s.BasisInfo(
            id=Basis.DELIVERY_DATE,
            label=f"Deliveries in {month_label}",
            description=(
                f"Power delivered on {first:%d %b}-{last:%d %b %Y}, i.e. decisions taken "
                f"{first - timedelta(days=1):%d %b}-{last - timedelta(days=1):%d %b %Y}."
            ),
            date_type="delivery",
            min_date=first, max_date=last, default_from=first, default_to=last,
        ),
    ]  # fmt: skip
    dataset = core.store.maybe_get()
    refresh = core.store.refresh_state
    base = {
        "app_version": __version__,
        "refresh": s.RefreshOut(**refresh.to_dict()),
        "analysis_month": cfg.analysis_month,
        "bases": bases,
        "default_basis": cfg.default_basis,
        "default_cutoff": cfg.decision_cutoff_local,
        "cutoff_presets": CUTOFF_PRESETS,
        "forecast_alignment": cfg.forecast_alignment,
        "thresholds": s.Thresholds(
            coverage_sufficient=cfg.coverage_sufficient,
            coverage_partial=cfg.coverage_partial,
            stale_forecast_hours=cfg.stale_forecast_hours,
            max_range_days=cfg.max_range_days,
        ),
        "sign_convention": "error = forecast - actual; positive = over-forecast (less wind than predicted)",
        "unit": endpoints.UNIT,
    }
    if dataset is None:
        return s.MetadataResponse(data_available=False, load_error=core.store.load_error, **base)
    m = dataset.manifest
    return s.MetadataResponse(
        data_available=True,
        provenance=core.provenance(dataset),
        sources=[s.SourceLink(**d.model_dump()) for d in m.datasets],
        delivery_coverage_from=m.delivery_coverage_from,
        delivery_coverage_to=m.delivery_coverage_to,
        actuals_rows=m.actuals_rows,
        forecasts_rows=m.forecasts_rows,
        quality=m.quality,
        warnings=m.warnings,
        **base,
    )
