# Security policy

WindScope UK is a demonstration analytics product built for a hiring challenge. It serves **public, read-only market
data** and holds no user accounts, personal data or payment information.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** (repository → *Security* → *Report a vulnerability*) rather than
a public issue. Include what you found, how to reproduce it, and the impact you expect. Reports are read on a
best-effort basis; there is no bounty.

## Security model, in one screen

| Area | What is in place |
|---|---|
| Secrets | None in the repository (full history scanned); `.env*` is ignored apart from the placeholder `.env.example`; CI has read-only permissions |
| Admin surface | `POST /api/admin/refresh` is **disabled** unless `ADMIN_TOKEN` (≥ 16 characters) is set, compared in constant time |
| API exposure | Read-only `GET` endpoints, typed and bounded parameters, one error envelope that never includes stack traces, CORS limited to the configured UI origins, per-client rate limiting (HTTP 429) |
| Response headers | API: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, a deny-all `Content-Security-Policy`, HSTS over HTTPS. UI: a strict CSP without `unsafe-inline`/`unsafe-eval`, plus the same set (checked by tests) |
| Data integrity | Snapshots carry SHA-256 checksums and are written atomically; a corrupt snapshot is refused; synthetic development data is refused when `APP_ENV=production` |
| Containers | Multi-stage builds, non-root users, health checks; Compose runs the services with a read-only root filesystem, all capabilities dropped and `no-new-privileges` |
| Supply chain | Dependabot (pip, npm, Docker, Actions), CodeQL, and a scheduled `pip-audit` / `npm audit` workflow; the committed lockfile pins the frontend tree |

## Known limitations (deliberate, for a public demo)

* The API is **unauthenticated by design**: the data is public and the UI must be able to reach it from a browser.
* The rate limiter identifies clients by the first `X-Forwarded-For` hop. A client can spoof it to evade *its own* limit but
  cannot spend anyone else's. Network-level abuse is the hosting edge's job (the free Render tier sits behind Cloudflare).
* Python dependencies are declared with compatible-version ranges rather than a hash-pinned lockfile.
* There is no WAF, bot protection or audit logging.

See `docs/03-ARCHITECTURE.md` for the design and `docs/07-TESTING.md` for what is tested.
