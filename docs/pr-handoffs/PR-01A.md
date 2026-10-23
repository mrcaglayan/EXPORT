# PR-01A handoff — Product foundation and journal scaling

**Current status — 23 October 2026:** PR-02D is implemented. See the [PR-02D handoff](PR-02D.md).
The dated results below describe the PR-01A delivery; PR-02E is next.

Implemented **21 October 2026 (Europe/Istanbul)** in the existing local app.
Open **http://localhost:5173/products**. Next is **PR-01B — specifications,
GTİP history and reviewed supplier aliases**, followed by PR-01C and PR-02A–02F.

## Delivered

- Wrote the explicitly authorized **new** PR-01/02 baseline. The original
  referenced inputs were not supplied. Authoritative copies are in
  `docs/design/PR01_PR02_database_specification.md` and `PR01_PR02_schema.sql`,
  with matching copies beside the parent roadmap. PR-01A DDL is implemented;
  later inventory grains and invariants are clearly marked planned.
- Added m004 with scoped units, hierarchical families and individual stockable
  SKUs. Codes are unique per entity/resource; cycles and inactive dependencies
  are rejected; base units/precision/codes are immutable through the API.
  Deactivation replaces destructive deletion. No product data was seeded locally.
- Added authenticated `/api/v1/entities/:entityId/products/*` CRUD reads/writes
  (without DELETE), filters, paging, exact input schemas and product audit.
  New manage/audit permissions apply only within assigned entities.
- Added Products screens for units, families, SKUs and audit, with editable
  status, duplicate errors, paged selectors, retained selections and read-only
  access. Global navigation remains sidebar-only, without a top bar or intro.
- Extracted the common entity transaction/audit/idempotency helper. Accounting
  and products retain separate audit read boundaries despite shared storage.
- Removed the fixed 200-journal-line cap in UI, validator and OpenAPI. Minimum
  two lines, exact totals and the 1 MiB request guard remain. Editor pages mount
  25 rows; account checks batch at 500 unique IDs and inserts at 250 lines,
  inside one transaction. No fixed cap was replaced with a hidden 300/1,000 cap.
- Updated README, roadmap, PR instructions, bootstrap status, architecture and
  historical handoff notes. Multiple SKU/VAT treatments per future purchase
  invoice remain explicitly required. No additional dependency was introduced.

## Main changes

Backend: `m004_product_foundation.js`, `products.service.js`,
`products.validators.js`, `products.routes.js`, `entity-context.js`, accounting
adapter/audit filtering, journal validator/batching, OpenAPI and test harness.

Frontend: `pages/products/` catalogue/forms/selectors/audit; paged journal editor;
product and large-journal browser checks. Tests use disposable synthetic data.

Design/operations: `docs/design/`, `docs/architecture/products.md`, accounting and
migration notes, README and the three parent planning documents.

## Verification

| Command/check | Result |
|---|---|
| Backend `test:pr01a` | PASS — 12 tests including upgrade, hierarchy races, scope, retries, audit rollback and module audit separation |
| Backend `test:pr00` | PASS — 22 foundation/fresh migration tests; 23-table schema |
| Backend `test:pr00b` | PASS — 14 identity/access tests |
| Backend `test:pr00c` | PASS — 16 tests, including forced rollback after 600 journal lines in multiple insert batches |
| Backend `test:pr01a:browser` | PASS — product create/edit/filter/status/audit/paging/mobile/read-only plus accounting and auth regressions |
| Backend `test:journal:performance` | PASS — 300/1,000 distinct-account lines, source/idempotency replay, six concurrent posts by two users |
| Backend `test:journal:browser` | PASS — 300/1,000-line editor and HTTP posting, all-page balance checks, at most 25 mounted line rows |
| Frontend `test:journal` | PASS — 7 exact-money/validation checks, including 1,000 lines |
| Frontend lint/build | PASS — 2,151 modules |
| Backend `check:openapi` | PASS — 28 paths |
| Backend `db:migrate:local` | PASS — m004 applied once, all four migrations at attempt 1 |
| Backend `npm audit --omit=dev` | PASS — zero production dependency findings |
| Local before/after comparison | PASS — every existing accounting row and m001–m003 history preserved |
| Live health/readiness/frontend | PASS — local processes running, readiness HTTP 200 |
| Frontend `test:smoke` against the local app | PASS — login, all seven routes, readiness and mobile account/navigation; no catalogue or accounting writes |
| Desktop/mobile product screenshots | PASS — content panel and scrolling tables, no global header or viewport overflow |

The first browser test expected an older audit event on page one after creating
26 pagination fixtures. The test was corrected to inspect page two; the complete
gate then passed. A stopped local MySQL process initially blocked two runs; the
verified repository instance was restarted and both runs passed. No schema reset
or installation replacement was used.

Final backend local measurements: 300 lines **96.6 ms**; 1,000 lines **172.0 ms**;
six concurrent 300/1,000-line posts by two users **533.5 ms** total. These are
development-machine measurements, not a deployment SLA. The retained entity
lock serializes writes within one company; different entities are independent.
Final browser measurements for 300/1,000 lines: edit-to-paint **18.8/34.3 ms**,
click-to-visible-posted-row **397/451 ms**.
Payload size, client timeout and machine resources still bound capacity.

## Local state and use

The requested company **abc A.Ş.**, administrator **admin@gmail.com**, password,
existing accounts, calendar and posted journal/request are preserved. Credentials
remain only in ignored local setup files. Verification found 8 accounts, 1
journal with 2 lines and 1 posted request; all pre-existing rows matched the
pre-migration snapshot. There are 23 tables and the three catalogue tables start
empty. Counts can increase as the app is used.

Refresh the browser to load new permissions. In Products, add units, then families,
then SKUs. Reference examples exist only in disposable tests. MySQL, API and Vite
are running locally. No remote, commit, hosted deployment or GitHub PR was created.

## Remaining scope

- PR-01B: stock-defining specifications, versioned GTİP and reviewed supplier
  aliases. Resolve the supplier identity contract in that PR without importing
  historical records. PR-01C completes product UX and release checks.
- PR-02 inventory tables and flows are design contracts only. No physical stock,
  purchase invoice, VAT calculation, conversion factor or historical import is
  implemented by PR-01A. Families will never own physical movements.
- The previously recorded development-only nodemon/chokidar/braces audit
  findings remain; no forced downgrade was applied. No dependency changed here.
- This work validates local operation, not production deployment or throughput.
  Retain deterministic locks, no-partial-write and permission invariants when
  future work changes concurrency or quantity handling.
