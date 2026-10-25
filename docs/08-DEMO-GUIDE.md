# 08 — Demo kit: recording plan, pitch script, technical walkthrough

> I cannot record or upload the video; this guide makes it straightforward for you. **Every number below is a
> blank for you to read off the screen after loading REAL data.** Never read a number from a synthetic-data run (red
> banner) — if the banner is visible, stop and fix the data first.

Limit: **10 minutes total** — Part 1 (customer pitch) ≤ 5:00, Part 2 (technical review) ≤ 5:00. Aim for ~4:30 each.

## A. Pre-flight checklist (15 min)

- [ ] Real data loaded: `make ingest` done, **no red SYNTHETIC banner**, methodology page shows `elexon_live` and a sensible quality report.
- [ ] You ran `make verify-upstream` and read `docs/generated/elexon-verification.md` (so you can say what the API *actually* returns).
- [ ] Decide your demo path and **rehearse it twice**. Write the real numbers in the table in section B.
- [ ] Browser: clean profile / incognito, 1920×1080, zoom 110 %, bookmarks hidden, notifications off (Do Not Disturb).
- [ ] Tabs ready: (1) dashboard, (2) `/vintages` for your chosen half-hour, (3) `/methodology`, (4) GitHub repo, (5) editor with the files in section D, (6) a terminal.
- [ ] If using the deployed site, warm the API first (open `/api/health`) so you don't narrate a 60-second cold start.
- [ ] Recording tool: OBS Studio / Loom / QuickTime. 1080p, 30 fps, mic check, record system audio **off**.

## B. Numbers to read off the screen (fill in from REAL data)

| Item | Where | Value |
|---|---|---|
| Matched intervals / expected | Executive summary tile | ____ / ____ |
| Coverage | tile | ____ % |
| MAE (MW) and WAPE | MAE tile | ____ MW, ____ % |
| Bias (MW) and over-forecast share | Bias tile | ____ MW, ____ % over |
| MAE vs persistence | last tile | ____ % |
| Empirical 80 % error range | Accuracy → Error profile | ____ to ____ MW |
| Worst day / half-hour | Daily error trend / Largest errors | ____ |
| Demo vintage: used-at-cutoff vs latest vs actual | Vintages page | ____ / ____ / ____ MW |
| Hindsight MAE vs cutoff MAE | Accuracy → Hindsight check | ____ vs ____ MW |

---

## C. PART 1 — Customer pitch (≤ 5:00)

**Audience:** the day-ahead procurement team at a GB energy utility. **Goal:** show that this answers their two questions,
with numbers they can trust and honest limits. **Tone:** confident, specific, no hype.

| Time | On screen | Say (adapt to your voice) |
|---|---|---|
| 0:00–0:25 | Dashboard top | "Every morning your desk commits to buy power for tomorrow before it knows how much wind will blow. You need two things: the wind forecast you could actually see at the cutoff, and how wrong that forecast tends to be. WindScope does both, using only Elexon's published wind outturn and forecasts." |
| 0:25–1:15 | Controls bar, then **Executive summary** | "This is our pilot analysis of decisions made in January 2026. [Matched] of [expected] half-hours are matched — [coverage]% — and the badge says the data supports the analysis. Note the source and last refresh at the top; this is real Elexon data, not a sample." Point at the interpretation selector: "January is ambiguous — decisions made in January, or deliveries in January — so you can switch, and the two are never mixed." |
| 1:15–2:15 | **Decision brief** (step back one day) | "Take the decision on [date]. At [09:20], the latest forecast on the table for the next day averaged [mean] MW, peaking at [peak] at [time]. This is the forecast set from [n] publications — nothing published after the cutoff is used. Below, in hindsight, what actually happened: [mean actual], so the forecast was [over/under] by [bias]." |
| 2:15–3:00 | **Timeline** | "Over the month, forecast at the cutoff against actual, in megawatts, UK time. The forecast tracks the shape well but misses at ramps. Toggle the dashed line: that is the latest forecast including revisions published *after* the cutoff — useful context, but you could not have bought on it, so it never enters a KPI." |
| 3:00–4:00 | **Accuracy** | "In business terms: on average the forecast is off by [MAE] MW — [WAPE]% of wind output. The bias is [bias] MW, with [x]% of half-hours over-forecast. Over-forecasting is the risky direction — less wind than predicted leaves you short. In 80% of half-hours the error was between [low] and [high] MW, so that is the band to hold in reserve. Errors are worst [time-of-day/day]. It beats a naive 'same as now' forecast by [%]." |
| 4:00–4:35 | **Vintages** page | "Click any half-hour to see how its forecast evolved. Each dot is a publication; only the ones left of the red cutoff line could have informed the bid. Here the forecast used was [used] MW, it was later revised to [latest], and the actual was [actual]." |
| 4:35–5:00 | Methodology page / footer | "Two honest limits. This is wind only — your net requirement also depends on demand, other generation, hedges and balancing, which are outside this data. And the numbers describe January; they are an uncertainty allowance for the wind component, not a guarantee. Within that scope you can see the forecast you had, and the error you should plan for." |

**Don't:** claim it computes purchase volumes; read synthetic numbers; promise future accuracy; skip the limits.

---

## D. PART 2 — Technical review (≤ 5:00)

**Audience:** the tech lead. **Goal:** make review easy; show judgement, not just code. Keep the editor tabs in this order.

