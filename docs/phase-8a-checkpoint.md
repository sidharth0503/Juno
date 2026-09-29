# Phase 8A checkpoint — 2026-09-29

Completed before changing deployment configuration:

- Backend: `.venv/Scripts/python.exe -m pytest` — 223 passed.
- Frontend: `npm test` — 26 passed.
- `npm run lint`, `npm run typecheck`, `npm run build` — passed.
- Headless Chrome browser smoke against the built frontend and real local API — passed.
  Trace checks cover opening, loading, Year 5 EBITDA value/formula, error/retry,
  closing, invalidation on edits (including reverting an edit), null IRR,
  and current manual override/provenance. Existing company fixture, calculation,
  sensitivity, tabs, export/download and failure/recovery checks also pass.

Trace is declarative metadata over one authoritative engine run, with 31 annual
and 8 transaction/return metrics. Core financial formulas were not modified.
The existing Starlette TestClient/httpx deprecation warning remains.
