# Juno

Juno is a browser-based professional leveraged buyout financial modeling terminal.

## Architecture

- `frontend/`: Next.js App Router, React, TypeScript, Tailwind CSS, and ESLint.
- `backend/`: Python, FastAPI, and Pydantic. The deterministic `GET /health`
  endpoint returns HTTP 200 with exactly `{"status":"ok"}`.
- `backend/app/financial/`: standalone, typed five-year LBO calculation engine.
- `docs/financial-engine.md`: model conventions and golden-case derivation.

The terminal frontend automatically calculates the golden-case demo on load,
using browser `fetch` against `POST /api/v1/model/calculate`. Editable assumptions
and all required historical inputs are in the sidebar. RUN MODEL recalculates;
RESET MODEL restores demo inputs and recalculates in manual mode. With a loaded
company it resets assumptions only, preserving historical inputs and overrides. Inputs remain usable when the
API is disconnected. No backend is needed to build the frontend; Next.js fetches
Inter and JetBrains Mono at build time and serves those fonts locally at runtime.

## Prerequisites

- Node.js 20.9 or newer (Node.js 22 recommended).
- npm (included with Node.js).
- Python 3.12 or a compatible newer version, with pip and venv.

## Backend setup and development

From the repository root, using Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

On macOS/Linux:

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

No backend environment variables or secrets are needed; `backend/.env.example`
documents this. Expand the CORS origin list in `backend/app/core/config.py` when
needed. It currently allows `http://localhost:3000` for GET and JSON POST requests.

## Frontend setup and development

In a second terminal, from the repository root:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

On macOS/Linux use `cp .env.example .env.local` for the copy command.
`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000` in development and to
same origin in production. Set it in `.env.local`
to change the backend URL, then restart development or rebuild the frontend.
Variables prefixed `NEXT_PUBLIC_` are public browser configuration, never secrets.

## Checks

Backend, from `backend/` in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

On macOS/Linux: `.venv/bin/python -m pytest`. With the virtual environment
activated, the equivalent command is `python -m pytest`.

Frontend, from `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

Type checking generates Next.js route types, then runs `tsc --noEmit`.
To serve the production build locally, run `npm start` after `npm run build`.
With `.env.local` copied from the example, that build calls the separate backend.
For the production same-origin routing check, remove the local URL override
before building and follow the deployment verification instructions below.

`npm test` uses Node's built-in test runner and TypeScript stripping (Node.js
22.6+ is required for this test command). It covers unit conversions, formatting,
request mapping and API errors without an extra test framework. An optional
local browser smoke check is available once both servers are running:

```powershell
node tests/browser-smoke.mjs "$env:TEMP\lbo-terminal-verification"
```

Run it from `frontend/`. It uses an installed Chrome in headless mode; override
`CHROME_PATH` if Chrome is elsewhere. It verifies 1440×900 and 1280×900 layouts,
tab navigation, edits, reset, live API calls, errors and recovery, then saves
screenshots outside the repository. No browser-testing dependency is installed.

Dependency notes: ESLint 9.39.5 is used because the plugins bundled with the
current Next.js ESLint configuration do not yet accept ESLint 10. npm emits an
end-of-support warning for ESLint 9; update when those plugins are compatible.
The backend TestClient currently emits a Starlette deprecation warning for
httpx; the health tests still pass. No extra HTTP testing library is installed.

## Local URLs

- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (the root itself has no route)
- FastAPI documentation: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- Model calculation: `POST http://localhost:8000/api/v1/model/calculate`

## Current Development Status

Phase 1 adds a standalone Python LBO engine with a five-year projection,
operating model, working-capital schedule, PP&E schedule, debt cash sweep,
LBO return calculations, and automated numerical engine tests.

The terminal frontend now exposes the engine through a thin FastAPI adapter.
Summary, Income Statement, Cash Flow, Balance Sheet, Debt Schedule and Returns
views display actual API outputs. The balance-sheet diagnostics remain visible.
Input changes and failed recalculations mark the previous result clearly.
The health endpoint remains unchanged. Python callers can still use
`run_lbo_model(historical, transaction_assumptions, operating_assumptions)` with
the typed inputs exported by `app.financial`, from the backend directory.
See [financial engine documentation](docs/financial-engine.md) for usage and conventions.

