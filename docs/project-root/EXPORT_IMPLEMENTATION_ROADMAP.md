# Export Accounting Application — SaaP-Aligned Implementation Roadmap

**Version:** 1.6 — 21 October 2026
**Project:** new, standalone Turkish trading-exporter application  
**Reference inspected:** uploaded `SaaP-main.zip` (read as reference, NOT executed)  
**Scope:** multi-tenant / legal entity, product catalogue, same-warehouse virtual destination allocations, immutable inventory/accounting ledgers, purchasing/e-invoice, customs, VAT attribution and refund preparation.

**Progress (21 October 2026):** PR-00AA, PR-00A, PR-00B, PR-00C, PR-01A and PR-01B implemented.
Next: PR-01C — product UX polish and the combined product release gate.
The user authorized a new PR-01/02 design baseline; it is clearly labeled as new.
Journals have no fixed line-count ceiling, use a paged editor and batched writes.
See `export-accounting/docs/pr-handoffs/PR-01B.md` for actual
commands/results and the remaining development dependency audit warning.

## 0. Ground rules and confirmed decisions

1. The new application uses **the same technology family and code conventions as SaaP**, but is a **separate repository and database**. It is not a copy or extension of the whole SaaP ERP. A future integration adapter can be added when required.
2. Country-specific goods share the **same physical warehouse** and are earmarked with **virtual country pools**. `GENERAL` + country pools must sum to physical on-hand stock for each warehouse/SKU/source layer.
3. The Excel workbook `Ortak Malzeme.xlsx` is **background reference only**. Do not load it, reconstruct old purchases/stock balances, seed historical inventory, consolidate its real codes, or allocate historical input VAT. Build **capabilities** for later import and approval, but do not execute any migration until actual data and a cut-off date are supplied.
4. On 21 October 2026 the user authorized a **new baseline**: `PR01_PR02_database_specification.md` and `PR01_PR02_schema.sql`. Tracked authoritative copies are in `export-accounting/docs/design/`; matching copies sit beside this roadmap. They were written from this roadmap and the existing app, not recovered original inputs. PR-01A/PR-01B DDL is implemented in m004/m005; future PR-02 contracts are explicitly planned and must be refined in their own forward-only migrations. Preserve applied migrations.
5. No negative stock; no silent country borrowing; no artificial `0.0001` amount for genuinely free-of-charge lines; no VAT refund based only on dispatch or invoice issuance.
6. Source purchase VAT, inventory cost, VAT attributable to customs-cleared exports, VAT deduction, and the ultimately claimable refund are **separate amounts and ledgers**.
7. Each merge/PR must leave the app bootable, migrations runnable, and tests passing. No large untested omnibus PR.
8. **Application layout decision (20 October 2026):** use sidebar-only navigation throughout the project. No top navigation bar, global app header or breadcrumb bar. Mobile navigation uses a standalone menu button and sidebar drawer. Start pages directly with their main content; omit separate page-introduction blocks such as “Your workspace”, the page name and a subtitle. Keep meaningful headings/actions within content panels and future account/legal-entity controls in the sidebar or relevant page.

## 1. Technology and repo conventions validated from SaaP-main.zip

