# Project engineering rules

1. Inspect existing code before editing.
2. Do not implement future phases unless explicitly requested.
3. Financial calculations belong only in the Python backend financial engine.
4. Never duplicate financial formulas in the frontend.
5. All financial engine behavior must receive automated tests when implemented.
6. Prefer typed interfaces and schemas.
7. Avoid unnecessary dependencies.
8. Do not silently catch and ignore exceptions; surface or handle errors explicitly.
9. Do not refactor unrelated working code.
10. Run relevant tests and checks after changes.
11. Do not claim success if commands fail.
12. Preserve backwards compatibility unless the task explicitly requires breaking changes.
13. Keep external financial-data-provider code separate from the financial model engine.
14. Keep API routes thin; business logic belongs in services or engine modules.
15. Treat financial correctness as more important than UI polish.

## Intended stack

- Frontend: Next.js + React + TypeScript + Tailwind CSS.
- Backend: Python + FastAPI + Pydantic.
- Future financial tooling: NumPy/Pandas only when needed.
- Future data source: yfinance initially, behind a provider abstraction.
- Future Excel export: openpyxl.
- Testing: pytest for the backend, appropriate frontend tests as behavior grows,
  and possibly Playwright E2E tests later.

Future tooling is architectural guidance, not permission to install or implement it.
Phase 0 contains only the project foundation and a health endpoint.