The Returns view now displays real entry/exit IRR and MOIC sensitivity matrices.
EXPORT XLSX downloads a formatted, values-only workbook generated by the backend.
Ticker loading and manual overrides remain supported. No authentication, saved-model
database, hosted deployment, Docker, or CI/CD is implemented. The balance sheet remains
indicative rather than transaction-adjusted.

## Calculation API contract

Request keys are `historical`, `transaction_assumptions`, and
`operating_assumptions`; the nested fields match the engine's Pydantic inputs.
API percentage values are decimal fractions (70% is `0.70`). The frontend's
`model-inputs.ts` is the sole conversion boundary between displayed percentages
and API input units. Outputs are never rounded in state.

The response is the existing `LBOResult`: `transaction`, `historical`,
`historical_cogs_ratio`, `projected_years`, `returns`, and `diagnostics`.
Schema validation returns HTTP 422; financial-model validation returns HTTP 400
with `detail: { code: "financial_model_error", message: "..." }`. The frontend
handles these errors, server errors, request timeouts and network failures.
The engine's financial conventions and dependencies are unchanged.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation),
[FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/), and
[FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/).


## Company data API and ticker workflow (Phase 5)

`GET /api/v1/company/{ticker}` returns typed company metadata, up to three annual
historical periods ordered **oldest to newest**, the latest available `base_year`,
field provenance, warnings, and `units: "millions"`. Quarterly statements and LTM
reconstruction are not used. Period dates are those reported by the provider.

Architecture: thin API route → company service → `FinancialDataProvider` protocol
→ `YFinanceProvider` adapter → centralized normalization → Pydantic internal schema.
Only the adapter imports yfinance or handles DataFrames; the financial engine and
calculation endpoint are unchanged. Another provider can implement the protocol
without changing model formulas or the frontend contract.

Enter a ticker and press **LOAD** (or Enter). Typing alone does not fetch. A successful
load imports all ten latest annual base inputs, replaces company context and data
warnings, and clears the previous model result. **RUN MODEL** is a separate action
using the current form and the existing calculation endpoint. Failed loads preserve
the last successful company, inputs, manual overrides, and result.

Imported fields show **SRC**; editing marks **MANUAL** and that value wins when running.
Missing fields show blank **REQUIRED / MISSING**, never zero. Every required model field
must be supplied before the request can run. Actual reported zeros remain zero.
The sidebar includes an expandable annual history and provider warnings. History
always shows source data, even when the editable base values have manual overrides.
**RESET MODEL** resets assumptions only when a company is loaded, without calculating;
**RELOAD COMPANY** restores source values and SRC labels (using the backend cache when
fresh). In demo mode RESET MODEL restores and recalculates the original demo.

### Financial definitions and units

Provider amounts are absolute currency values. `data/normalization.py` divides by
1,000,000 **exactly once**. API, editable form, model inputs, and model outputs then
use **millions**. Percentages still cross the separate display/API conversion boundary.
Currency comes from `financialCurrency`, not trading currency. Unknown currency is
explicitly labeled; EUR is displayed as EUR. No foreign-exchange conversion occurs.

| Internal field | Prioritized provider rows |
| --- | --- |
| revenue | TotalRevenue, OperatingRevenue |
| cogs | CostOfRevenue, CostOfGoodsSold |
| ebitda | EBITDA only |
| cash | CashAndCashEquivalents; broader CashCashEquivalentsAndShortTermInvestments only with warning |
| accounts_receivable | AccountsReceivable, NetReceivables |
| inventory | Inventory |
| accounts_payable | AccountsPayable |
| ppe | NetPPE only; never gross PPE |
| debt | TotalDebt only; never total liabilities, AP, or net debt |
| shareholders_equity | StockholdersEquity; CommonStockEquity fallback with warning |

