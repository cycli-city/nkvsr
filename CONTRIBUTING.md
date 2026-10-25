# Contributing

Thanks for looking at WindScope UK. The short version: keep it correct, keep it tested, keep the docs true.

## Set up

```bash
make setup                 # backend virtualenv + frontend dependencies
make dev                   # API on a clearly-labelled SYNTHETIC snapshot; then `make web` in a second terminal
```

Real data needs access to `data.elexon.co.uk` (`make ingest`); see the README, sections 10 and 12.

## Before you open a pull request

```bash
make check                 # ruff, mypy --strict, eslint, prettier, tsc, pytest, vitest (what CI runs)
make e2e                   # Playwright + axe, for any UI change
```

* **A test that fails without your change.** Domain rules have closed-form fixtures: a wrong forecast vintage must produce a wrong *number*.
* **API change?** Run `make openapi` and commit `frontend/openapi.json` and `frontend/src/api/schema.d.ts`; CI fails on drift.
* **Config change?** Update `.env.example` and the README configuration table (a test guards the example file).
* **Analytical rule or assumption change?** Update `docs/02-DOMAIN-ASSUMPTIONS.md` and add an entry to `docs/DECISIONS.md`.
* **Never claim what you did not run.** Say in the pull request what you executed and what you saw.
* No secrets, tokens or `.env` files, and never synthetic data presented as real.

Commit messages follow `type(scope): summary` (`feat`, `fix`, `perf`, `security`, `test`, `docs`, `chore`).

## Layout

See README section 4 and `docs/03-ARCHITECTURE.md`. The one rule worth knowing before you start: every KPI uses only forecasts with
`publishTime <= decision cutoff`; anything later is hindsight and is labelled as such.
