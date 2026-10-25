## What and why

<!-- One or two sentences: the change and the reason for it. Link the issue if there is one. -->

## How it was verified

<!-- Commands you ran and what you saw. "make check" and, for UI changes, "make e2e". Do not claim what you did not run. -->

## Checklist

- [ ] Tests added or updated for the behaviour that changed (a test that fails without the change)
- [ ] `make check` passes (ruff, mypy --strict, eslint, prettier, tsc, pytest, vitest)
- [ ] API change? `make openapi` was run and `frontend/openapi.json` + `frontend/src/api/schema.d.ts` are committed
- [ ] Config change? `.env.example` and the README configuration table are updated
- [ ] Analytical rule or assumption change? `docs/02-DOMAIN-ASSUMPTIONS.md` and `docs/DECISIONS.md` are updated
- [ ] No secrets, tokens, `.env` files or personal data are included
