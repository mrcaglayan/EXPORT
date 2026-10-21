# Coding-Agent PR Execution Instructions — Export Accounting Application

Use this alongside `EXPORT_IMPLEMENTATION_ROADMAP.md` and the **new, user-authorized 21 October baseline** `PR01_PR02_database_specification.md` / `PR01_PR02_schema.sql`. Authoritative copies are tracked in `export-accounting/docs/design/`. The original referenced inputs were never supplied; the new baseline is not presented as a recovered original. Its PR-01A/PR-01B schema is implemented; future inventory contracts remain planned.

## Overall coding contract

**Current status:** PR-00AA, PR-00A, PR-00B, PR-00C, PR-01A and PR-01B are implemented.
Next is PR-01C — product UX polish and the combined product release gate.
See `export-accounting/docs/pr-handoffs/PR-01B.md`. Earlier task briefs below remain the historical scope
definitions; do not recreate or reinstall the existing scaffold.

You are building a **NEW standalone Export Accounting application** using `SaaP-main.zip` only as a technology and coding-style reference. Use Node.js ES modules + Express 5 + `mysql2/promise` + MySQL 8 + React 19 + Vite 7 + Tailwind 4 + shadcn/Radix + React Router 7 + Axios. Keep backend and frontend as separate npm projects. Use camelCase JSON, snake_case DB, `/api/v1`, SaaP-style JavaScript migrations and `schema_migrations`, service/route/validator separation, permission-scoped routes, OpenAPI, and PR-specific test scripts. Use environment-only secrets. NEVER import production data from the historical `Ortak Malzeme.xlsx` reference. A country pool is a virtual allocation in one physical warehouse. Prevent negative stock and duplicate postings transactionally. Do not implement later modules early.

**Layout rule for every PR:** Use sidebar-only application navigation. Do not introduce a top navigation bar, global app header or breadcrumb bar. On mobile, a standalone menu button opens the sidebar drawer. Start pages directly with their main content; omit separate page-introduction blocks such as “Your workspace”, the page name and a subtitle. Keep meaningful headings and actions within content panels; future account/legal-entity controls belong in the sidebar or the relevant page.

## PR-00AA task brief — execute this FIRST

Use the full standalone coding-agent prompt in `PR-00AA_BOOTSTRAP_PROMPT.md`. This PR creates the folder structure, installs SaaP-compatible Node/Express/mysql2 and React/Vite/Tailwind/UI dependencies, configures `.env.example` and local database checks, produces running app shells, and documents developer setup. Do not duplicate its work in PR-00A.

## PR-00A task brief

Starting from the PR-00AA working scaffold (do **not** reinstall or recreate the project), add robust `withTransaction`, SQL migration runner/lock and `schema_migrations`, structured error handler, request IDs, DB readiness endpoint, secure CORS defaults, OpenAPI baseline, and `db:migrate`, `db:migrate:status`, `check:openapi`, `test:pr00` scripts. No secrets or real stock records. Deliver validated migrations and passing smoke tests.

## PR-00B task brief

Implement multi-tenant/legal entity identity, cookie JWT auth, RBAC with entity-level scopes, current legal-entity working context, login/logout/me APIs and screens. Place the legal-entity selector and account controls in the sidebar or relevant page, preserving the layout rule above. Prove tenant isolation and deny-by-default access in automated tests. No SaaP legacy user import.

Use `/api/v1/auth/csrf`, `/api/v1/auth/login`, `/api/v1/auth/logout`,
`/api/v1/auth/context`, `/api/v1/me` and `/api/v1/organizations` consistently.
Extend CORS for implemented writes and X-CSRF-Token; require allowed Origin,
JSON and signed session-bound CSRF protection. Logout revokes the server-side
session. Identity work is complete; the subsequently authorized PR-01/02 baseline is now available.

## PR-00C task brief

Implement minimal chart of accounts, fiscal/accounting period identity, consistent decimal money handling, balanced journal contracts, audit and idempotency primitives, and an outbox/status boundary for modules to request balanced GL postings. Unposted stock financial events must never masquerade as GL-posted. Test idempotent journal and closed-period guards.

Implemented via `m003_accounting_foundation` and
`/api/v1/entities/:entityId/accounting/*`. Reuse its decimal, audit, idempotency
and posting-request contracts in subsequent modules. Preserve immutable applied
migrations. Local trigger DDL uses `db:migrate:local`; runtime credentials remain
scoped. Accounting settings/accounts/balances start empty.

