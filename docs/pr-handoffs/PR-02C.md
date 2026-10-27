# PR-02C handoff — Country allocation and controlled borrowing

**Current status — 27 October 2026:** PR-03C atomic purchase receipt/accounting is
implemented; see the [PR-03C handoff](PR-03C.md). PR-04A is next. The dated results
below describe the PR-02C delivery and its original next-step context.

Completed **23 October 2026 (Europe/Istanbul)**. Next is **PR-02D: reservations,
issues, FIFO and no-negative-stock**.

## Delivered behavior

Inventory → Allocation & borrowing previews destination stock, then GENERAL,
and shows a shortfall without silently using another country. Explicit requests
fix their warehouse/SKU/source/destination and FIFO source-layer quantities.
Requests can be reviewed, rejected, cancelled by their requester, or executed
after approval. Country borrowing requires a different authorized reviewer,
including for ADMIN; GENERAL allows the same authorized reviewer.

Execution posts equal/opposite signed pool quantities and values for each layer,
updates both pool projections and preserves physical stock, source identity and
GL. Cost comes from the source pool's remaining carrying value; full depletion
transfers every residual millionth. Original receipt allocations remain readable.
Pending/approved requests do not reserve stock: competing execution can make an
approved plan unavailable, without partial posting or silent layer substitution.

Both calendars must be open and references active at request, approval and
execution. Current projections cannot support a transfer dated before a layer's
latest pool movement. History, reasons and actor identities remain auditable.
The UI includes status filtering, paged fixed-layer details, retry feedback and
permission/state-aware actions. Sidebar-only navigation and mobile layout remain.

## Schema, authorization and planning corrections

m008 adds inventory_reallocations and inventory_reallocation_lines (43 tables),
extends event provenance and signed pool constraints, and updates guarded target
projection creation. Immutable receipt/history triggers remain. SQL transition
checks enforce independent country review, fixed plans, matching paired entries
and reconciled projections. All writes, audit and idempotency share one entity
transaction/lock; failures roll back together. New request/review/execute
permissions are granted to existing ADMIN roles only within their assignments.

The runner now accepts an explicit `replacesVerificationFor` handoff when a forward
migration extends an older table. m008 verifies the complete evolved m007 schema
plus new objects. Pending successors never suppress original verification; only
applied successors or explicitly retried failed/interrupted successors own it.
Checksums, ordering, locking and recovery gates remain. Original m001–m007 sources
and local history were preserved; now freeze m008 too.

OpenAPI is 0.9.0 with 72 paths under `/api/v1`. README, roadmap v1.10, build/bootstrap
status, current pointers in historical handoffs, and design baseline v6 identify
PR-02D as next. Authoritative and project-root baseline copies match. The baseline
retains the original user-authorized replacement provenance.

See [allocation contract](../architecture/inventory-reallocations.md) and
[migration recovery](../architecture/migrations.md) for implementation boundaries.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr02c` | PASS — 13 tests including forward upgrade with a posted receipt, full-schema rerun/tamper detection, explicit interrupted retry, independent review, CM20→AF, concurrency, rounding/free stock, audit rollback, period/backdate checks, SQL history guards, HTTP protections and 301-layer execution |
| PR-02B receipt regression | PASS — 13 tests |
| PR-02A metadata regression | PASS — 11 tests |
| Foundation / auth / accounting / products / classification | PASS — 22 / 14 / 16 / 12 / 15 tests |
| Journal editor regression | PASS — 7 tests |
| Frontend lint and production build | PASS — 2,162 modules |
| OpenAPI validation | PASS — 72 paths |
| `npm --prefix backend run test:pr02c:browser` | PASS — combined prior workflow plus allocation preview, country request, a separate browser reviewer, execution, immutable receipt detail, signed pool ledger, reader access and mobile layout |
| Local SQL backup and migration | PASS — private backup saved before m008; all eight migrations applied once |
| Local before/after comparison | PASS — all original row hashes/history and old migration source hashes preserved; 43 tables; all ten stock/request tables empty |
| `npm --prefix frontend run test:smoke` | PASS — running local app, no business writes |
| Local allocation screen / stock reads | PASS — new permissions, planner, empty requests/stock and mobile layout |
| Screenshot review / `git diff --check` | PASS |

The 301-layer execution measured 8.73 seconds while other disposable regression
suites were also running. It is an atomic correctness/capacity check, not a
production performance target. Per-line execution statements and the entity-wide
write lock remain optimization work for the PR-02F performance gate; no fixed
business line-count limit was introduced. Reads remain paginated at 25/default,
100/maximum, and the existing 1 MiB request guard remains.

The first receipt regression run caught an outdated table-count assertion (41
instead of 43); it was corrected and the suite passed. OpenAPI validation rejected
an empty `required` array on the empty execution body; that was removed and the
contract revalidated. Disposable schemas/accounts were removed by their harnesses.

## Running locally and next work

Open **http://localhost:5173/inventory**. Repository MySQL, API port 3000 and Vite
port 5173 are running. Company **abc A.Ş.**, **admin@gmail.com** and its existing
password are unchanged. No second real user, stock fixtures or historical data
were added. Private SQL backup, state hashes, logs and screenshots stay ignored.
No commit, remote PR or deployment was created.

Receipt posting remains fixture-only until PR-03 connects authorized purchasing.
Real country borrowing will require another assigned user with review permission.
PR-02D must add reservations and dispatch, subtract reserved quantity from preview
and transfer execution, and extend event/physical-ledger guards through a new
forward migration with complete retained-schema verification. Preserve exact
source layers, both calendars, no-negative-stock and replay/audit guarantees.
PR-02D was not started in this stage.