| Time | Show | Say |
|---|---|---|
| 0:00–0:40 | README §3 architecture diagram | "FastAPI + pandas backend, React/TS front end. Key decision: ingest once into a checksummed Parquet snapshot; request handlers never call Elexon. That makes the API fast, deterministic, outage-proof, and bounded in memory. The domain layer is pure — no I/O — because that's where correctness risk lives." |
| 0:40–1:30 | `backend/app/elexon/{endpoints,contract,client,normalize}.py` | "All upstream assumptions are in `endpoints` and `contract`. I couldn't reach Elexon from my build environment, so rather than guess, I isolated the assumptions, made the contract check fail loudly, and wrote `verify-upstream` to record reality. [Once you have run it: say what it confirmed, and anything it made you correct.] The client retries 429/5xx with `Retry-After`, bounds concurrency, and chunks windows. Normalisation drops and *counts* bad rows by reason, rejects naive timestamps, dedupes with conflict counts — nothing is imputed." |
| 1:30–2:30 | `domain/timeutil.py::cutoff_utc_for_delivery_date`, `domain/vintage.py::select_at_cutoff` | "The core rule: for each half-hour, the latest publication with `publishTime <= cutoff(D-1)`. `merge_asof` with `by=startTime`, backward, exact matches allowed — exactly one row per interval, so revisions cannot inflate the sample. Timestamps are UTC internally; London local only for delivery days and cutoffs, with 46/48/50-half-hour days tested. I normalise to nanosecond UTC because pandas 3 parses to microseconds and `merge_asof` rejects mixed units." |
| 2:30–3:10 | `domain/matching.py`, `domain/metrics.py` | "One canonical table, one row per *expected* half-hour, so gaps are visible. All metrics use one eligible set; unavailable metrics are `None`, never zero; WAPE guards the zero denominator. Baselines — persistence and trailing mean — only use actuals completed before the cutoff, and a test tampers with the future to prove it." |
| 3:10–3:50 | `tests/` + terminal: `make test`, then `make e2e` highlights | "Exact fixtures with closed-form answers mean a wrong vintage gives a wrong number. I mutation-tested the critical lines — flip `<=`, `backward`→`nearest`, the sign — and each is caught. Playwright plus axe found real bugs the unit tests couldn't: Recharts 3 returns the click index as a string, so the timeline drill-down never fired; and contrast/ARIA issues." |
| 3:50–4:30 | Terminal: `docker compose up --build`; browser on :8080 | "Docker: multi-stage, non-root, health-checked; nginx serves the SPA and proxies `/api`, so single origin. The snapshot is baked into the API image so a hosted demo never depends on Elexon. Production refuses synthetic data; I use a labelled synthetic snapshot only for offline UI work." |
| 4:30–5:00 | README *Verification status* + limitations | "Trade-offs: no database, Parquet snapshot; cutoff is an upper bound; wind-only scope; one month. Next: lead-time analysis, scheduled multi-month ingestion, quantile forecasts." |

**Technical walkthrough checklist (for the reviewer / your Q&A):**

- [ ] `docs/DECISIONS.md` ADRs · `docs/02-DOMAIN-ASSUMPTIONS.md` (what is fact vs assumption)
- [ ] `backend/app/domain/vintage.py` and `tests/unit/test_vintage.py` side by side
- [ ] `backend/app/services/ingestion.py` → failure keeps the previous snapshot (`TestFailureKeepsServingPreviousSnapshot`)
- [ ] `frontend/src/state/useAnalysis.ts` (URL as state) and `src/api/client.ts` (error classes)
- [ ] `.github/workflows/ci.yml` jobs · `docker-compose.yml` · `Makefile`

### Likely questions — have answers ready

| Question | Answer |
|---|---|
| Why 09:20? | Earliest GB day-ahead gate closure (EPEX), so nothing is used that couldn't inform *any* auction. It's an assumption, configurable, with N2EX/early presets; real bid prep is earlier, so it's an upper bound. |
| "Decisions in January" — which days? | Ambiguous: default = decisions 1–31 Jan → deliveries 2 Jan–1 Feb; the alternative is deliveries in January. Both supported, never mixed. |
| How do you avoid leakage? | `publishTime <= cutoff` per interval; hindsight kept in separate fields; baselines use only completed actuals; tests tamper with the future. |
| Why not query Elexon live? | Latency, rate limits, outages, and unbounded memory; a checksummed snapshot is reproducible and labelled with retrieval time. |
| What if WINDFOR is hourly? | Resolution is measured from data; half-hours with no forecast count as missing (visible), never interpolated. |
| DST? | UTC internally; local only at the edges; 46/50-half-hour days and BST cutoffs tested. January has no change. |
| What's not verified? | Be upfront: [state what you confirmed with `verify-upstream`; deployment status; CI run]. |

---

## E. Upload and verify (YouTube)

1. YouTube Studio → **Create → Upload** → set visibility **Unlisted** (not Private — reviewers can't open Private; not Public).
2. Title: *WindScope UK — day-ahead wind forecast analytics (pitch + technical review)*. Description: repo URL, deployed URL, and chapters:
   `0:00 Customer pitch` · `5:00 Technical review` (adjust to your real cut point).
3. Not "made for kids"; comments off is fine. Wait for processing to finish (HD) before submitting.
4. **Open the link in an incognito window while signed out** and confirm it plays. Check total length ≤ 10:00.
5. Paste the link in the submission form. Also open the GitHub repo and the deployed UI URL in incognito (see `docs/06-DEPLOYMENT.md` §6).

## F. Submission checklist

- [ ] Public GitHub repo with an anonymous name (`nkvsr`), README complete, AI use disclosed (§17), deployment URLs filled **only after** verification
- [ ] Deployed UI and API URLs open in incognito; dashboard shows real data, no synthetic banner
- [ ] Unlisted YouTube video ≤ 10 min, plays in incognito
- [ ] Form submitted with all three URLs