The journal editor supports two or more rows with no fixed line-count ceiling, independent debit/credit amounts, per-line
descriptions, repeated accounts and exact live totals. Page 25 editor rows, batch account checks (500) and line inserts (250) inside one transaction; retain the 1 MiB payload guard. Test 300/1,000 lines and concurrent users. Preserve this when adding
later modules. A purchase invoice may contain many different SKUs and VAT
treatments: PR-03B/03C must retain per-item quantity/UOM/price/VAT/source-line
identity and link those items to the resulting balanced journal. Manual GL rows
are not a replacement for invoice-item or stock records.

## PR-01A task brief

Create product families, SKUs and UOM migrations/services/APIs/UI. Permit family `ZARF`, SKU `ZARF-A4`, `ZARF-A3`; restrict physical stock movements to SKUs, not families. Unique scoped codes, inactive instead of destructive deletion, pagination/filtering, permission checks and audit. Tests and OpenAPI updates required. Do not import any real Excel records.

PR-01A is implemented via m004 and `/api/v1/entities/:entityId/products/*`, including units, families, SKUs, inactive lifecycle, filter/paging and permission-separated audit. Refine future design sections only when implementing their PR; no physical stock is created here.

## PR-01B task brief

Add SKU specifications, versioned GTİP with broker verification and no overlapping effective windows, supplier aliases with reviewed/verified matching. A common GTİP does not imply identical goods. A rate of VAT or destination country does not alone imply a new SKU. Preserve original supplier descriptions and status transitions. Tests required.

PR-01B is implemented through m005 and the existing entity-scoped product base. Typed specifications, broker evidence/review, inclusive GTİP windows, minimal supplier references and exact versioned aliases are available. Reuse their documented lifecycle; no fuzzy matching or real classifications are seeded. See `docs/architecture/product-classification.md`.

## PR-01C task brief

Polish product family/SKU/GTİP/alias screens with reusable components. Add filters, pagination, duplicate warnings, ability to drill into specific SKU, form validation, UX and auth checks, smoke tests and PR-01 release gate. No stock quantities or migrations from legacy Excel.

## PR-02A task brief

Create physical warehouse, virtual GENERAL/COUNTRY pool (ISO country), inventory period and stock movement metadata. Country pools must not create physical warehouse or GL balances. Add scoped keys/FKs and anti-cross-entity protections. Test creating AF/CM/GENERAL pools for one Istanbul warehouse.

## PR-02B task brief

Create receipts and receipt source layers, immutable event/physical stock ledger, corresponding virtual pool ledger and transactionally maintained balance projections. Use mysql2 transactions with deterministic row locking, idempotency tokens, and source layer identity. Receipts originate from synthetic test fixtures initially; integrate e-invoice purchase source later in PR-03. Ensure physical sum equals pool sum and valuation reconciles. Include double-submit tests.

## PR-02C task brief

Build country-first/general-second selection, approved borrowing request and execution for another destination pool, and maker-checker restrictions. Reallocations post equal/opposite pool ledger lines only (no physical stock change and no GL entry). Test cross-country approval, partial borrowing, unavailable balances and concurrent requests.

## PR-02D task brief

Build warehouse/SKU/source-layer/pool reservations with FIFO selection, no-negative-stock and quantity conservation. Export dispatch consumes both physical and allocated quantity and stores the exact source layer for future VAT. Test conflicting reservations and concurrent dispatch attempts. Do not calculate refundable VAT yet.

## PR-02E task brief

Build stock trial balance with monthly opening, receipts, issues, valuation adjustments, and closing by SKU, family, warehouse and country pool. Add month-close snapshots, GL reconciliation checkpoint, posting lock, close approval and versioned reopen. Performance should use approved prior close + in-period ledger movements, not scan all history for each report.

## PR-02F task brief

Add reversals and correction audit, controlled adjustments/revaluation, concurrency and performance gates. Verify invariants at physical, layer, pool and layer+pool grains. Build a comprehensive PR-02 release gate. No silent editing of posted event history.

## Definition of done for EACH PR

- Code and only the requested scope, plus minimal dependencies.
- For schema changes, SQL migration registered and tested on fresh + already-migrated DB; no empty migrations for UI-only work.
- From PR-00B onward, tenant/entity access enforced in SQL/service as well as route.
- API and OpenAPI updated; validation and structured error responses.
- Tests including applicable negative cases, idempotency for state-changing operations and affected regressions. Apply business/audit requirements when the relevant modules are introduced.
- Frontend UX as requested, consistent with SaaP-style components, no giant files.
- No real workbook imports or fabricated VAT/opening balances.
- Return a compact handoff with files changed, commands/tests executed, pass/fail, remaining risk, and next PR.
