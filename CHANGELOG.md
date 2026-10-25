# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Structure only, no behaviour change: the analysis service, API schemas and middleware are packages with one module per concern; the
  Methodology, Vintages and Accuracy views, the Intervals table, the charts, the UI tests and the acceptance suites are split into one
  component or area per file. Every source file is now under about 240 lines. Backend, frontend and docs folders have their own README.

## [0.1.0] - 2026-10-25

First complete version.

### Added
- Decision-time forecast reconstruction: for each half-hour, the latest WINDFOR publication at or before the decision cutoff
  (default 09:20 UK on the day before delivery), with both readings of "purchase decisions made in January 2026" supported and never mixed.
- Accuracy analytics: MAE, RMSE, bias, WAPE, coverage, baselines without leakage, breakdowns by day, half-hour, day/night, error distribution,
  largest misses, forecast vintages and a decision-timing view (`/api/cutoff-sensitivity`).
- Explicit handling of hourly WINDFOR forecasts against half-hourly FUELHH actuals (`FORECAST_ALIGNMENT`, ADR-021).
- FastAPI backend with an ingest-once, checksummed Parquet snapshot of the real January 2026 data; React + TypeScript + Vite + Tailwind +
  Recharts front end with types generated from the OpenAPI document.
- Response cache with ETags, start-up pre-warm, per-client rate limit, security headers, strict Content-Security-Policy, hardened containers.
- Docker and Compose, GitHub Actions CI, CodeQL, dependency audit, Dependabot (minor and patch updates).
- 358 backend tests, 98 Vitest tests, 48 Playwright tests (with axe accessibility audits) and a live acceptance suite
  (80 browser and 17 API checks) for the deployed site.
- Deployed: UI on Vercel, API on Render.

### Fixed (found during acceptance testing)
- Dragging a timeline zoom handle navigated away to the Vintages page.
- Timeline axis labels were ambiguous after zooming to a week.