| Layer | SaaP actual package/pattern | New Export application |
|---|---|---|
| Backend | `type: module`, Node.js, Express `^5.2.1` | JavaScript ESM with Express 5 |
| MySQL access | `mysql2/promise` `^3.17.1`; custom pooled DB helpers | Keep mysql2, `query`, `withTransaction`, explicit SQL, parameterized queries |
| Config | `dotenv` | Keep, but require secrets from env; **do not copy** SaaP `.env` or hard-coded password defaults |
| Auth | `bcrypt`, `jsonwebtoken`, HttpOnly cookie session | Keep secure cookie JWT initially; ensure CSRF/CORS/secure cookie policies |
| Frontend | React `^19.2.0`, React DOM `^19.2.0`, Vite `^7.3.1` | React JSX SPA + Vite |
| Styling | Tailwind `^4.1.18`, Radix UI `^1.4.3`, shadcn-style UI, Lucide React | Keep, share reusable components |
| Routing/client | React Router `^7.13.0`, Axios `^1.13.5` | Keep with `/api/v1` API convention |
| State | React contexts and `zustand` `^5.0.11` | Context for identity/active entity; Zustand only for local complex workflows |
| Docs | `openapi.yaml`, generation/parse check scripts | OpenAPI spec from PR-00 onward |
| Migrations | `src/migrate.js`, `migrationRunner.js`, `migrations/index.js`, `schema_migrations` | Keep pattern, but use smaller domain-focused migrations |
| Tests | `backend/scripts/test-*.js`, npm test/check aliases | Same direct Node scripts, plus built-in Node test runner and MySQL integration/concurrency tests |
| Frontend quality | ESLint, `npm run lint`, `npm run build` | Keep |
| Optional infra | Redis dependency | Defer Redis until queue/caching needs are measured |

**Note:** These are package versions **present in the reference archive**, not a demand to lock to every exact patch in 2026. Use validated compatible lockfiles and test upgrades.

### Important reusable code patterns (reference, not blind copy)

- `backend/src/db.js`: promise pool and transaction helper; remove insecure password fallback, add retry/timeout telemetry and DB error mapping.
- `backend/src/migrationRunner.js` / `migrations/index.js`: migration registration, `schema_migrations`, `npm run db:migrate`, `npm run db:migrate:status`. Add a migration lock and explicit failure recovery for partially applied MySQL DDL (DDL generally commits implicitly).
- `backend/src/routes/inventory.routes.js`, `item.card.routes.js`: thin Express routes + permission guards + validation.
- `backend/src/services/inventory.service.js`: domain operations separate from route handlers; split new services by bounded responsibility rather than copying a large monolith.
- `backend/src/middleware/auth.js`, `middleware/rbac.js`: authenticated and scoped access. Implement a smaller but coherent tenant/legal-entity role model.
- `frontend/src/api/client.js`: one Axios client with `withCredentials`, normalized errors and request IDs.
- `frontend/src/auth/RequirePermission.jsx`: guarded screens; enforce permission independently in backend.
- `frontend/src/components/ui/*`: reusable Radix/shadcn buttons, cards, inputs, tables.
- `frontend/src/pages/inventory/*`: functional UI inspiration. Avoid single 1,500–2,600-line page files.
- `backend/scripts/test-inventory-*`: PR-scoped regression and release-gate pattern.

## 2. New repository organization

```text
export-accounting/
  README.md
  .gitignore
  backend/
    package.json
    package-lock.json
    .env.example
    openapi.yaml
    scripts/
      test-pr00-foundation.js
      test-pr01-catalogue.js
      test-pr02-inventory.js
      test-pr02-concurrency.js
      test-pr02-close.js
      release-gate.js
    src/
      index.js
      db.js
      migrate.js
      migrationRunner.js
      migrations/
        index.js
        m001_foundation.js
        m002_auth_roles_scopes.js
        m003_accounting_foundation.js
        m004_product_foundation.js
        m005_product_gtip_attributes.js
        m006_inventory_warehouse_pools.js
        m007_inventory_source_layers_ledger.js
        m008_inventory_reservations_reallocations.js
        m009_inventory_period_closing.js
      middleware/
        auth.js
        rbac.js
        errorHandler.js
      routes/
        auth.routes.js
        organizations.routes.js
        products.routes.js
        inventory.routes.js
        inventory-pools.routes.js
        inventory-periods.routes.js
      services/
        products.service.js
        product-mapping.service.js
        inventory-posting.service.js
        inventory-allocation.service.js
        inventory-reservation.service.js
        inventory-reporting.service.js
        inventory-close.service.js
        audit.service.js
      validators/
        products.validators.js
        inventory.validators.js
      shared/
        money.js
        quantity.js
        ids.js
        idempotency.js
  frontend/
    package.json
    package-lock.json
    .env.example
    vite.config.js
    src/
      main.jsx
      App.jsx
      index.css
      api/
        client.js
        products.js
        inventory.js
      auth/
        AuthContext.jsx
        RequireAuth.jsx
        RequirePermission.jsx
      context/
        WorkingContext.jsx
      layouts/
        AppLayout.jsx
      components/ui/
      components/products/
      components/inventory/
      pages/
        dashboard/DashboardPage.jsx
        products/ProductFamiliesPage.jsx
        products/ProductsPage.jsx
        products/ProductDetailPage.jsx
        inventory/StockOnHandPage.jsx
        inventory/CountryPoolsPage.jsx
        inventory/StockMovementsPage.jsx
        inventory/StockTrialBalancePage.jsx
        inventory/InventoryPeriodClosePage.jsx
```

