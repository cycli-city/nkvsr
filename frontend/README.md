# Frontend: React + TypeScript + Vite + Tailwind + Recharts

A typed single-page app over the API. Types are **generated** from the backend's OpenAPI document (`src/api/schema.d.ts`), the analysis
selection lives in the URL, and every KPI links to the intervals behind it.

```bash
make setup          # from the repository root
make web            # dev server on http://localhost:5173 (proxies /api to :8000; start the API with `make dev` or `make api`)
npm test            # Vitest (98 tests), from this folder
npm run test:e2e    # Playwright + axe against a production build (see playwright.config.ts)
npm run uat         # acceptance test of a DEPLOYED site (uat/README.md)
```

## Layout (`src/`)

| Path                                   | What lives there                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`, `App.tsx`                  | Entry point and routes (pages are lazy-loaded)                                                                                                                                         |
| `pages/`                               | One file per route: `DashboardPage`, `IntervalsPage`, `VintagesPage`, `MethodologyPage`. Larger pages keep their parts in a folder next to them (`vintages/`, `methodology/sections/`) |
| `components/panels/`                   | Dashboard sections (summary lives in `kpi/`): decision brief, timeline, accuracy (`accuracy/` parts), decision timing                                                                  |
| `components/charts/`                   | One Recharts component per chart (`TimelineChart`, `BriefChart`, `VintageChart`, `DailyErrorChart`, ...) plus `chartKit` and `chartTheme`                                              |
| `components/tables/`                   | `IntervalsTable`, `Pagination`, `LargestErrorsTable`, shared `cells`                                                                                                                   |
| `components/layout/`, `ui/`, `states/` | App shell and selection bar; design primitives; loading, error, empty and cold-start states                                                                                            |
| `api/`                                 | `client.ts` (typed fetch + error classes), `hooks.ts` (TanStack Query), `types.ts`, generated `schema.d.ts`                                                                            |
| `state/useAnalysis.ts`                 | The analysis selection (interpretation, dates, cutoff) as URL state                                                                                                                    |
| `lib/`                                 | Pure helpers: UK-time formatting, presets, interval-query parsing, the plain-language reading of the sensitivity table                                                                 |
| `test/`                                | Test setup, a typed API mock (`utils.tsx`) and response fixtures (`fixtures/`, one module per endpoint)                                                                                |

Tests sit next to the code they cover (`*.test.ts(x)`). `e2e/` holds the hermetic browser specs (synthetic data, runs in CI); `uat/` holds the live acceptance suites.

## Data flow

`useAnalysis` reads the selection from the URL → panels call a hook in `api/hooks.ts` (TanStack Query, keyed by the selection) → `api/client.ts` fetches and maps errors →
`QueryBoundary` renders loading, error, empty or the data. Below-the-fold panels request their data only when scrolled into view (`lib/useInView.ts`).

## Where do I change…?

| I want to…                            | Touch                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| add or change a field the API returns | backend schema, then `make openapi` (regenerates `openapi.json` and `schema.d.ts`); TypeScript then tells you where to update |
| add a KPI tile                        | `components/kpi/SummaryPanel.tsx` (+ a test in `pages/DashboardPage.test.tsx`)                                                |
| add a chart                           | a component in `components/charts/`, used from a panel; keep a text alternative (`ChartFrame`'s `summary`)                    |
| add a page                            | `pages/`, a lazy route in `App.tsx`, a nav entry in `components/layout/AppShell.tsx`                                          |
| change copy on the Methodology page   | `pages/methodology/sections/`                                                                                                 |
| change the security policy            | `csp.ts` (the single definition; `vercel.json` and `nginx.conf.template` must match, a unit test checks)                      |
