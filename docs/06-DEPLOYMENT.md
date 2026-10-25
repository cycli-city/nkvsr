# 06 — Deployment runbook

> **Nothing has been deployed yet.** The build environment had no access to Vercel/Render and no credentials. This
> runbook is what *you* do; the configs it uses are in the repo and have been validated for syntax and (for Docker)
> exercised locally. Do not write a URL into the README until step 6 passes.

## Topology

```
Browser ──HTTPS──▶ Vercel (static Vite build, SPA rewrites)
   │
   └──HTTPS (CORS: allowed origin = the Vercel URL)──▶ Render web service (Docker image of backend/)
                                                          └─ snapshot baked into the image (data/snapshots/current)
```

**Why this split (ADR-012):** Vercel is ideal for the static React build. The API needs pandas + pyarrow (~400 MB
installed) and a read-mostly in-memory dataset; that exceeds comfortable Vercel Python-function limits and would reload on
every cold start. A container keeps production identical to local Docker. If you must use a single platform, Heroku
(container stack, `heroku.yml`) can host the API, but it is **not verified** here.

## 0. Prerequisites you must satisfy

| Need | Why | Action |
|---|---|---|
| GitHub write access for the Claude app (or push from your own machine) | the sandbox's `git push` returned 403 | install the app at <https://github.com/apps/claude/installations/select_target> or push the local branch yourself |
| A machine that can reach `data.elexon.co.uk` | real data + schema verification | your laptop is fine |
| Vercel + Render accounts | hosting | free tiers suffice |

## 1. Verify Elexon and build the real snapshot (on a connected machine)

```bash
git clone <repo> && cd <repo> && make setup
make verify-upstream     # writes docs/generated/elexon-verification.md + backend/tests/fixtures/real/*.json
make ingest              # writes data/snapshots/current/{actuals,forecasts}.parquet + manifest.json
python -m app.cli inspect            # (from backend/, venv active) prints the manifest
```

Read `docs/generated/elexon-verification.md` **before** trusting any number:

* If it says FAIL or lists missing fields/parameters: fix `backend/app/elexon/endpoints.py` / `contract.py` (the only files
  that encode upstream assumptions), re-run, and keep the captured samples as real test fixtures.
* Confirm `generation` magnitudes are plausible MW (a few thousand to ~15,000) and update
  `docs/04-DATA-SOURCE-VERIFICATION.md` (flip UNVERIFIED → VERIFIED with the evidence).
* Check `manifest.json`: `provenance: "elexon_live"`, `warnings` is empty or understood, forecast resolution/cadence noted.

Commit the vetted snapshot and the verification output:

```bash
git add data/snapshots/current docs/generated backend/tests/fixtures/real docs/04-DATA-SOURCE-VERIFICATION.md
git commit -m "data: real Elexon snapshot for January 2026 decisions + verified API behaviour"
git push
```

The snapshot is small (Parquet, zstd) — check with `du -sh data/snapshots/current` (expect a few MB).

## 2. Deploy the API on Render

1. Render dashboard → **New → Blueprint** → select the repo (`render.yaml` is picked up automatically).
2. When prompted, set **`CORS_ORIGINS`** to a placeholder (`https://example.invalid`) — you'll fix it in step 4.
3. Wait for the build (several minutes: it installs pandas/pyarrow). The service uses `/api/health` as its health check.
4. Note the URL, e.g. `https://windscope-api.onrender.com`.

Free-tier note: the service sleeps after ~15 min idle and takes up to ~1 minute to wake. The UI detects slow starts and says
so ("Still waiting for the API…"), and the client waits up to 60 s. Warm it before a demo by opening `/api/health`.

## 3. Deploy the UI on Vercel

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`. Framework preset: **Vite** (auto). Build command/output come from `frontend/vercel.json`.
3. **Environment variable:** `VITE_API_BASE_URL` = the Render URL from step 2 (no trailing slash). *It is baked in at build time —
   changing it requires a redeploy.*
4. Deploy. Note the URL, e.g. `https://windscope-uk.vercel.app`.

## 4. Close the CORS loop

Render → service → **Environment** → set `CORS_ORIGINS=https://<your-project>.vercel.app` (add a custom domain / preview URLs
comma-separated if you use them) → save (redeploys). Without this the browser console shows
`blocked by CORS policy` and the UI says "Can't reach the API".

## 5. Alternative without CORS: proxy `/api` through Vercel

Add to `frontend/vercel.json` *before* the SPA rewrite and leave `VITE_API_BASE_URL` empty:

```json
{ "source": "/api/:path*", "destination": "https://<render-host>/api/:path*" }
```
Trade-off: hides the API host and avoids CORS, but a sleeping free-tier API may exceed Vercel's proxy timeout. The default
(direct calls + CORS) is recommended.

## 6. Verification checklist (do ALL, in a private/incognito window)

The submission form asks for each URL to be opened in incognito. Tick these in a fresh incognito window:

- [ ] `https://<api>/api/health` → `{"status":"ok",…,"data_loaded":true}`
- [ ] `https://<api>/api/metadata` → `provenance.provenance` is `"elexon_live"` and `is_synthetic` is `false`
- [ ] `https://<api>/api/docs` renders Swagger UI
- [ ] `https://<ui>/` loads the dashboard with **no red "SYNTHETIC" banner**, source reads "Elexon BMRS", numbers present
- [ ] Browser devtools console: no CORS or 4xx/5xx errors
- [ ] Hard-refresh on `https://<ui>/intervals` and `/vintages?start=…` works (SPA rewrite)
- [ ] Switching "January means…" and the cutoff updates the numbers and the URL; the URL, pasted in another window, restores the view
- [ ] Methodology page shows the data-quality report with real row counts and no warnings you cannot explain
- [ ] Mobile width (devtools 390 px): no horizontal scroll; controls collapse behind **Edit**
- [ ] Repo is **public**, README renders, and the deployment table in README §15 now contains the two verified URLs
- [ ] YouTube video is **Unlisted** and plays while logged out; its link is in the form

Only after every box is ticked, edit README §15 with the URLs and commit.

## 7. Operating notes

* **Refresh data:** re-run `make ingest`, commit the snapshot, redeploy. Or set `ADMIN_TOKEN` (≥16 chars) and
  `curl -X POST https://<api>/api/admin/refresh -H "X-Admin-Token: …"` (writes to the container's ephemeral disk; lost on redeploy).
* **No snapshot in the image?** Set `AUTO_INGEST_ON_START=true` (the Render blueprint does): the API starts, reports "no data"
  honestly, ingests in the background, then serves. If Elexon is unreachable the failure is shown in the UI.
* **Logs:** structured request log per call (`METHOD path -> status (ms)`); ingestion progress at INFO.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| UI: "Can't reach the API", console CORS error | `CORS_ORIGINS` doesn't exactly match the UI origin (scheme + host, no trailing slash) |
| UI: "Can't reach the API", no CORS error | wrong `VITE_API_BASE_URL` (needs redeploy), or API asleep / crashed (check Render logs) |
| UI: "No Elexon data is loaded yet" | no snapshot in the image and ingestion failed/not run; read `/api/metadata` → `refresh.error` |
| API log: "Refusing to serve synthetic development data" | the committed snapshot was generated by `make synthetic`; re-ingest real data |
| API log: "Checksum mismatch" | snapshot files edited or partially committed; re-run `make ingest` and commit both Parquet files and the manifest together |
| Render build OOM / slow | free-tier builder; retry, or pre-build and push the image to a registry |
| 502 from refresh | Elexon unreachable/changed; the previous snapshot is still being served; see `refresh.error` |
