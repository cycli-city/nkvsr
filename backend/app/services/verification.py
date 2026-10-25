"""Live verification of the assumptions in ``app/elexon/endpoints.py``.

Run via ``python -m app.cli verify-upstream`` on a machine that can reach the Elexon API. It performs a
*small* real request per dataset and records what was **observed** (schema, units hints, timestamp
format, resolution, cadence, headers). Nothing is inferred beyond what the response shows.

The output is written to ``docs/generated/elexon-verification.md`` and raw sample records are saved
under ``backend/tests/fixtures/real/`` so future tests can run against genuine response shapes.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

from app.config import Settings
from app.domain import timeutil as tu
from app.domain.windows import parse_month
from app.elexon import endpoints
from app.elexon.contract import REQUIRED_FIELDS, unwrap_records
from app.errors import UpstreamSchemaError

ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
INTERESTING_HEADERS = ("content-type", "content-length", "content-encoding", "retry-after", "date")


@dataclass
class DatasetObservation:
    dataset: str
    url: str = ""
    ok: bool = False
    http_status: int | None = None
    error: str | None = None
    envelope: str | None = None
    n_records: int = 0
    field_names: list[str] = field(default_factory=list)
    field_types: dict[str, str] = field(default_factory=dict)
    missing_required: list[str] = field(default_factory=list)
    timestamp_format_ok: bool | None = None
    headers: dict[str, str] = field(default_factory=dict)
    ratelimit_headers: dict[str, str] = field(default_factory=dict)
    sample: list[dict[str, Any]] = field(default_factory=list)
    facts: dict[str, Any] = field(default_factory=dict)


@dataclass
class VerificationReport:
    run_at: datetime
    base_url: str
    probe_day: str
    observations: list[DatasetObservation]

    @property
    def all_ok(self) -> bool:
        return all(o.ok for o in self.observations)


def _observe_frame(obs: DatasetObservation, records: list[dict[str, Any]]) -> None:
    obs.n_records = len(records)
    if not records:
        return
    obs.field_names = sorted({k for r in records[:200] for k in r})
    obs.field_types = {k: type(records[0].get(k)).__name__ for k in obs.field_names}
    obs.missing_required = [f for f in REQUIRED_FIELDS[obs.dataset] if f not in obs.field_names]
    obs.sample = records[:5]
    start_values = [r.get("startTime") for r in records[:200]]
    obs.timestamp_format_ok = all(isinstance(v, str) and bool(ISO_Z.match(v)) for v in start_values)

    # Facts are only gathered for columns that exist: a missing field is itself the finding
    # (reported via ``missing_required``) and must never crash the verification run.
    if obs.missing_required:
        return
    df = pd.DataFrame.from_records(records)
    start = pd.to_datetime(df["startTime"], utc=True, errors="coerce")
    gen = pd.to_numeric(df["generation"], errors="coerce")
    facts: dict[str, Any] = {
        "startTime_min": str(start.min()),
        "startTime_max": str(start.max()),
        "generation_min": float(gen.min()),
        "generation_max": float(gen.max()),
        "generation_median": float(gen.median()),
        "unparseable_startTime": int(start.isna().sum()),
        "non_numeric_generation": int(gen.isna().sum()),
    }
    if obs.dataset == endpoints.FUELHH:
        facts["distinct_fuelType"] = sorted(df["fuelType"].astype(str).unique().tolist())
        step = start.drop_duplicates().sort_values().diff().dropna().dt.total_seconds().div(60)
        facts["startTime_step_minutes_mode"] = float(step.mode().iloc[0]) if len(step) else None
        facts["duplicate_startTime"] = int(start.duplicated().sum())
        facts["has_publishTime"] = "publishTime" in df
    else:
        publish = pd.to_datetime(df["publishTime"], utc=True, errors="coerce")
        distinct_pub = publish.drop_duplicates().sort_values()
        cadence = distinct_pub.diff().dropna().dt.total_seconds().div(60)
        lead = (start - publish).dt.total_seconds().div(3600)
        mid = distinct_pub.iloc[len(distinct_pub) // 2]
        one = (
            start[publish == mid]
            .drop_duplicates()
            .sort_values()
            .diff()
            .dropna()
            .dt.total_seconds()
            .div(60)
        )
        facts.update(
            {
                "distinct_publishTime": len(distinct_pub),
                "publishTime_min": str(distinct_pub.min()),
                "publishTime_max": str(distinct_pub.max()),
                "publish_cadence_minutes_median": float(cadence.median()) if len(cadence) else None,
                "startTime_step_minutes_mode": float(one.mode().iloc[0]) if len(one) else None,
                "lead_time_hours_min": float(lead.min()),
                "lead_time_hours_median": float(lead.median()),
                "lead_time_hours_max": float(lead.max()),
                "rows_per_start_median": float(df.groupby("startTime").size().median()),
                "published_after_start": int((publish > start).sum()),
            }
        )
    obs.facts = facts


async def _probe(http: httpx.AsyncClient, request: endpoints.UpstreamRequest) -> DatasetObservation:
    obs = DatasetObservation(dataset=request.dataset)
    try:
        response = await http.get(request.path, params=request.params)
    except httpx.HTTPError as exc:
        obs.error = f"{type(exc).__name__}: {exc}"
        return obs
    obs.url = str(response.request.url)
    obs.http_status = response.status_code
    obs.headers = {k: v for k, v in response.headers.items() if k.lower() in INTERESTING_HEADERS}
    obs.ratelimit_headers = {
        k: v
        for k, v in response.headers.items()
        if "ratelimit" in k.lower() or "rate-limit" in k.lower()
    }
    if response.status_code != 200:
        obs.error = f"HTTP {response.status_code}: {response.text[:400]}"
        return obs
    try:
        payload = response.json()
        obs.envelope = (
            "bare array" if isinstance(payload, list) else f"object with keys {sorted(payload)[:6]}"
        )
        records = unwrap_records(payload, request.dataset)
    except (ValueError, UpstreamSchemaError) as exc:
        obs.error = f"Unexpected body: {exc}"
        return obs
    _observe_frame(obs, records)
    obs.ok = bool(records) and not obs.missing_required and obs.timestamp_format_ok is not False
    if not records:
        obs.error = "Request succeeded but returned zero records for the probe window"
    return obs


async def verify_upstream(
    settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None
) -> VerificationReport:
    """Probe one mid-month delivery day for each dataset (a handful of requests in total)."""
    first, _ = parse_month(settings.analysis_month)
    probe_day = first + timedelta(days=14)
    day_start = tu.local_midnight_utc(probe_day).to_pydatetime()
    async with httpx.AsyncClient(
        base_url=settings.elexon_base_url,
        timeout=httpx.Timeout(
            settings.elexon_timeout_seconds, connect=settings.elexon_connect_timeout_seconds
        ),
        headers={"Accept": "application/json", "User-Agent": "WindScopeUK-verify/0.1"},
        follow_redirects=True,
        transport=transport,
    ) as http:
        actuals = await _probe(http, endpoints.fuelhh_wind_request(probe_day, probe_day))
        forecasts = await _probe(
            http,
            endpoints.windfor_request(
                day_start - timedelta(days=1), day_start + timedelta(hours=12)
            ),
        )
    return VerificationReport(
        run_at=datetime.now(tz=UTC),
        base_url=settings.elexon_base_url,
        probe_day=probe_day.isoformat(),
        observations=[actuals, forecasts],
    )


def render_markdown(report: VerificationReport) -> str:
    lines = [
        "# Elexon live verification (generated)",
        "",
        f"* Run at: `{report.run_at.isoformat()}`",
        f"* Base URL: `{report.base_url}`",
        f"* Probe delivery day: `{report.probe_day}`",
        f"* Overall: **{'PASS' if report.all_ok else 'FAIL - see details'}**",
        "",
        "Everything below was *observed in a real response*. Update `docs/04-DATA-SOURCE-VERIFICATION.md` "
        "from these facts, and adjust `app/elexon/endpoints.py` / `contract.py` if anything differs.",
    ]
    for obs in report.observations:
        lines += ["", f"## {obs.dataset}", "", f"* Request: `{obs.url or 'not sent'}`"]
        lines.append(f"* HTTP status: `{obs.http_status}`")
        if obs.error:
            lines.append(f"* **Problem:** {obs.error}")
        lines.append(f"* Envelope: {obs.envelope}")
        lines.append(f"* Records: {obs.n_records}")
        lines.append(f"* Fields observed: `{', '.join(obs.field_names)}`")
        lines.append(f"* Field types (first record): `{json.dumps(obs.field_types)}`")
        if obs.missing_required:
            lines.append(f"* **Missing required fields:** `{obs.missing_required}`")
        lines.append(f"* startTime is ISO-8601 UTC 'Z': `{obs.timestamp_format_ok}`")
        lines.append(f"* Headers: `{json.dumps(obs.headers)}`")
        lines.append(f"* Rate-limit headers: `{json.dumps(obs.ratelimit_headers) or 'none seen'}`")
        lines.append("* Measured facts:")
        lines += [f"  * `{k}`: `{v}`" for k, v in obs.facts.items()]
        lines += ["* Sample records:", "", "```json", json.dumps(obs.sample[:3], indent=2), "```"]
    lines += [
        "",
        "## Units",
        "",
        "The responses carry no unit field. Confirm in the Elexon documentation that `generation` is MW "
        "(FUELHH: half-hourly average MW) and compare magnitudes above against national wind capacity "
        "(a few thousand to ~15,000). Record the confirmation in `docs/04-DATA-SOURCE-VERIFICATION.md`.",
    ]
    return "\n".join(lines) + "\n"


def save_artifacts(report: VerificationReport, docs_dir: Path, fixtures_dir: Path) -> list[Path]:
    docs_dir.mkdir(parents=True, exist_ok=True)
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    md = docs_dir / "elexon-verification.md"
    md.write_text(render_markdown(report), encoding="utf-8")
    written.append(md)
    for obs in report.observations:
        if obs.sample:
            path = fixtures_dir / f"{obs.dataset.lower()}_sample.json"
            path.write_text(json.dumps(obs.sample, indent=2), encoding="utf-8")
            written.append(path)
    return written