These file names are a **recommended target**, not files found already in the uploaded archive. Keep separate `backend/` and `frontend/` npm projects just like SaaP. Prefer separate route and service files by domain; do not create microservices.

## 3. PR sequence and specific deliverables

### PR-00AA — Repository bootstrap, setup and dependency installation (required first)

**Build**
- Execute `PR-00AA_BOOTSTRAP_PROMPT.md`: inspect SaaP dependency and folder references; initialize a clean standalone repository with separate backend/frontend npm projects.
- Install the compatible SaaP-family Node/Express/MySQL-driver and React/Vite/Tailwind UI dependencies and commit lockfiles.
- Prepare folder structure, env examples, `.gitignore`, minimal app shells with sidebar-only navigation (no top bar), Vite proxy, safe MySQL dev connectivity check, and local run documentation.
- Do not create production accounting/inventory schema or migrate the legacy Excel.

**Acceptance**: both app shells start; backend health returns 200; frontend lint/build pass; dependencies install cleanly; DB connectivity is honestly marked PASS or BLOCKED; no secrets or user historical data are copied.

### PR-00A — Foundation behavior and migration infrastructure (after PR-00AA)

**Build**
- Extend the existing PR-00AA scaffold; **do not** rescript installations or recreate the Vite app.
- Implement the JavaScript migration runner, `schema_migrations`, `db:migrate`, `db:migrate:status`, concurrent migration lock, and recovery/error handling for MySQL DDL.
- Add DB-aware readiness route, consistent structured API errors/request IDs, security middleware and CORS allowlist.
- Add first minimal forward-only foundation migration (no inventory/purchase/export records), an OpenAPI baseline, backend integration smoke tests, and frontend API/error states.
- No real stock, old workbook, or historical VAT imports.

**Acceptance**: clean local dev DB migrates idempotently; readiness distinguishes DB available/unavailable; OpenAPI validates; backend smoke tests and frontend lint/build pass.

### PR-00B — Tenant, legal entity, users and permissions

