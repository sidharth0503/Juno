# Phase 6A checkpoint

Completed before beginning Excel implementation on 2026-09-29:

- Backend full pytest: **149 passed** (128 existing + 21 sensitivity tests).
- Frontend npm test: **17 passed**.
- npm run lint, npm run typecheck, npm run build: **passed**.
- Real HTTP POST /api/v1/model/sensitivity: **200**, 5 entry rows × 5 exit
  columns, 25 cells, strict finite JSON.
- Golden 10×/10× cell: IRR **0.19774419347797179**, MOIC
  **2.4650195649345132**, exit equity **2218.5176084410623**, ending debt
  **1610.327079058938**. Matches standalone engine outputs exactly.
- Browser smoke: **passed** for rendering, changed/absent base highlighting,
  null IRR, edit invalidation, refresh, failure isolation/retry, and existing
  company/manual workflows. An initial Windows Chrome startup-file lock was
  handled with a bounded retry, then the check passed.

Core financial formulas were not modified. Excel work began only after this
checkpoint passed.
