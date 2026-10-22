# PR-01C handoff — Product UX and release gate

**Current status — 22 October 2026:** PR-02B is implemented; see the
[PR-02B handoff](PR-02B.md). PR-02C is next. The dated results and next-step
statements below describe the PR-01C delivery.

Completed **22 October 2026 (Europe/Istanbul)**. Next is **PR-02A: physical
warehouses, virtual GENERAL/COUNTRY pools and inventory metadata**.

## Delivered behavior

- Product tabs, catalogue/alias filters, pages and SKU details survive reload
  and browser Back. Family and alias rows drill into a specific SKU. Refresh
  loads its current record, and company switching cannot reuse prior-entity data.
- Alias lists expose supplier/SKU filters. Reference filters include inactive
  choices. Inactive SKU history remains readable while creation forms are hidden.
- New-code forms warn about detected active/inactive duplicates. Shared form
  validation handles required wording, code/decimal formats and GTİP date order.
  Original supplier wording stays unchanged. Catalogue saves show confirmation.
- Shared read loading/error/retry controls, page recovery, resource-specific empty
  messages and debounced searches. Mobile tabs keep the selected view visible and
  retain keyboard navigation. Sidebar-only global navigation is preserved.
- `npm --prefix backend run test:pr01` runs the complete fail-fast release gate;
  `test:pr01c` runs the combined browser flow alone.

No new migration, endpoint, dependency, stock quantity or workbook import.
m001–m005 and both dependency lockfiles are unchanged. The OpenAPI contract remains
42 paths. Baseline v3 updates scope/status only; its SQL table definitions remain
unchanged. Roadmap inventory examples now consistently include `/entities/:entityId`.

## Main files

Frontend product screens plus shared `product-ui.jsx`, `useProductFilters.js` and
`useProducts.js`; `frontend/scripts/product-ux-smoke.mjs` and the existing smoke
composition. Backend: `scripts/test-pr01.js` and package script aliases only.
See [product UX](../architecture/product-ux.md) for behavior and boundaries.

README, roadmap/build/bootstrap status, older handoff status notes and both
baseline copies are aligned. Planning files now live in `docs/project-root/`;
`docs/design/` remains authoritative for the specification and reference SQL.

## Executed verification

| Command/check | Result |
|---|---|
| `npm --prefix backend run test:pr01` | PASS — full gate completed |
| Included OpenAPI validation | PASS — 42 paths |
| Included frontend lint/build | PASS — 2,158 modules |
| Included journal editor regression | PASS — 7 tests |
| Included foundation/fresh migration suite | PASS — 22 tests |
| Included authentication/access suite | PASS — 14 tests |
| Included accounting/decimal suite | PASS — 16 tests |
| Included product foundation suite | PASS — 12 tests |
| Included classification/review suite | PASS — 15 tests |
| Included browser workflow | PASS — product, classification, PR-01C UX, accounting and auth, including readers and company isolation |
| `npm --prefix backend run test:pr01c` | PASS — focused rerun after browser validation correction |
| `npm --prefix frontend run test:smoke` | PASS — running local app, no business writes |
| `npm --prefix backend run db:migrate:status` | PASS — all five applied, each at attempt 1 |
| Live `/api/v1/ready` | PASS — HTTP 200, database up/schema current |
| Business/migration before/after comparison | PASS — hashes and counts identical across 19 tables; total schema remains 29 tables |
| Desktop/mobile screenshot review | PASS — no global header or document overflow; selected mobile tab visible |

The new negative browser test caught an escaped-minus decimal pattern that Edge
ignored. The pattern was corrected; invalid decimal strings now fail browser
validation, and the focused and full release gates pass. All synthetic changes
were confined to the harness's disposable schemas, which were cleaned up.

## Running locally and next work

The repository-local MySQL, API on port 3000 and UI on port 5173 are running.
Open **http://localhost:5173/products**. Company **abc A.Ş.**, administrator
**admin@gmail.com** and the existing password remain unchanged. Private setup
files, snapshots, logs and screenshots remain ignored. No business data was seeded.

For later sessions use the existing README startup commands. The release gate
needs the repository-owned MySQL, installed browser and free port 5184; it starts
its own test API/UI. No deployment or production performance guarantee is implied.

Duplicate warnings examine a bounded search page and are advisory; the database
always enforces scoped uniqueness on save. Persisted URLs use the current company
context and do not switch companies automatically. The previously recorded
development-only nodemon/chokidar/braces findings were not changed by this PR.

PR-02A should implement scoped warehouse/pool/period/movement metadata and test
AF, CM and GENERAL pools for one Istanbul warehouse. Receipts, quantities, FIFO,
reservations, invoices and VAT calculations belong to later roadmap steps.