**Build**
- `tenants`, `legal_entities`, `users`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` with effective entity scope.
- Cookie JWT auth, password hash, logout, session expiry and login rate limits.
- `/api/v1/auth/csrf`, `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/context`, `/api/v1/me`, `/api/v1/organizations`.
- Extend CORS for the implemented POST/PATCH routes and X-CSRF-Token. Require signed session-bound CSRF tokens, an allowed Origin and JSON on writes, including login; use revocable server-side sessions alongside cookie JWTs.
- Frontend auth provider, current legal-entity selector in the sidebar or relevant page, permission guard, protected sidebar-only app layout. Preserve the no-top-bar layout decision.
- Seed only foundation admin account/permissions using secure setup (no hard-coded credentials).

**Acceptance**: tenant A cannot read or mutate tenant B data; entity-specific permissions enforced by backend regardless of browser state.

### PR-00C — Accounting/time/audit contract (minimal foundation)

**Build**
- Accounting periods, base currency, chart-of-accounts identifiers, journal headers/lines or a versioned posting interface; audit events and idempotency records.
- Consistent document dates vs posting dates; guarded period status.
- Shared Decimal-as-string parsing and calculations (no JS binary floats for monetary arithmetic); use a deterministic decimal strategy, preferably a tested decimal package if needed.
- Reliable action-to-GL contract: receipt/issue operations must never be marked GL-posted until balanced journals exist. An outbox can defer integration, but must expose `PENDING/FAILED/POSTED` statuses.

**Acceptance**: posting preserves legal entity scope; balance journal debit = credit; idempotent rerun; closed period rejects posting.

**Implemented contract:** `m003_accounting_foundation`, decimal.js-backed string
amounts, explicit accounting permissions, atomic journal/audit/idempotency,
PENDING/FAILED/POSTED requests and the Accounting UI. API routes are under
`/api/v1/entities/:entityId/accounting`; every write requires CSRF and
`Idempotency-Key`. No accounting data is seeded. Processing is explicit; a
background worker and domain stock integration remain future work. See
`export-accounting/docs/architecture/accounting.md` before integrating later
modules. Local migration triggers use separate DDL credentials without expanding
runtime grants.

**Journal UI correction (21 October 2026):** support at least two lines with no fixed line-count ceiling, independent
account, description, debit and credit; repeated accounts, exact live totals and
balance validation. A goods/input-VAT/payable entry is one three-line journal.
Several stock items can be represented by distinct descriptions and repeated
goods accounts. The editor does not replace future SKU-level invoice detail or
calculate VAT from an account code. Render 25 editor rows per page; validate accounts in batches of 500 and insert lines in batches of 250, within one transaction. Retain the 1 MiB request guard and measure 300/1,000 lines and concurrent users; no claim of infinite capacity.

### PR-01A — Product classification and units of measure

**Build**
- Migrations for `unit_of_measure`, `product_families`, `product_skus`.
- SKU uniqueness by tenant/entity; no product merge logic yet.
- Hierarchical families, Unicode names, active/inactive status, fixed base UOM and quantity precision (0–6). Separate translated names and UOM conversions remain deferred until needed. Codes/base units/precision cannot silently change.
- APIs under `/api/v1/entities/:entityId/products`: GET/POST `/units`, `/families`, `/skus`; GET/PATCH `/:resource/:id`; GET `/audit-events`. Explicit scope, read/manage/audit permissions, CSRF, audit and idempotency. m004 installs three tables without seeded products.

**Acceptance**: create `ZARF` family, create `ZARF-A4` and `ZARF-A3` SKUs, independently report them; no duplicate SKU code within an entity; stocked SKU cannot be casually deleted.

### PR-01B — Specifications, GTİP, alias and lifecycle

**Build**
- Implemented m005: `product_attribute_definitions`, `product_sku_attributes`, `product_gtip_history`, `product_aliases`, plus minimal `product_suppliers` references and immutable-original `product_alias_sources` for scoped supplier identity and revision history.
- GTİP stored as exactly 12 numeric characters when a Turkish GTİP is required; validity dates, review actor and source. Service rejects overlapping active intervals for the same SKU.
- Separate stock-defining specifications from descriptions. Country and historical VAT rate do NOT define SKU by themselves.
- Supplier alias approval workflow: automatic mappings only from previously VERIFIED matches, not blind similarity.
- Add a **dormant** future legacy mapping capability if useful; do not import the Excel.

**Acceptance (verified in PR-01B)**: two different SKUs can share GTİP; one SKU can have GTİP history; supplier alias retains original supplier wording; no automatic GTİP-only merges.

Implemented review states: PENDING → REVIEWED → VERIFIED, with pre-verification REJECTED and verified RETIRED. `products.review` records reason, actor/time and GTİP broker evidence. Inclusive windows cannot overlap; shortening a verified window preserves prior applicability, while retirement withdraws use for all dates. Exact verified supplier/code/description mappings only; replacements retain earlier alias revisions. SKU Details and product reference/review screens are available. PR-01C refines them and assembles the release gate.

### PR-01C — Product catalogue UI + release gate

**Build**
- Family list/tree, SKU list and detail, attribute editor, GTİP history/review, product status, supplier description alias mapping.
- Search/filter and pagination; reusable modals; English UI with future Turkish translations allowed.
- `npm run test:pr01` backend integration tests and frontend smoke/build gate.

**Acceptance**: users can manage product families and SKUs without physical stock; permissions and audit work; no migration performed from the background workbook.

### PR-02A — Warehouse and virtual destination pool schema

**Build**
- Physical `warehouses`, one GENERAL pool per legal entity, virtual COUNTRY pools keyed by ISO country code; optional physical bins deferred.
- Inventory period headers and configurable inventory movement types.
- A country pool is an allocation DIMENSION, **never** a physical warehouse, tax entity, or GL account.
- Define canonical grain for physical and pool balances: `(tenant, legal_entity, warehouse, sku, source_layer[, pool])`.

**Acceptance**: one physical warehouse with AF, CM and GENERAL pool definitions; creating a pool never creates quantity, value, or a journal.

### PR-02B — Goods receipt, FIFO source layers and immutable ledger

**Build**
- `stock_receipts`, `stock_receipt_lines`, `inventory_layers`, event header, append-only physical ledger, append-only pool ledger, current quantity/value projections.
- A valid receipt posts positive physical and matching pool quantity; source layer retains unit cost and receipt provenance.
- InnoDB transaction with period lock + relevant stock/layer/pool row locks and deterministic lock order.
- Strict idempotency and scoped uniqueness; no edit/delete of posted ledger lines. Reversals planned in PR-02F.
- **Test fixtures only** can simulate supplier receipts until PR-03 purchasing integration exists; do not load legacy workbook.

**Acceptance**: test receipt of 100 units creates 100 physical units AND 100 across pool allocations, once only under repeated API request; stock valuation matches receipt; concurrent operations never diverge.

### PR-02C — Country allocation and controlled borrowing

**Build**
- `inventory_pool_ledger`, available balance projections per country and source layer; pool reallocation request, review, approve, reject, execute.
- Priority selection: destination country → GENERAL → another country's pool **only by approved reallocation**.
- Reallocation posts equal/opposite pool entries for the *same warehouse/SKU/layer*, with **no physical ledger or GL changes**.
- Maker-checker: requester cannot approve their own other-country borrowing.

**Acceptance**: reallocating 20 from CM to AF keeps physical = 100 and total value unchanged; CM cannot be borrowed silently; concurrent requests do not overallocate.

### PR-02D — Reservations, issues, FIFO and no-negative-stock

**Build**
- Reservation headers/lines, pool-and-layer-specific reservations, partial release/cancel, issue source consumption records.
- FIFO pick at layer grain, but selection constrained by exact SKU/stock-defining attributes, target country, and allowed pool rules.
- `available = on_hand - reserved`; server blocks over-reservation, over-issue, and consumption of incompatible SKU.
- Dispatch consumes physical stock AND corresponding virtual allocation; record exact source layers for PR-05 VAT provenance.
- Costs move according to the approved accounting event policy; invoice issue, physical dispatch, ownership transfer and customs closing remain different dates/events.

**Acceptance**: 10 concurrent attempts to issue the same remaining stock cannot create negative inventory; two requests cannot consume same layer twice; source identity retained.

### PR-02E — Stock trial balance, month-end snapshots and close

**Build**
- Stock trial balance by SKU, family, warehouse, pool, source layer and period, including quantity AND TRY valuation.
- Opening + period incoming − outgoing + adjustments = closing. Pool totals reconcile to physical; layer values reconcile to stock and the appropriate GL inventory assets.
- Month-end `OPEN → IN_REVIEW → CLOSED`, approval, watermarked immutable snapshot versions, repeatable report queries using last approved snapshot + period movements.
- Lock against backdated posting into closed periods. Approved reopening creates versioning and controlled dependent-period recalculation.
- Frontend: stock-on-hand, stock-movement drilldown, stock trial balance, close/reopen workflows.

**Acceptance**: report can reproduce a previously closed period exactly; close blocked by imbalance; after approved reopen, original close version remains discoverable.

### PR-02F — Reversals, adjustments, performance and release gate

**Build**
- Correction events and exact reversal lineage, physical counts, approved stock adjustments, zero-quantity valuation adjustments.
- No orphan stock quantity/value deltas; no invalid negative carrying value; source-lot and country-pool constraints tested.
- Composite indexes; cursor pagination for ledgers; benchmark high-volume movements and monthly report response. Establish performance budgets from realistic synthetic (not real migrated) dataset.
- `npm run test:pr02`, migration-from-zero test, concurrency test, reconciliation report, OpenAPI validation and frontend build/lint.

**Acceptance**: end-to-end warehouse receipt → AF allocation → reserve → dispatch → reverse → close; balances and accounting effects reconcile, even under retry or contention.

## 4. Later PR families (planned now; implement after PR-01/02)

| PR | Core scope | Dependency |
|---|---|---|
| PR-03A | Trading partners, contracts, purchase requests, purchase orders, EBYS references and approvals | PR-00/01 |
| PR-03B | İZİBİZİ e-Fatura XML import and UUID deduplication; source-line preservation; bulk SKU mapping; document matching; VAT/zero-price validation | PR-03A/01 |
| PR-03C | Invoice → approved purchase → goods receipt → inventory and 191/320 journal integration, including mismatch exceptions | PR-02/03B |
| PR-04A | Packing-list intake, export card sequence, country allocation and export shipments | PR-02D/03 |
| PR-04B | Export invoice/e-document, customs broker GTİP review, GÇB declaration/closing, partial clearance and transaction-type differentiation | PR-04A |
| PR-05A | Input VAT source register by purchase invoice line; real source-layer attribution; candidate exported VAT | PR-03/04 |
| PR-05B | VAT allocation for directly linked charges, indirect overhead and special ATİK cases with legal rules/approval | PR-05A |
| PR-06A | KDV1 period reconciliation, refund eligibility/limitations, duplicate-claim controls, request approval | PR-05 |
| PR-06B | Yüklenilen KDV / İndirilecek KDV / export sales / GÇB lists, claim package, refund payment/offset tracking | PR-06A |
| PR-07 | Performance, security hardening, document retention, GİB interface verification, pilot and deployment readiness | all |
| MIGRATION-LATER | **Only after system completion**: receive the real migration files, approve mapping, define cut-off, verify physical counts/valuation/source VAT, stage + reconcile + post opening balances | explicit future decision |

## 5. API conventions

**Purchase invoice detail requirement (PR-03B/03C):** one invoice can contain many
different SKUs, quantities, units, prices and VAT treatments. Preserve every
source invoice line, including its SKU mapping, net amount, VAT rate/amount and
stable source-line identifier. Generate a balanced journal for the invoice/event
with goods, VAT and payable lines. If policy combines journal amounts by account
and tax treatment, retain the source-line links so inventory and later VAT
attribution remain traceable. Do not reduce invoice entry to one stock item or
one VAT rate; do not infer item identity from the GL account.

- Base route `/api/v1` matching SaaP.
- Requests use JSON camelCase; DB columns use snake_case. Validate all input at route boundary, but keep business invariants in services.
- Return explicit status codes (400/401/403/404/409/422) and `requestId` in errors.
- List APIs use filters and pagination; no unbounded full-table fetch.
- For posting/reallocations/close, require `Idempotency-Key` (or explicit request token). Never rely on a browser's disabled button as the integrity control.
- Example `GET /api/v1/entities/:entityId/products/skus`, `POST /api/v1/entities/:entityId/products/skus`, `GET /api/v1/inventory/on-hand`, `POST /api/v1/inventory/receipts/:id/post`, `POST /api/v1/inventory/pool-reallocations/:id/approve`, `POST /api/v1/inventory/reservations`, `GET /api/v1/inventory/trial-balance`, `POST /api/v1/inventory/periods/:id/close`.
- Every backend write validates tenant and legal entity scope and permissions; IDs submitted by the browser are treated as untrusted.
- Include read/write/audit/approve permissions per module; do not grant approval rights implicitly to all inventory operators.

## 6. MySQL and performance conventions

- MySQL 8+, InnoDB, `utf8mb4`, strict SQL mode, controlled timezone and date-only handling (SaaP uses `dateStrings: ["DATE"]`).
- Use `DECIMAL(20,6)` or equivalent appropriately scoped precision for quantities/values. Store TRY money with reproducible rounding and explicit currency conversions; do not use JS Number to compute finance totals.
- Separate *authoritative immutable events* from *transactionally updated balance projections* and *approved monthly snapshots*.
- Composite indexes start with tenant/entity and then warehouse/SKU/source/date or period as relevant. Validate index usefulness with `EXPLAIN` and synthetic load tests.
- Do not soft-delete posted ledger source records. Use explicit reversal/correction events and audit.
- InnoDB `SELECT ... FOR UPDATE` locks existing balance rows; nonexistent rows need safe unique-key insert/upsert plus locking. Lock period row in shared mode for postings and exclusive mode for close; define consistent global lock order.
- SQL DDL in MySQL is not safely rolled back like normal DML: migration runner records version on success; preflight, backup, and repair plan are mandatory for destructive changes.

## 7. Release requirements for *every* PR

1. For schema changes, new SQL migration(s), uniquely named and registered; rerun-safe behavior where appropriate. Do not add empty migrations for UI-only changes.
2. Service-level validations and scope checks; no trust in frontend amounts/statuses.
3. Explicit API contract and OpenAPI changes, with request/response example.
4. Automated test script; regression tests of nearby modules.
5. Frontend screen or documented backend-only PR, with permission and empty/error/loading state.
6. Audit trail on posted/approved actions; idempotency on risky mutations.
7. Run checks applicable to the PR and already implemented: from PR-00A, `npm run db:migrate`, `npm run db:migrate:status`, targeted tests and `npm run check:openapi`; frontend `npm run lint`, `npm run build`. Auth/tenant requirements begin with PR-00B; business posting/audit requirements apply when those features are introduced.
8. PR summary: changed files, migrations, endpoints, tests executed, known limitations, screenshots where relevant, and explicit manual verification steps.

**Example commands from the reference repo:**

```bash
# two terminals, after configuring environment in a FRESH clone (not SaaP's .env)
cd backend && npm ci && npm run db:migrate && npm run dev
cd frontend && npm ci && npm run dev

