# 00 — Project Context (source of truth)

> Read this first in every new working session. It restates the assignment brief, the hiring
> context and the non-negotiable quality bar so that no requirement is lost between sessions.

## 1. What this is

A **hiring challenge** ("Full Stack SWE challenge"). The deliverable is judged on engineering quality,
domain reasoning, analytical correctness, UI/UX, deployment, documentation and presentation.
The video is reviewed **first**; a submission without it is invalid.

Product name: **WindScope UK** (repo name `nkvsr` is the anonymous repo name required by the brief —
do **not** rename it).

## 2. The business problem

A UK energy utility buys electricity on the **GB day-ahead market** to serve its customers. The
procurement team must decide, one day before delivery, how much power to buy beyond what weather-dependent
wind will supply. They therefore rely on **wind generation forecasts**, and they need to:

1. See clearly the **latest wind forecast available when the day-ahead decision has to be made**.
2. **Quantify the accuracy** of that forecast so decisions can account for the error.

## 3. Hard scope limits (from the brief)

| Item | Rule |
|---|---|
| Data | **Elexon BMRS only**, national **WIND** only. No prices, demand, solar, third-party data. |
| Actuals | `FUELHH` stream, filter `fuelType = WIND`; fields `startTime`, `generation`. |
| Forecasts | `WINDFOR` stream; fields `startTime`, `publishTime`, `generation`. |
| Period | Purchase decisions made in **January 2026** (interpretation: see `02-DOMAIN-ASSUMPTIONS.md`). |
| Stack | React + TypeScript + Vite + Tailwind + Recharts; Python + FastAPI + Pydantic + pandas/numpy + httpx + pytest. |
| Infra | Docker + Compose; deploy to Vercel (frontend) and a Python host (backend). **Never claim a deployment that was not verified.** |
| Time | The brief says ≤ 16 h of effort. Prioritise a working, verifiable end-to-end product. |

## 4. Deliverables

1. **Video** (unlisted YouTube, ≤ 10 min): Part 1 customer pitch (≤ 5 min overview), Part 2 tech-lead review
   (≤ 5 min overview). *We cannot record/upload it — we prepare scripts + a recording guide.*
2. **Public GitHub repo** with anonymous name + README (file/dir details, how to start, deployment link,
   **explicit statement that AI tools were used**).
3. **Submission form** — every URL must be opened in incognito and verified (user action).

## 5. Quality bar (user's explicit instructions)

* "No compromise in quality", "next level project", take as much time as needed.
* Keep **full documentation** in the repo so context is always recoverable (this `docs/` folder).
* Real data only; synthetic data may exist **only** in tests or a loudly-labelled dev mode that can never
  run in production.
* Never claim a test/build/deployment passed unless it was actually run and observed.
* Domain honesty: wind-forecast error ≠ the utility's net procurement requirement (demand, other
  generation, hedges, storage, balancing are out of scope).

## 6. Acceptance criteria (condensed from the brief)

- [ ] Real Elexon data, or a transparent explanation of why it cannot be retrieved.
- [ ] Publication time vs delivery time clearly distinguished.
- [ ] Decision-time forecast reconstruction (`publishTime <= cutoff`, latest eligible, no duplicate inflation).
- [ ] "Latest forecast now" vs "forecast available at the historical cutoff" never conflated.
- [ ] Metrics (MAE, RMSE, bias, WAPE, means, n, coverage, missing counts) calculated on one eligible set and tested.
- [ ] Breakdowns: delivery day, half-hourly period, day/night, error distribution, over/under, largest errors.
- [ ] Baseline comparison without leakage.
- [ ] Executive summary, timeline, accuracy analysis, interval explorer, vintage comparison, methodology page.
- [ ] Typed React frontend, FastAPI backend, OpenAPI docs, CORS restricted, timeouts + retries, bounded memory.
- [ ] Docker Compose runs locally; `.env.example`; CI.
- [ ] README (17 required sections), demo script + tech walkthrough + recording guide.
- [ ] AI assistance disclosed in README.
- [ ] Verified deployment links **or** exact deployment instructions.

## 7. Environment constraints discovered (Phase 1)

* Session egress policy **denies** `data.elexon.co.uk` and `bmrs.elexon.co.uk` (HTTP 403 on CONNECT; DNS
  failure from the web-fetch tool). Live Elexon verification and real-data ingestion therefore need either
  the user to allow the host for the session, or to run `make verify-upstream && make ingest` on a machine
  with internet access. See `04-DATA-SOURCE-VERIFICATION.md`.
* PyPI, npm, GitHub API, Docker Hub, Playwright/Chromium and a Docker daemon are available.
* `vercel.com` is not reachable and no deployment credentials exist → deployment is prepared, not performed.