CamelCase and spaced labels normalize equivalently. Priority decisions between
conflicting reported rows generate warnings. No EBITDA or COGS fallback formula
is implemented. Fields carry `reported` / `missing` provenance and source row names;
the schema also permits future explicitly tested `derived` values. Missing values,
including NaN placeholders, remain JSON null. Empty provider columns are omitted.
Incomplete histories and unsupported financials are reported honestly.

### Provider robustness and limitations

The service maintains a bounded 64-ticker, 30-minute in-memory cache. It does not
persist across backend restarts. Provider HTTP requests have an 8-second cap and
share a 40-second network budget; browser loading times out after 45 seconds.
Concurrent uncached provider requests receive 503 while the shared yfinance session
is busy. No retry framework, external cache, or application database is introduced.
yfinance brings its own transitive packages (including pandas, NumPy and peewee)
and may manage provider cookies/cache internally; these are not model dependencies
or application persistence.

Invalid ticker syntax returns 422; confirmed unresolved tickers return 404 where
Yahoo supplies that signal. Ambiguous resolution/network failures return 502,
provider contention returns 503, and unsupported annual data returns 422. Useful
partial financial data returns 200 with nulls and warnings. Yahoo availability,
rate limiting, reporting gaps, row definitions, and fiscal-date conventions vary.
The data is not an audited filing substitute. Banks and other unsupported statement
structures may need extensive manual inputs. No ticker is guaranteed complete.

All automated company tests use offline fixtures or mocked provider calls. The
browser smoke test intercepts company GETs with fixtures and uses the real local
model POST endpoint. Manual live AAPL verification is separate from automated tests.
The five-year model's existing simplified balance sheet and financing conventions
remain unchanged; loading a real company does not make those conventions suitable
for every transaction.


## Real sensitivity and Excel export

`POST /api/v1/model/sensitivity` accepts the calculation inputs plus optional
`entry_multiples` and `exit_multiples`. Each defaults to `[8,9,10,11,12]`.
Rows are entry multiples; columns are exit multiples, preserving supplied order.
Each axis must contain 1–10 positive finite values (maximum 100 full engine runs).
The response contains both axes, typed cell outputs, current base-case indices,
and warnings. An absent exact base combination is not highlighted. Null IRR stays
null and displays as N/A. Each cell calls the complete existing Python engine.

After RUN MODEL succeeds, sensitivity refreshes using that same input snapshot.
Edits clear it; no requests run on keystrokes. Sensitivity failure preserves the
base model and offers a separate retry. Colors use IRR thresholds: below 15% red,
15–20% amber, above 20% green, null neutral. Blue outlines identify the current base.
The frontend uses the default grid; custom grids are supported through the API.

`POST /api/v1/model/export` accepts the same inputs and optional sensitivity grids,
plus optional `company` metadata (`ticker`, `company_name`, `currency`, `fiscal_year`,
`provider`). Client output arrays are rejected. The backend recalculates the model
and sensitivity and uses openpyxl to return an XLSX with the correct MIME type and
sanitized filename. CORS exposes Content-Disposition for browser downloads.

The seven workbook sheets are LBO Summary, Operating Model, Income Statement,
Cash Flow, Balance Sheet, Debt Schedule, and Sensitivity. Blue numeric fonts indicate
inputs; dark fonts indicate Python outputs. Warnings remain visible in red. Native
number formats, year headers, freeze panes, restrained sensitivity colors, print
areas and widths are configured. Amounts remain **millions**, without additional
scaling or FX conversion. Financial cells remain numeric; null IRR displays N/A.

EXPORT XLSX captures current inputs at click time, including manual overrides,
without requiring ticker loading or a prior successful calculation. In manual demo
mode the frontend supplies USD context without inventing a ticker. Loading and error
states are separate from model/sensitivity states. Duplicate exports are disabled;
failures preserve results and allow retry. Editing during export does not change
the captured workbook request.

Workbooks are **values-only snapshots**, not independently recalculable Excel models.
Changing workbook inputs does not update outputs; use the terminal and re-export.
No macros, external links, or full Excel formula model are generated. Historical
schedule blanks indicate unavailable/not-applicable values. Expense and paydown
rows retain the engine's positive expense convention. Simplified balance-sheet
imbalances and all engine limitations remain visible. Provider context does not
imply every current base value is provider-sourced: manual overrides are included.

