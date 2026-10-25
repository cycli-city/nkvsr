# Documentation index

Start with the root [`README.md`](../README.md) (what it is, how to run it, results). The files here go deeper; the numbering is a reading order.

| Doc | Read it when you want to know… |
|---|---|
| [`00-PROJECT-CONTEXT.md`](00-PROJECT-CONTEXT.md) | what was asked: the brief, scope limits, acceptance criteria |
| [`01-IMPLEMENTATION-PLAN.md`](01-IMPLEMENTATION-PLAN.md) | how the work was sequenced |
| [`02-DOMAIN-ASSUMPTIONS.md`](02-DOMAIN-ASSUMPTIONS.md) | which statements about the market and data are **fact**, **sourced** or **assumption** |
| [`03-ARCHITECTURE.md`](03-ARCHITECTURE.md) | how the system is built and why (components, data flow, middleware, security layers) |
| [`04-DATA-SOURCE-VERIFICATION.md`](04-DATA-SOURCE-VERIFICATION.md) | what the live Elexon API was observed to return (and `generated/` for the raw evidence) |
| [`05-API.md`](05-API.md) | every endpoint, parameter and error |
| [`06-DEPLOYMENT.md`](06-DEPLOYMENT.md) | deploying the API (Render) and the UI (Vercel), and the verification checklist |
| [`07-TESTING.md`](07-TESTING.md) | the test layers, the risk-to-test map, mutation checks and the defects the tests found |
| [`08-DEMO-GUIDE.md`](08-DEMO-GUIDE.md) | the scene-by-scene run sheet for the 10-minute video |
| [`09-REAL-DATA-FINDINGS.md`](09-REAL-DATA-FINDINGS.md) | what the real January 2026 data shows, reproducible with the shown commands |
| [`10-REQUIREMENTS-TRACEABILITY.md`](10-REQUIREMENTS-TRACEABILITY.md) | each requirement of the brief mapped to code and proof |
| [`11-UAT-REPORT.md`](11-UAT-REPORT.md) | the acceptance test of the deployed site and the defects it found |
| [`DECISIONS.md`](DECISIONS.md) | the architecture decision log (ADR-001 to ADR-029) |
| [`STATUS.md`](STATUS.md) | current state, what has and has not been verified, how to resume |

Code-level maps live next to the code: [`backend/README.md`](../backend/README.md), [`frontend/README.md`](../frontend/README.md), [`frontend/uat/README.md`](../frontend/uat/README.md).