# release checks; scripts will be created in PR-00 and subsequent PRs
cd backend && npm run db:migrate:status && npm run check:openapi && npm run test:pr01
cd frontend && npm run lint && npm run build
```

**Do not run** `db:drop`, `db:reset`, or other destructive scripts against any real or shared database.

## 8. First six user-visible deliverables

1. Login, legal entity selector in the sidebar or relevant page, and sidebar-only navigation with a mobile drawer; no top navigation/header bar.
2. Product family and SKU screens (`ZARF`, A4/A3 variants), GTİP history and alias mapping, with empty catalogue initially.
3. Warehouse and destination pool configuration (same physical warehouse, virtual AF/CM/GENERAL).
4. Stock receipt and movement views built with synthetic test receipts (not migrated Excel records).
5. Reservation and approved borrowing workflow, with source-layer FIFO and negative-stock prevention.
6. Stock trial balance and month close with opening/closing quantities, TRY valuation and audit drilldown.

## 9. Explicitly deferred decisions

- No actual Excel migration, historical balances, price reconstruction, supplier VAT inference or previous claims reconstruction yet.
- Final GİB submission integration depends on the official interface and its current technical specification at the integration stage.
- Accounting-account policy, stock valuation and export VAT rules to receive Turkish SMMM/YMM sign-off before live use.
- Integration with SaaP's full GL or HR/Payroll is not assumed; write domain adapters so that it remains possible.

**Current sequence:** PR-00AA through PR-00C, PR-01A and PR-01B are complete. The newly authorized design baseline replaces the absent input prerequisite. Next implement PR-01C, followed by PR-02A through PR-02F in order. Continue extending the existing project and refine future baseline contracts as their PRs are implemented.