Phase 6A was fully validated before export implementation; see
[checkpoint record](docs/phase-6a-checkpoint.md). Automated workbook tests reload
in-memory files with openpyxl and verify values, types, styles, scale, nulls,
custom-grid orientation, determinism, metadata handling, and HTTP responses.
Browser smoke checks include actual downloads, export error/retry and overrides.

## Model Trace (Phase 8A)

Click a projected financial value, headline metric, or return KPI to open
**MODEL TRACE**. The right panel shows the current value, formula, input values,
origin labels, direct dependencies, direct downstream links, and model conventions.
Calculated dependencies can be inspected in the same panel. Close or press Escape;
editing inputs closes and invalidates the trace, even if the edit is later reverted.
Errors offer a separate retry without affecting model results.

`POST /api/v1/model/trace` accepts the calculation inputs plus `metric_key`, an
annual `year` (1–5), and optional `historical_provenance`. Transaction/return
metrics must omit the year. Unknown metrics or invalid years return 422.
Client-calculated outputs are rejected. A noncomputable IRR returns null with an
explanation, not an error. The service runs the authoritative model once and reads
its results; formula text and dependency relationships are declarative, with no
second calculation engine. Internal values are not rounded.

All 31 projected fields and eight transaction/return metrics are supported,
including operating results, working capital, PP&E, cash, equity, debt paydown,
valuation, MOIC, and IRR. SOURCE/DERIVED labels reflect imported field metadata;
manual overrides and assumptions show MANUAL, engine outputs CALCULATED, and
fixed conventions CONVENTION. Historical origin metadata is supplied by the
client and explicitly labeled as descriptive, not independently verified evidence.
Trace always uses the current form, including edits since the last RUN MODEL.

The pre-deployment checks are recorded in
[Phase 8A checkpoint](docs/phase-8a-checkpoint.md).

## DEPLOYMENT — VERCEL

Phase 8B prepares **one Vercel Services project**, with repository root as its
Root Directory and **Services** selected as its framework in the dashboard.
`vercel.json` defines `frontend/` as Next.js and `backend/` as FastAPI, entrypoint
`app.main:app`. Each service installs/builds independently using its existing
package/requirements files. No custom install/build command or Docker is needed.
Set the frontend Node version to 22.x in project settings. Backend
`.python-version` selects supported Python 3.12; local Python 3.14 also works.

