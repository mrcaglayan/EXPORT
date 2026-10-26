# PR-02A handoff — Inventory foundation

**Current status — 26 October 2026:** PR-02F and the inventory release gate are
implemented; see the [PR-02F handoff](PR-02F.md). PR-03A is next. The dated results
below describe the PR-02A delivery and its original next-step context.

Completed **22 October 2026 (Europe/Istanbul)**. Next is **PR-02B: goods receipts,
FIFO source layers and immutable physical/pool ledgers**.

## Delivered behavior

Inventory now opens directly into a setup card with Warehouses, Destination pools,
Inventory periods, Movement types and permission-controlled Audit trail tabs.
Search, status/kind filters, pagination, inline validation, retry and mobile views
reuse the existing product controls. Sidebar-only global navigation is preserved.

- Physical warehouses have fixed codes and editable name/location/active status.
- Pools are entity-wide definitions: at most one GENERAL and one COUNTRY pool
  per assigned ISO country, including inactive records. A future balance references
  both warehouse and pool. Istanbul with GENERAL/AF/CM requires one warehouse.
- Inventory periods link to one existing OPEN accounting period, reusing its code
  and dates. Accounting and inventory statuses are separate. No inventory close
  or reopen action is exposed before PR-02E.
- Movement types have fixed codes/effects and editable names/active status.
  They classify future movements; metadata does not execute stock or GL posting.
- Every write is scoped, CSRF-protected, idempotent and atomic with its audit.
  New configure/audit permissions are granted only to ADMIN; inventory readers
  have no configuration or audit controls. No delete endpoint is exposed.

The country reference and frozen SQL CHECK contain the same 249 assigned codes.
The complete snapshot was compared with the published ISO list linked in the
[inventory contract](../architecture/inventory-foundation.md). Reserved codes and
invalid GENERAL/country combinations are rejected by API and database constraints.

## Files and planning decisions

Backend: m006, inventory routes/service/validators, country reference, registry/app
registration, OpenAPI 0.7.0 (54 paths), inventory integration tests and test aliases.
Frontend: the Inventory page/panel/form, shared picker compatibility and combined
browser coverage including a separate inventory reader fixture.

The earlier classification upgrade test now compares the exact original migration
rows, preserving its checksum/timestamp assertions as new migrations are added.
Product browser tests wait for completed tab/detail transitions before interacting
with controls shared by the old and new view.

README, roadmap v1.8, build/bootstrap status and older handoff status notes now
identify PR-02B as next. Design baseline v4 includes m006 DDL and explicit future
contracts; the authoritative `docs/design/` files and `docs/project-root/` copies
match. Entity-wide pools resolve the roadmap's one-GENERAL-per-entity rule while
preserving warehouse-specific future balances. Calendar links avoid duplicate
accounting/inventory date definitions.

Applied m001–m005 and both dependency lockfiles are unchanged. m006 is now applied
locally and must also remain immutable. No new dependency, workbook import or
synthetic business record was added to the local company.

## Executed verification

| Command/check | Result |
|---|---|
| `npm --prefix backend run test:pr02a` | PASS — 11 tests, including upgrade preservation, permissions, country SQL constraints, scoped FKs, duplicate races, calendar guards, rollback and HTTP protections |
| `npm --prefix backend run test:pr01` | PASS — complete regression gate |
| Included OpenAPI validation | PASS — 54 paths |
| Included frontend lint/build | PASS — 2,160 modules |
| Included journal editor regression | PASS — 7 tests |
| Included fresh migration/foundation suite | PASS — 22 tests |
| Included identity suite | PASS — 14 tests |
| Included accounting suite | PASS — 16 tests |
| Included product foundation suite | PASS — 12 tests |
| Included classification suite | PASS — 15 tests |
| Included combined browser workflow | PASS — products, classification, product UX, accounting, inventory setup, auth, reader access and company isolation |
| Country reference comparison | PASS — all 249 codes match the published reference |
| Desktop/mobile screenshot review | PASS — setup forms/tables, no global header or document overflow |
| `npm --prefix backend run db:migrate:local` | PASS — m006 applied to repository-owned MySQL |
| `npm --prefix backend run db:migrate:status` | PASS — all six applied, each at attempt 1 |
| Before/after state comparison | PASS — existing record hashes unchanged; prior migration/permission rows retained; four new domain tables empty; 33 tables total |
| `npm --prefix frontend run test:smoke` | PASS — running local app, no business writes |
| Local API readiness and UI | PASS — HTTP 200 |
| `git diff --check` | PASS |

Earlier browser attempts found ambiguous pool-label selectors and product test
transition timing; the corrected combined flow passes in the full gate. The older
classification history assertion was also corrected and passes. Disposable test
schemas/accounts were removed by their harness; local business records were not
used as test fixtures.

## Running locally and next work

Open **http://localhost:5173/inventory**. The repository-owned MySQL, API on port
3000 and Vite on port 5173 are running. Company **abc A.Ş.**, administrator
**admin@gmail.com** and its existing password are unchanged. Refresh the app to
load inventory permissions. The password remains in the ignored local setup file;
private snapshots, logs and screenshots also remain ignored.

PR-02B must add receipts/source layers and immutable physical/pool ledgers with
transactional projections. Use synthetic sources only until PR-03 purchasing.
Validate active references and movement effects, check both inventory/accounting
period statuses within the transaction, preserve quantity/value conservation and
add in-use guards when new stock dependencies are introduced. Extend the baseline
and OpenAPI in a new migration; do not edit m006.

Stock quantities, valuations, reservations, invoices and VAT calculations remain
future work. Development-only nodemon/chokidar/braces findings recorded in earlier
handoffs are unchanged. This delivery is local; no commit, remote PR or deployment
was created in this step.
