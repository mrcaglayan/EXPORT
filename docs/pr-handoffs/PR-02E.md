# PR-02E handoff — Stock trial balance and controlled close

**Current status — 26 October 2026:** PR-02F and the inventory release gate are
implemented; see the [PR-02F handoff](PR-02F.md). PR-03A is next. The dated results
below describe the PR-02E delivery and its original next-step context.

Completed **26 October 2026 (Europe/Istanbul)**. Next is **PR-02F: reversals,
adjustments, performance and the inventory release gate**. PR-02F was not started.

## Delivered behavior

Inventory → Trial balance & close shows opening/incoming/outgoing/closing
quantities and values, historical reserved/available quantities, physical/pool
groupings and paged movement drill-down. A live report uses the last valid prior
close plus later movements; approved versions retain frozen identities, source
membership and exact values. Units stay separate when grouping quantities.

Explicit inventory asset-account mapping compares cumulative posted GL with stock.
Missing mappings, differences, pending postings and stock inconsistencies block
close. No account prefix, GL balancing journal, ownership or VAT policy is inferred.
Financial detail has its own permission boundary; inventory readers can inspect
retained stock versions without financial comparison or write controls.

Preparation captures a version and locks stock/mapped GL postings through its
cutoff. A different authorized user approves the unchanged report. Reopen retains
an exact dependent-period plan; independent approval atomically invalidates later
closes and opens their inventory/closed accounting calendars. Old versions remain
readable as SUPERSEDED. Reclose creates new versions in chronological order.
Audit failure rolls back the entire workflow. Sidebar-only navigation is retained.

See [the close contract](../architecture/inventory-close.md) for permissions,
calendar coordination, UTC release timing and API/schema details.

## Schema and plans

m010 adds seven tables (57 total), lifecycle/reconciliation guards and five
ADMIN-only permissions. All ten migrations are applied once and frozen. Existing
m001–m009 source files, checksums/history and business rows were preserved.
m010 verifies its additions; earlier migration verification remains active.

OpenAPI 0.11.0 documents 99 paths under `/api/v1`; its original contracts are
unchanged. Roadmap v1.12, build/bootstrap pointers and prior handoff status notes
identify PR-02F as next. Design baseline v8 and reference SQL include m010; the
authoritative and project-root copies match and preserve replacement provenance.
Earlier handoffs retain their original dated results beneath current status notes.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr02e` | PASS — 14 tests: retained-stock upgrade, rerun/tamper/recovery, explicit mapping/mismatch, exact reports and historical reservations, corruption/chronology guards, independent approval, immutable snapshots, dependent reopen, accounting coordination, audit rollback, stale review, concurrent preparation/approval, close-versus-post race, scope/CSRF/idempotency and 301 layers |
| PR-02B / PR-02C / PR-02D regressions | PASS — 13 / 13 / 14 tests |
| Foundation / auth / accounting / products / classification / inventory metadata | PASS — 22 / 14 / 16 / 12 / 15 / 11 tests |
| Journal editor regression | PASS — 7 tests |
| Frontend lint and production build | PASS — 2,165 modules; close screen lazy-loaded |
| OpenAPI validation | PASS — 99 paths; semantic comparison confirms all original path/schema contracts preserved |
| Combined isolated browser gate | PASS — earlier workflows plus mapping/mismatch, source drill-down, independent close/reopen, version 2, retained version 1, reader financial isolation and mobile layout |
| Local backup and migration | PASS — private SQL backup before m010; all ten migrations applied once; rerun verifies without reapplication |
| Local before/after hashes | PASS — original rows and migration sources preserved; 57 tables; all seven new tables empty and existing stock tables unchanged/empty |
| `npm --prefix frontend run test:smoke` | PASS — running local app, login/logout, navigation, readiness and mobile controls |
| Local close-screen checks | PASS — existing company/admin, five new permissions, empty stock/period/mapping reads, new tab and mobile layout; no business writes |
| Screenshots / matching baseline copies / `git diff --check` | PASS |

The final 301-layer close run measured 7,371 ms including approval/read
verification while other suites ran concurrently. An earlier isolated run was
1,636 ms. These are correctness/capacity observations, not deployment latency
guarantees. Live reconciliation still inspects historical projections,
reservations and GL; grouping loads rows into memory. PR-02F must benchmark and
optimize representative volumes. No business line-count ceiling was introduced;
reads remain 25/default, 100/max, and snapshot inserts batch at 250.

An intermediate browser check selected a row by unstable UUID ordering; it now
selects the intended SKU explicitly and the full gate passes. A local startup
probe initially used an incorrect readiness URL; `/api/v1/ready` returns 200 and
the local browser checks pass. No dependency or lockfile changes were needed.
Disposable schemas/accounts were removed by their harnesses.

## Running locally and next work

Open **http://localhost:5173/inventory**, then **Trial balance & close**.
Repository MySQL, API port 3000 and Vite port 5173 are running. Company
**abc A.Ş.**, **admin@gmail.com** and its existing password remain unchanged.
Ignored backup, before/after hashes, runtime process record, logs and screenshots
are retained locally. Data comparisons ran before browser authentication checks,
which only change authentication state. No real stock, extra users, mappings,
financial entries or historical workbook data were added. No commit, remote PR
or deployment was created.

Approval needs an actual second authorized user; this stage does not create one.
Receipt entry remains fixture-only until PR-03 purchasing integration. Next,
implement PR-02F with a new forward migration: explicit reversals/corrections,
approved adjustments/revaluation (including value-only movements), source
lineage, multi-grain conservation and the combined inventory performance/release
gate. Preserve historical snapshots and explicitly resolve accounting-event
policy before generating automatic stock-related GL or VAT entries.
