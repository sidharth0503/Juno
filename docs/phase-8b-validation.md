# Phase 8B validation — 2026-09-29

## Verified locally

- Full backend pytest: **223 passed** on Python 3.14.7.
- Frontend `npm test`: **28 passed**; lint, typecheck and production build passed
  on Node 22.23.3 / Next.js 16.3.6.
- A fresh `.venv-check` installed `backend/requirements.txt` successfully and
  imported `app.main:app` without activation. TestClient health returned exactly
  `{"status":"ok"}`. Provider cookie-cache location was under the OS temp directory.
- All 128 checked local application imports resolved with exact filename casing.
- Production browser smoke through the test routing harness passed: all six tabs,
  offline company fixtures, missing data/manual overrides, actual model/sensitivity,
  trace loading/formula/provenance/error/retry/stale state, actual XLSX downloads,
  API outage/recovery, and no uncaught exceptions. Every observed API request used
  the same frontend origin. Health also passed through the shared origin.
- Vercel CLI **61.0.0**, run through `npx --yes vercel@latest`, recognized both
  configured services using `vercel dev -L --listen 127.0.0.1:4001 --non-interactive`.
  Frontend root and health returned 200. Actual local Vercel HTTP requests passed
  calculation, sensitivity, trace, XLSX MIME + seven-sheet openpyxl validation,
  invalid ticker 422, and nosniff header checks.
- Golden trace through both local routing paths: Year 5 EBITDA
  **382.88446875000005**, IRR **0.19774419347797179**. No formula changes.

The initial production-like browser run failed because of an off-by-one prefix
slice in the test proxy. The harness was fixed and the entire browser regression
passed on rerun. This did not affect application or Vercel routing.

## Not verified on Vercel infrastructure

`vercel whoami` failed with an invalid-token message (the CLI also emitted an
update-worker timeout/EPIPE warning). No project was linked. The noninteractive
`vercel build` attempt stopped with `project_settings_required`; it did not
produce a deployable Vercel build. No arbitrary project was created or selected.
The local development command creates ignored `.vercel/` cache files only.

No preview or production deployment was performed. Hosted Python 3.12 Linux
packaging, deployed Yahoo behavior, cold-start latency and function limits remain
preview checks. Automated company tests use offline fixtures; they are not a
claim that Yahoo works reliably from Vercel.

Use the README's login/link/Services configuration/pull/build/preview steps.
Services configuration follows the current official guide and example, and was
accepted by the local CLI. The test proxy is supplementary and does not emulate
Vercel serverless infrastructure.

Existing warnings: Starlette TestClient deprecates its httpx adapter; Node's test
runner reports package module-type detection. Neither caused test failures.
