"""Command line entry points: ``python -m app.cli <command>``.

* ``ingest``                  fetch FUELHH/WINDFOR from Elexon and write the snapshot
* ``verify-upstream``         probe the live API and record the observed schema/behaviour
* ``inspect``                 print the current snapshot's manifest
* ``generate-synthetic-dev``  write a clearly-labelled SYNTHETIC snapshot for offline UI development
* ``export-openapi``          write the OpenAPI document (used to generate the frontend types)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from app.config import REPO_ROOT, Settings, get_settings
from app.errors import IngestionError, UpstreamError
from app.store.snapshot import SnapshotError, read_manifest

logger = logging.getLogger("windscope.cli")


def _cmd_ingest(settings: Settings, _: argparse.Namespace) -> int:
    from app.services.ingestion import IngestionService
    from app.store.dataset import DataStore

    service = IngestionService(settings, DataStore(settings))
    try:
        manifest = asyncio.run(service.run())
    except (UpstreamError, IngestionError) as exc:
        print(f"INGESTION FAILED: {exc}", file=sys.stderr)
        print("The previous snapshot (if any) was left untouched.", file=sys.stderr)
        return 1
    print(f"Snapshot written to {settings.snapshot_dir}")
    print(f"  retrieved_at : {manifest.retrieved_at.isoformat()}")
    print(f"  actuals rows : {manifest.actuals_rows}")
    print(f"  forecast rows: {manifest.forecasts_rows}")
    for warning in manifest.warnings:
        print(f"  WARNING: {warning}")
    return 0


def _cmd_verify(settings: Settings, args: argparse.Namespace) -> int:
    from app.services.verification import save_artifacts, verify_upstream

    report = asyncio.run(verify_upstream(settings))
    written = save_artifacts(report, Path(args.docs_dir), Path(args.fixtures_dir))
    for obs in report.observations:
        status = "OK  " if obs.ok else "FAIL"
        print(
            f"[{status}] {obs.dataset}: HTTP {obs.http_status} records={obs.n_records} {obs.error or ''}"
        )
    for path in written:
        print(f"wrote {path}")
    return 0 if report.all_ok else 1


def _cmd_inspect(settings: Settings, _: argparse.Namespace) -> int:
    try:
        manifest = read_manifest(settings.snapshot_dir)
    except SnapshotError as exc:
        print(f"No usable snapshot: {exc}", file=sys.stderr)
        return 1
    print(manifest.model_dump_json(indent=2))
    return 0


def _cmd_synthetic(settings: Settings, args: argparse.Namespace) -> int:
    if settings.is_production:
        print("Refusing to generate synthetic data when APP_ENV=production.", file=sys.stderr)
        return 2
    from app.store.synthetic import generate

    dev_settings = settings.model_copy(update={"data_dir": Path(args.data_dir)})
    manifest = generate(dev_settings, seed=args.seed)
    print("SYNTHETIC DEVELOPMENT SNAPSHOT written to", dev_settings.snapshot_dir)
    print(f"  actuals={manifest.actuals_rows} forecasts={manifest.forecasts_rows}")
    print(
        f"  Start the API with DATA_DIR={dev_settings.data_dir} to use it. It is NOT Elexon data."
    )
    return 0


def _cmd_openapi(_: Settings, args: argparse.Namespace) -> int:
    from app.main import create_app

    schema = create_app(Settings(_env_file=None, app_env="test")).openapi()
    Path(args.out).write_text(json.dumps(schema, indent=2), encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.cli",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("ingest", help="fetch from Elexon and write the snapshot").set_defaults(
        fn=_cmd_ingest
    )

    verify = sub.add_parser(
        "verify-upstream", help="probe the live API and record observed behaviour"
    )
    verify.add_argument("--docs-dir", default=str(REPO_ROOT / "docs" / "generated"))
    verify.add_argument(
        "--fixtures-dir", default=str(REPO_ROOT / "backend" / "tests" / "fixtures" / "real")
    )
    verify.set_defaults(fn=_cmd_verify)

    sub.add_parser("inspect", help="print the snapshot manifest").set_defaults(fn=_cmd_inspect)

    synth = sub.add_parser(
        "generate-synthetic-dev", help="write a SYNTHETIC dev snapshot (not Elexon data)"
    )
    synth.add_argument("--data-dir", default=str(REPO_ROOT / "data" / "dev"))
    synth.add_argument("--seed", type=int, default=7)
    synth.set_defaults(fn=_cmd_synthetic)

    openapi = sub.add_parser("export-openapi", help="write openapi.json")
    openapi.add_argument("--out", default=str(REPO_ROOT / "frontend" / "openapi.json"))
    openapi.set_defaults(fn=_cmd_openapi)

    args = parser.parse_args(argv)
    return int(args.fn(get_settings(), args))


if __name__ == "__main__":
    sys.exit(main())
