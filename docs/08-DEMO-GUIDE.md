# 08 — Demo kit: the 10-minute video, scene by scene

> **Everything in this guide was rehearsed against the live deployment** (UI <https://windscope-uk-sand.vercel.app>, API <https://windscope-api-5joc.onrender.com>): every click in Part 1
> was executed by a script at 1920×1080 on the real data and every number below was read off the screen. I cannot record or
> upload the video; this is the exact run sheet for you to do it. If a number on your screen differs from the one written here,
> **say what your screen shows**, and never read a number from a screen with a red SYNTHETIC banner.

**Limits from the brief:** one unlisted YouTube video, **≤ 10:00 in total**; Part 1 (customer pitch) ≤ 5:00 and Part 2 (tech-lead review) ≤ 5:00.
This plan runs **about 4:19 + 4:02 = 8:21** at a relaxed 150 words/minute, leaving about a minute of margin. Do not add content; cut instead.

## 1. Before you press record

**Do these in order; allow 30 minutes the first time.**

1. **Check the repository shows the code.** The project was merged into `main` (PR #1), so the public repository's front page is the README.
   Open <https://github.com/cycli-city/nkvsr> in a private window: you should see the CI and CodeQL badges, the live-app link, the
   architecture diagram and the file tree. If you ever see only a one-line README, `main` has lost the merge: stop and ask.
2. **Warm the API** (the free host sleeps after ~15 minutes idle and takes up to a minute to wake): open
   `https://windscope-api-5joc.onrender.com/api/health` until it shows `{"status":"ok",…,"data_loaded":true}`, then load the dashboard once. Do this again 2 minutes before recording.
3. **Rehearse both parts twice** with a timer, reading the *Say* text aloud and doing the *Do* steps. A scripted dry run executed every Part 1 click on the live site without a single failure, so what takes the time is your speech, not the app.
4. **Screen**: 1920×1080, browser zoom **100 %**, bookmarks bar hidden, Chrome (or Edge). Notifications off. Close everything else.
   Recording: OBS Studio / Loom / QuickTime, 1080p, 30 fps, microphone check, **system audio off**.
5. **Clone the repository** for Part 2 (`git clone https://github.com/cycli-city/nkvsr && cd nkvsr && make setup`) and open it in VS Code (font size 16+, minimap off).
   In the terminal run `make test` once beforehand so everything is cached; you will run it again live in scene 2.5.
6. **Browser tabs, in exactly this order** (so `Ctrl+1…5` jumps to them):

| Tab | URL | Used in |
|---|---|---|
| 1 | `https://windscope-uk-sand.vercel.app/` (dashboard, default view — do not change any control before recording) | Part 1 scenes 1.1–1.6, 1.8; Part 2 scene 2.6 |
| 2 | `https://windscope-uk-sand.vercel.app/vintages?start=2026-01-12T01%3A00%3A00Z` | scene 1.7 |
| 3 | `https://windscope-api-5joc.onrender.com/api/docs` (live Swagger UI) | scenes 2.3, 2.6 |
| 4 | `https://github.com/cycli-city/nkvsr` (repo home, README) | scene 2.1 |
| 5 | `https://github.com/cycli-city/nkvsr/actions` | scene 2.5 |

7. **VS Code tabs, in this order**: `backend/app/domain/vintage.py` · `backend/tests/unit/test_vintage.py` · `docs/DECISIONS.md` · `backend/app/main.py` ·
   `backend/app/api/middleware.py` · `frontend/src/api/schema.d.ts` · `frontend/src/state/useAnalysis.ts` · `frontend/src/api/hooks.ts` ·
   `frontend/src/components/panels/SensitivityPanel.tsx` · `frontend/csp.ts` · `backend/tests/api/test_api_exact.py` · `docs/07-TESTING.md` ·
   `docs/11-UAT-REPORT.md` · `docker-compose.yml` · `render.yaml` · `frontend/vercel.json` · `SECURITY.md`.

## 2. Run sheet (whole video)

| Scene | What | Clock (est.) | Words |
|---|---|---|---|
| | **PART 1 — Customer pitch** | 0:00 | |
| 1.1 | The problem and the product | 0:00–0:31 | 70 |
| 1.2 | Executive summary: the month at a glance | 0:31–1:05 | 74 |
| 1.3 | Decision brief: the forecast you could see | 1:05–1:37 | 69 |
| 1.4 | Timeline: forecast against actual | 1:37–2:10 | 52 |
| 1.5 | Accuracy: how wrong, and in which direction | 2:10–2:52 | 85 |
| 1.6 | Decision timing: would waiting have helped? | 2:52–3:23 | 68 |
| 1.7 | Vintages: how one forecast evolved | 3:23–3:52 | 59 |
| 1.8 | Interpretation switch and honest limits | 3:52–4:19 | 51 |
| | **PART 2 — Technical review** (starts straight after Part 1) | 4:19 | |
| 2.1 | Design principle and architecture | 4:19–4:55 | 78 |
| 2.2 | The core rule, and what the live data changed | 4:55–5:38 | 90 |
| 2.3 | Backend: API, cache, limits, contract | 5:38–6:12 | 69 |
| 2.4 | Frontend design | 6:12–6:34 | 44 |
| 2.5 | Quality evidence | 6:34–7:18 | 86 |
| 2.6 | Docker and deployment | 7:18–7:45 | 55 |
| 2.7 | Trade-offs, limits, next steps, AI disclosure | 7:45–8:21 | 80 |
| | **End** | **8:21** | |

The *Clock* column is an estimate: speaking time at 150 words/minute plus the time the actions take (measured in the dry run). Your own pace decides the real times; the only hard limit is 10:00 in total.


## 3. PART 1 — Customer pitch (target 4:19)

*Audience:* the day-ahead procurement team of a GB energy utility. *Goal:* impress them with a product that answers their two questions with numbers they can trust and limits they can see. *Tone:* confident, specific, no hype. Pretend this is the output of a pilot you ran for them.

### Scene 1.1 — The problem and the product  ·  ≈ 0:00–0:31 into Part 1

**Where:** Tab 1 (dashboard), scrolled to the very top

**Do:**

1. Page already loaded; the address bar shows the Vercel URL — let it sit on screen for the first sentence.
2. Slowly move the mouse across the header and the grey *Source: Elexon BMRS · FUELHH, WINDFOR · national WIND · MW* line, then rest it on the *Executive summary* title.

**Say** (70 words):

> Every morning your day-ahead desk must commit to buying power for tomorrow before knowing how much wind will blow. Two questions matter: what is the latest wind forecast I could actually see when I had to decide, and how wrong is it? This is WindScope UK, the pilot we built for your team, using only Elexon's national wind data for decisions made in January 2026. It is live right now.

**On screen you should see:** Header, source line, KPI tiles starting to show at the bottom of the screen.

### Scene 1.2 — Executive summary: the month at a glance  ·  ≈ 0:31–1:05 into Part 1

**Where:** Tab 1, *Executive summary* at the top of the screen (press the **Summary** chip under *Jump to:* if needed)

**Do:**

1. Move the mouse left to right across the six tiles as you name them.
2. Click the small **i** on the **MAE** tile, let the definition show for 2 seconds, press **Esc**.
3. Rest on the green *Data sufficient* badge while you say "data supports the analysis".

**Say** (74 words):

> Here is the month at a glance. All 1,488 half-hours are matched, so coverage is 100 per cent. On average the forecast missed by 2,042 megawatts, about 18 per cent of wind output. The bias is plus 1,748: in 85 per cent of half-hours it promised more wind than arrived, which leaves a buyer short. It still beats a naive same-as-now forecast by 51 per cent. Every tile opens the exact half-hours behind it.

**On screen you should see:** Matched 1,488 · Coverage 100.0% · MAE 2,042 MW (WAPE 18.1%) · RMSE 2,509 MW · Bias +1,748 MW (85% over) · MAE vs persistence −51%.

### Scene 1.3 — Decision brief: the forecast you could see  ·  ≈ 1:05–1:37 into Part 1

**Where:** Tab 1, scroll down so the **Decision brief** heading is at the top of the screen

**Do:**

1. Click the **←** button once. The title changes to *as at 09:20 on 30 Jan*.
2. Point at the four numbers (mean, energy, peak, lowest), then the grey box *Forecast set visible at 09:20 … 1 publication … 07:30*, then the *In hindsight* box.

**Say** (69 words):

> This answers the first question. Pick a decision day, here Friday 30 January, and the 09:20 cutoff, the day-ahead gate closure. The latest forecast you could see for Saturday averaged 12.8 gigawatts, peaking at 16.3 and bottoming at 10.7. It came from one publication, the 07:30 run; anything released after 09:20 is excluded on purpose. In hindsight, 10.4 gigawatts arrived: the forecast was 2.4 too high.

**On screen you should see:** Mean forecast 12,813 MW · energy 307.5 GWh · peak 16,277 MW at 00:00 · lowest 10,667 MW at 23:00 · 1 publication, Fri 30 Jan 07:30 · mean actual 10,423 MW · bias +2,390 MW.

### Scene 1.4 — Timeline: forecast against actual  ·  ≈ 1:37–2:10 into Part 1

**Where:** Tab 1, scroll to **Wind generation timeline**

**Do:**

1. Hover the middle of the chart for 2 seconds: the tooltip shows actual, forecast at cutoff, error and the publication time.
2. Tick **Compare with latest published forecast** (a grey dashed line appears), wait 2 seconds, untick it.
3. Zoom: drag the **left** handle under the chart about a fifth of the way to the right, then drag the **right** handle about 45 % of the width to the left. You are left with roughly 9–17 January and the axis now shows dates with times. (Dragging a handle no longer navigates away; that bug was found and fixed during acceptance testing.)
4. Click once anywhere inside the plot, near the middle: the Vintages page for that half-hour opens. Count to two, then press **Alt+←** to come back (the dashboard returns where you were; the Decision brief resets to 31 Jan, which is expected).

**Say** (52 words):

> The timeline puts forecast and actual on one axis; hover for the publication time and the error. The dashed grey line adds later revisions: context only, you could not have bought on it, so it never enters a number. Zoom with the handles, and click any point to see its forecast history.

**On screen you should see:** Teal forecast above the dark actual line for most of the month; the big overshoot around 11–13 January is clearly visible after zooming.

### Scene 1.5 — Accuracy: how wrong, and in which direction  ·  ≈ 2:10–2:52 into Part 1

**Where:** Tab 1, scroll to **Forecast accuracy** and move down slowly (about 2 seconds per stop)

**Do:**

1. Stop 1 — *Daily error trend* chart: point at the tall bars (28 Jan is the worst day) and at the line staying above zero.
2. Stop 2 — the **Error profile** card: put the cursor under *In 80% of intervals the error was between −544 MW and +4,140 MW (median +1,592 MW)*.
3. Stop 3 — **Day versus night** table (night 2,263 vs day 1,932), then **Against naive baselines** (persistence 4,144, trailing mean 4,414), then the *Hindsight check* sentence (1,667 vs 2,042).

**Say** (85 words):

> Now, how wrong? The daily chart: bars are the size of the miss, and the line is above zero almost every day, so the forecast runs high. In 80 per cent of half-hours the miss was between 544 megawatts too low and 4,140 too high, median 1,592 too high: that is the allowance to hold in reserve. Nights are harder than days, 2,263 against 1,932. It beats persistence by 51 per cent. Even the latest forecast, with updates you could not see, only reaches 1,667.

**On screen you should see:** Over-forecast 85% (1,261) / under 15% (227) · typical over-forecast 2,236 MW · largest +6,894 MW · day MAE 1,932 / night 2,263 MW.

### Scene 1.6 — Decision timing: would waiting have helped?  ·  ≈ 2:52–3:23 into Part 1

**Where:** Tab 1, scroll to **Does the decision time matter?** (it loads a second after it comes into view)

**Do:**

1. Point at the teal bar (09:20, *Yours*), the blue bars on its left, and the grey bars on its right.
2. Move down to the table: *Hindsight only* on every row from 09:30; then the last row (22:30, MAE 1,830).

**Say** (68 words):

> Would waiting help? We re-ran everything as if you had decided after each forecast release. At your cutoff you use the 07:30 run: error 2,042. The 09:30 run lands ten minutes too late. Waiting for the last run of the day would cut the error by about ten per cent, but the bias would still be around 1.6 gigawatts: later forecasts remove scatter, not the offset.

**On screen you should see:** 09:20 Yours: 07:30 run, MAE 2,042, bias +1,748 · 09:30: 2,016 · 22:30: 1,830 (−10.4 %), bias +1,603.

### Scene 1.7 — Vintages: how one forecast evolved  ·  ≈ 3:23–3:52 into Part 1

**Where:** Press **Ctrl+2** → Tab 2 (Vintages, 12 Jan 01:00, already loaded)

**Do:**

1. Rest the cursor on the three big numbers *Used at decision time / Latest published / Actual*.
2. Point at the red *Cutoff 09:20* line on the chart, with dots to its left and right.
3. Scroll to the table and rest on the single green *Used at decision time* row.

**Say** (59 words):

> For any half-hour you can see how its forecast evolved. This is the biggest miss of the month: Monday 12 January, 01:00. Only dots left of the red line existed at 09:20 the day before. We would have used 20,942 megawatts. What arrived was 14,048, nearly seven gigawatts less, and later revisions only pushed the forecast higher.

**On screen you should see:** Used 20,942 MW (07:30, 110 min before cutoff) · latest 21,226 MW · actual 14,048 MW · error +6,894 MW · 11 of 24 publications were available at the cutoff.

### Scene 1.8 — Interpretation switch and honest limits  ·  ≈ 3:52–4:19 into Part 1

**Where:** Press **Ctrl+1** → Tab 1, scroll to the top

**Do:**

1. Open the first drop-down (*“January” means*) and choose **Deliveries in January 2026**: MAE changes to 2,145 MW. Switch back to *Decisions made in January 2026*.
2. Press **End** to jump to the footer and rest the cursor on the two grey disclaimer paragraphs.

**Say** (51 words):

> Two last points. January is ambiguous, decisions made in January or deliveries in January, so you can switch; the two are never mixed. And two honest limits, in the footer: this is wind only, your net requirement also depends on demand, other generation and hedges, and it describes January. Thank you.

**On screen you should see:** Delivery reading: MAE 2,145 MW, bias +1,852 MW. Footer: licence link and the “not the utility's net procurement requirement” paragraph.

**Do not:** claim it computes purchase volumes; read a number that is not on your screen; promise future accuracy; skip the limits in scene 1.8.

## 4. PART 2 — Technical review (target 4:02)

*Audience:* the tech lead. *Goal:* make the review easy and transfer knowledge: architecture, design, analysis, code base, development practices. Keep the editor tabs in the order of section 1.

### Scene 2.1 — Design principle and architecture  ·  ≈ 0:00–0:36 into Part 2

**Where:** Tab 4 (GitHub repository home) → README

**Do:**

1. Scroll the README to **3. Architecture overview** (the Mermaid diagram renders on GitHub); trace Elexon → client → snapshot → API → UI with the cursor.
2. Scroll to **4. Directory & file structure** and rest on the tree for 3 seconds.

**Say** (78 words):

> Thanks for reviewing. The design principle is information discipline: a number is valid only if it uses data available at the cutoff. Elexon data is ingested once into a checksummed Parquet snapshot; request handlers never call Elexon, so the API is fast, deterministic and survives upstream outages. A pure domain layer holds the logic where correctness risk lives. The React front end is contract-first: its types are generated from the API's OpenAPI document and CI fails on drift.

**On screen you should see:** README §3 diagram, §4 tree.

### Scene 2.2 — The core rule, and what the live data changed  ·  ≈ 0:36–1:19 into Part 2

**Where:** VS Code

**Do:**

1. Open `backend/app/domain/vintage.py`, go to line **78** (`select_at_cutoff`) and then line **112** (`pd.merge_asof(... direction="backward")`).
2. Open `backend/tests/unit/test_vintage.py` line **45** (`test_publication_exactly_at_cutoff_is_eligible`).
3. Open `docs/DECISIONS.md` line **79** (**ADR-021**).

**Say** (90 words):

> The core rule: select_at_cutoff. For each half-hour, the latest forecast published at or before the cutoff on the previous day. One merge_asof, backward, exact matches allowed: exactly one row per interval, so revisions cannot inflate the sample. This test pins a publication exactly at the cutoff. Running the live verification changed the design: WINDFOR is hourly, FUELHH half-hourly, so half the half-hours would have had no forecast. ADR-021 makes that an explicit rule: each forecast hour covers both half-hours, nothing is interpolated, and the UI says so.

**On screen you should see:** vintage.py:78 and :112 · test_vintage.py:45 · DECISIONS.md ADR-021.

### Scene 2.3 — Backend: API, cache, limits, contract  ·  ≈ 1:19–1:53 into Part 2

**Where:** VS Code, then Tab 3 (live Swagger)

**Do:**

1. Open `backend/app/main.py` line **109** (the middleware stack: GZip, response cache, rate limit, CORS) and `backend/app/api/middleware.py` (classes `RateLimitMiddleware` line 61 and `ResponseCacheMiddleware` line 149).
2. Switch to Tab 3 (**Ctrl+3**, the live `/api/docs`): expand `GET /api/cutoff-sensitivity` for two seconds.
3. Back in VS Code open `frontend/src/api/schema.d.ts` (generated; first lines say so).

**Say** (69 words):

> The API is FastAPI with Pydantic models. Every response is a pure function of the snapshot and the query, so a small middleware caches rendered bytes with an ETag and answers conditional requests with a 304; the dashboard's first requests are pre-computed at start-up. A rate limiter, security headers and strict CORS sit in the same stack. Swagger is live here, and the generated schema feeds the front end.

**On screen you should see:** main.py:109–120 · middleware.py:61, :149 · live Swagger · schema.d.ts.

### Scene 2.4 — Frontend design  ·  ≈ 1:53–2:14 into Part 2

**Where:** VS Code

**Do:**

1. Open `frontend/src/state/useAnalysis.ts` (line **59**, `useAnalysis` reads `useSearchParams`).
2. Open `frontend/src/api/hooks.ts` (line **13**, `staleTime`, and the `keepPreviousData` lines).
3. Open `frontend/src/components/panels/SensitivityPanel.tsx` line **144** (`useInView`) and `frontend/csp.ts` (lines 8–35).

**Say** (44 words):

> In the front end the whole selection lives in the URL, so every view is shareable and Back works. TanStack Query handles caching, below-the-fold panels load only when scrolled to, and a strict Content-Security-Policy with no inline scripts is enforced by the browser tests.

**On screen you should see:** useAnalysis.ts:59 · hooks.ts:13 · SensitivityPanel.tsx:144 · csp.ts.

### Scene 2.5 — Quality evidence  ·  ≈ 2:14–2:59 into Part 2

**Where:** Terminal, VS Code, Tab 5 (GitHub Actions)

**Do:**

1. Before you start talking, start `make test` in the terminal (about 35 seconds); let the green summary appear while you talk.
2. Open `backend/tests/api/test_api_exact.py` line **13** (closed-form test) and `docs/07-TESTING.md` (the *Mutation checks* table).
3. Open `docs/11-UAT-REPORT.md` and point at the *Defect found by this UAT* table.
4. Switch to Tab 5 (**Ctrl+5**): the latest CI run with five green jobs; click the CodeQL entry for one second.

**Say** (86 words):

> Quality. 358 backend tests, 98 front-end tests, 48 browser tests with accessibility audits, and 80 acceptance checks that drive the deployed site. Fixtures have closed-form answers, so a wrong vintage gives a wrong number. Mutation checks: flip less-or-equal, flip backward to nearest, flip the sign; each is caught. The live acceptance run found a bug the unit tests could not: dragging the zoom handle navigated away. Fixed, with a regression test that fails without the fix. CI covers lint, types, tests, contract drift, Docker and CodeQL.

**On screen you should see:** `make test` ends with 358 passed (backend) and 98 passed (Vitest) · green CI run · CodeQL.

### Scene 2.6 — Docker and deployment  ·  ≈ 2:59–3:26 into Part 2

**Where:** VS Code, then browser

**Do:**

1. Open `docker-compose.yml` lines **15–19** (`x-hardened`: read-only root, `cap_drop: [ALL]`, `no-new-privileges`).
2. Open `render.yaml` and `frontend/vercel.json` (the Content-Security-Policy header).
3. Switch to Tab 1 and then Tab 3 for one second each to show both live URLs.

**Say** (55 words):

> Docker: multi-stage images, non-root users, health checks; Compose runs them read-only with all capabilities dropped. The UI is on Vercel and the API is a Docker service on Render, because pandas and Parquet do not suit serverless functions. The real snapshot is baked into the image, so the demo never depends on Elexon being up.

**On screen you should see:** docker-compose.yml:15–19 · render.yaml · vercel.json.

### Scene 2.7 — Trade-offs, limits, next steps, AI disclosure  ·  ≈ 3:26–4:02 into Part 2

**Where:** VS Code → README §16–17

**Do:**

1. Open `SECURITY.md` for two seconds (section *Known limitations*), then the README at **16. Known limitations** and **17. AI assistance disclosure**.

**Say** (80 words):

> Trade-offs, stated openly. No database: one month does not need one. The 09:20 cutoff is an upper bound on what a buyer knew. WINDFOR's unit and scope are undocumented, so part of the plus 1.7 gigawatt bias may be definitional. Daylight saving is unit-tested, but January has no clock change. Next: more months, lead-time analysis, scheduled refresh. Built with Claude Code as an AI assistant, as the README discloses, and verified by the tests you have seen. Thank you.

**On screen you should see:** README §16, §17 · SECURITY.md.

## 5. If something goes wrong while recording

| Problem | What to do |
|---|---|
| The page says *Still waiting for the API…* | The free host is waking up. Stop recording, wait for `/api/health` to answer, reload the tab, restart the take. |
| A number on screen differs from the script | Say the number on your screen. If the data was re-ingested, run `cd frontend && npm run uat` to see which expectations changed, and update the *Say* text. |
| A click does nothing / you lost your place | Reload the tab: the whole selection lives in the URL, so the view comes back. |
| You are running long (Part over 5:00) | Cut in this order: scene 1.6 → the *Hindsight check* sentence in 1.5 → scene 2.4 → the `docker-compose.yml` lines in 2.6. **Never cut** 1.2, 1.3, 1.5, 2.2 or 2.5. |
| You are unsure about dragging the zoom handles in 1.4 | Skip the zoom; keep the hover, the hindsight toggle and the click-through. |
| `make test` is slow in 2.5 | Run it once before recording and show the green summary from the terminal's scrollback instead. |
| GitHub shows no code or an old README | Hard-refresh the page; if it persists, `main` is not at the merge commit of PR #1. Do not record Part 2 until it is. |

## 6. Numbers cheat sheet (real data, default view: decisions 1–31 Jan, cutoff 09:20)

Source: the committed snapshot (`docs/09-REAL-DATA-FINDINGS.md`). Say them as they appear on screen.

| Item | Where | Value (real data) |
|---|---|---|
| Matched intervals / expected | Executive summary tile | 1,488 / 1,488 |
| Coverage | tile | 100.0 % |
| MAE (MW) and WAPE | MAE tile | 2,042 MW, 18.1 % |
| RMSE | RMSE tile | 2,509 MW (1.23 × MAE) |
| Bias (MW) and over-forecast share | Bias tile | +1,748 MW, 85 % over |
| MAE vs persistence | last tile | −51 % (2,042 vs 4,144 MW) |
| Empirical 80 % error range | Accuracy → Error profile | −544 to +4,140 MW (median +1,592) |
| Worst day / half-hour | Daily error trend / Largest errors | 28 Jan (MAE 5,375 MW) / 12 Jan 01:00, forecast 20,942 vs actual 14,048 (+6,894 MW) |
| Day vs night | Accuracy → Day versus night | day MAE 1,932 · night MAE 2,263 MW |
| Demo vintage (12 Jan 01:00): used-at-cutoff vs latest vs actual | Vintages page | 20,942 (07:30 run) / 21,226 / 14,048 MW |
| Hindsight MAE vs cutoff MAE | Accuracy → Hindsight check | 1,667 vs 2,042 MW |
| Decision brief, decision date **30 Jan → delivery 31 Jan** (used in the video) | Decision brief (click ←) | mean forecast 12,813 MW, peak 16,277 at 00:00, lowest 10,667 at 23:00, 307.5 GWh from 1 publication (07:30); actual mean 10,423 MW, bias +2,390 MW |
| Decision brief, decision date 31 Jan → delivery 1 Feb (the default) | Decision brief | mean forecast 7,142 MW, peak 10,099 at 00:00, lowest 4,915 at 23:00, 171.4 GWh from 1 publication (07:30); actual mean 6,159 MW, bias +983 MW |
| Decision timing | Dashboard → Decision timing | at 09:20 (07:30 run) MAE 2,042 / bias +1,748 MW; 09:30 run 2,016; last run of the day (22:30) MAE 1,830 (−10.4 %), bias +1,603 MW |
| Cutoff finding | Methodology / `docs/09` §3 | the 09:30 run lands 10 minutes after 09:20 on **every** one of 31 days; any cutoff 08:00–09:29 gives identical results |


---

## 7. Likely questions — have answers ready

| Question | Answer |
|---|---|
| Why 09:20? | Earliest GB day-ahead gate closure (EPEX), so nothing is used that couldn't inform *any* auction. It's an assumption, configurable, with N2EX/early presets; real bid prep is earlier, so it's an upper bound. |
| "Decisions in January" — which days? | Ambiguous: default = decisions 1–31 Jan → deliveries 2 Jan–1 Feb; the alternative is deliveries in January. Both supported, never mixed. |
| How do you avoid leakage? | `publishTime <= cutoff` per interval; hindsight kept in separate fields; baselines use only completed actuals; tests tamper with the future. |
| Why not query Elexon live? | Latency, rate limits, outages, and unbounded memory; a checksummed snapshot is reproducible and labelled with retrieval time. |
| WINDFOR is hourly, FUELHH half-hourly — how do you compare them? | It really is hourly (verified live). By default each forecast hour is applied to both half-hours it covers (`hold`); `exact` leaves the other half-hours missing. Never interpolated, never borrows the next hour, cutoff applies to the held value, and the UI states the rule. On January the choice moves MAE by under 1 % (2,042 / 2,023 / 2,039 MW for hold / exact / independent hourly mean). *n* counts half-hours in pairs, so the effective sample is about half. |
| Why is the forecast so high? | I can't tell, and I say so: +1.7 GW (85 % of half-hours over-forecast), even the latest forecast is 1.5 GW high. Elexon describes FUELHH as transmission-connected generation and doesn't say whether WINDFOR covers the same scope, so it could be definitional. Next step: ask Elexon/NESO, repeat over more months. |
| What would you do next / what else did you consider? | Lead-time analysis across more months; asking NESO/Elexon for WINDFOR's scope; hash-pinned Python lockfile; a scheduled multi-month refresh. I did *not* add prices, demand or a database: out of scope and no benefit for one month. |
| Is the API secure? | Read-only public data by design, so no auth; but: strict CORS, typed bounded inputs, one error envelope with no stack traces, per-client rate limit, security headers, admin refresh disabled by default and constant-time compared when enabled, non-root read-only containers, secrets never in the repo (history scanned), dependency audits. The honest limits are in `SECURITY.md` (e.g. the limiter trusts the first forwarded hop). |
| Is it fast? | Warm requests are ~10 ms locally; on the free host an uncached view took 0.3–1.0 s (about 3 s for the decision-timing view) and a cached one ~0.25 s, which is just the network round trip; the dashboard's first-load requests are cache hits right after start-up. Rendered responses are cached per snapshot with ETags (`304` with no computation), the default views are pre-computed at start-up, and below-the-fold analysis loads only when scrolled to. |
| Does the exact cutoff matter? | Not here: the 07:30 run is the latest at any cutoff 08:00–09:29; 09:30 (ten minutes after the default) improves MAE by 26 MW (1.3 %). |
| DST? | UTC internally; local only at the edges; 46/50-half-hour days and BST cutoffs tested. January has no change. |
| What's not verified? | Be upfront. Verified: the live Elexon API (PASS), the real January data, CI green on GitHub (all five jobs plus CodeQL), the live deployment, and 80 acceptance checks that drive every control of the deployed site (`docs/11-UAT-REPORT.md`). Not verified: WINDFOR's unit and scope (assumed MW, scope unknown), which part of the hour a value describes, DST days on real data (January is all GMT), cross-browser use (Chromium only), real assistive technology, and load. |


---

## 8. Upload and verify (YouTube)

1. YouTube Studio → **Create → Upload** → set visibility **Unlisted** (not Private — reviewers can't open Private; not Public).
2. Title: *WindScope UK — day-ahead wind forecast analytics (pitch + technical review)*. Description: repo URL, deployed URL, and chapters:
   `0:00 Customer pitch` · `5:00 Technical review` (adjust to your real cut point).
3. Not "made for kids"; comments off is fine. Wait for processing to finish (HD) before submitting.
4. **Open the link in an incognito window while signed out** and confirm it plays. Check total length ≤ 10:00.
5. Paste the link in the submission form. Also open the GitHub repo, the deployed UI URL and the deployed API URL in incognito (see `docs/06-DEPLOYMENT.md` §6).

## 9. Submission checklist

- [ ] Public GitHub repo with an anonymous name (`nkvsr`), README complete, AI use disclosed (§17), deployment URLs filled **only after** verification
- [ ] Deployed UI and API URLs open in incognito; dashboard shows real data, no synthetic banner
- [ ] Unlisted YouTube video ≤ 10 min, plays in incognito
- [ ] Form submitted with all three URLs