This follows the current [Vercel Services guide](https://vercel.com/kb/guide/vercel-services)
and [official Next.js/FastAPI example](https://github.com/vercel/examples/tree/main/services/nextjs-fastapi),
using `services` and explicit service rewrites, not the older
`experimentalServices`/`routePrefix` configuration. Vercel preserves incoming
paths, so no FastAPI prefix or root-path change is needed.

| Public path | Service |
| --- | --- |
| `/` and frontend assets | frontend |
| `GET /health` | backend |
| `GET /api/v1/company/{ticker}` | backend |
| `POST /api/v1/model/calculate` | backend |
| `POST /api/v1/model/sensitivity` | backend |
| `POST /api/v1/model/trace` | backend |
| `POST /api/v1/model/export` | backend |
| `/docs`, `/docs/*`, `/openapi.json`, `/redoc` | backend |

Backend rules precede the frontend catch-all. Reserve `/api/v1/*` for FastAPI;
there are currently no conflicting Next.js API routes. Basic nosniff, referrer,
and frame-denial headers apply through Vercel and the standalone Next.js server.

### Environment

- Local separate servers: copy `frontend/.env.example` to `.env.local`;
  `NEXT_PUBLIC_API_URL=http://localhost:8000`.
- Vercel Preview and Production: **leave NEXT_PUBLIC_API_URL unset or empty**.
  Browser fetches use `/api/v1/...` on the current domain. Never copy the example's
  localhost value into Vercel environment settings. Rebuild after changing a
  public environment variable.
- Optional `vercel dev -L`: set `NEXT_PUBLIC_API_URL=` (empty) in
  `frontend/.env.local` before starting so the development frontend also uses the
  Services origin. Restore the localhost value for separate-server development.
- No backend secrets or environment variables are required. CORS still permits
  `http://localhost:3000`, with credentials disabled; same-origin preview and
  production requests do not require a preview-domain allowlist.

`.vercelignore` excludes local environments, dependency/build caches, tests,
screenshots, workbooks and logs; `.env.example` remains included. `.vercel/` and
all private environment files are Git-ignored. Never commit Vercel credentials.

### Manual deployment flow

From the repository root (PowerShell or a POSIX shell):

```sh
npm install --global vercel
vercel login
vercel link
```

Select the intended account/team/project interactively. Do not accept a random
project name. In that project's dashboard, set Root Directory to the repository
root and Framework Preset to **Services**; confirm both service roots and the
environment settings above. Then:

```sh
vercel pull --environment=preview
vercel build --target=preview
vercel deploy
```

`vercel deploy` creates a preview. Verify it before considering production:

1. Open the frontend; check fonts, all six tabs, and browser console.
2. Request `/health` and confirm `{"status":"ok"}`.
3. Load real AAPL financials; report Yahoo failure honestly if unavailable.
4. Review source values, override a historical input, RUN MODEL, and inspect trace.
5. Check sensitivity and download XLSX; verify 200, XLSX MIME and a valid workbook.
6. Confirm browser requests use the preview domain, never localhost:8000.
7. Confirm missing ticker/provider/error states preserve usable manual mode.

Only after preview passes and you intend to publish:

```sh
vercel deploy --prod
```

No deployment is performed by these repository changes. A local application
build or `vercel dev` is not proof of a successful hosted deployment.

### Production-like local validation

Build with `NEXT_PUBLIC_API_URL` unset (and no localhost `.env.local` override),
then run the backend on port 8000 and `npm start` on port 3000. From `frontend/`
in a third terminal:

```sh
node tests/same-origin-server.mjs
```

This small **test-only** proxy reads `vercel.json` rewrites and serves both apps
at `http://127.0.0.1:4000`; it is not a Vercel runtime emulator. In another
PowerShell terminal, from `frontend/`:

```powershell
$env:FRONTEND_URL='http://127.0.0.1:4000'
$env:EXPECT_SAME_ORIGIN='1'
node tests/browser-smoke.mjs "$env:TEMP\lbo-terminal-verification"
```

POSIX equivalent:
`FRONTEND_URL=http://127.0.0.1:4000 EXPECT_SAME_ORIGIN=1 node tests/browser-smoke.mjs`.
Set `CHROME_PATH` to your installed Chrome executable where necessary. Company
GETs use offline browser fixtures; all financial POSTs use the actual backend.
For actual local Vercel routing validation, use `vercel dev -L` at repository root.
Both options are supplementary; ordinary local development needs no Vercel CLI.

### Serverless limitations and validation status

The 64-entry/30-minute ticker cache is in memory, per runtime instance, and
ephemeral. yfinance's cookie/timezone/ISIN caches use the OS temporary directory
(`/tmp/lbo-yfinance` on Vercel). They are disposable provider artifacts, not
saved financial models. Model state stays in the browser; Excel files are built
entirely in memory. Cold starts and provider latency can vary.

Yahoo availability and rate limits are external dependencies. Existing per-call
8-second caps, a 40-second network budget, bounded cache, and busy responses
remain. There is no authentication, global rate limiting, or persistent deal
storage. Sensitivity is capped at 100 engine runs; schemas reject invalid inputs
and client output arrays. These limits do not provide comprehensive abuse
protection. No database, workers, queues, or rate-limit infrastructure was added.

Next.js downloads Inter/JetBrains Mono at build time and serves them locally;
the build environment needs network access. Runtime source imports use portable
paths. Python 3.12 Linux dependency packaging and hosted function limits must
still be confirmed by an actual Vercel build/preview.

See [deployment validation record](docs/phase-8b-validation.md) for the actual
local checks and remaining account/project prerequisites. Phase 9 is not started.
