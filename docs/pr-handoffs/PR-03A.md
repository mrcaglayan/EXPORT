# PR-03A handoff — Purchasing foundation

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **27 October 2026 (Europe/Istanbul)**. Next is **PR-03B: İZİBİZİ
e-Fatura XML intake, UUID deduplication, source-line mapping and document matching**.
PR-03B was not started.

## Delivered behavior

The sidebar **Purchasing** page manages trading partners, contracts, purchase
requests and purchase orders. Supplier partners reuse an existing catalogue
supplier ID or create one atomically; previous aliases retain their identity.
Customer-only and combined roles are supported. Submitted documents retain
EBYS references, supplier/SKU snapshots, stable source lines, quantities, prices,
terms and review/cancellation evidence.

Another authorized user approves each contract/request/order. Orders select
multiple lines from one approved request and may use a matching approved supplier
contract. Split orders count pending and approved quantities against each request
line; concurrent submissions cannot over-order it. Reject/cancel releases those
commitments. Cancel dependent orders before cancelling a request or contract.
Submitted headers/lines are immutable; revised content needs cancellation and a
new reference. Original documents and decisions remain readable.

Quantities use SKU base-unit precision. Decimal prices/net amounts retain six
places and each line uses exact half-up multiplication. Free goods use zero price
and an explicit reason. No fixed document-line ceiling: writes are batched,
selectors/read APIs are paged, editors show 25 lines and the 1 MiB body guard
remains. Tests cover 301 request/order lines. This is not a throughput SLA.

Approval records an internal purchasing decision. This stage does not send orders,
fetch EBYS documents, import invoice XML or create stock/journals/VAT. Contracts
retain terms without a price schedule or spending ceiling. Tax IDs are retained
identifiers without statutory authentication. Real invoice matching and
153/191/320 posting remain PR-03B/PR-03C. No real supplier, user, purchasing,
invoice, stock, financial or historical workbook data was seeded.

See [the purchasing contract](../architecture/purchasing-foundation.md) for API,
permissions, state/source invariants and limitations.

## Files, migration and plans

- `backend/src/migrations/m012_purchasing_foundation.js`: four new scoped tables,
  eleven purchasing guards and four explicit ADMIN permission grants. Existing
  m001–m011 sources and structures are retained. All twelve applied sources are
  now frozen. The schema contains 63 tables.
- `backend/src/services/{trading-partners,purchasing-documents,purchasing-references}.service.js`,
  `purchasing-context.js`, validators and purchasing routes: scoped, locked,
  parameterized writes; atomic audit/idempotency; exact quantities/totals.
- `frontend/src/pages/purchasing/`: partner forms, contract/request/order entry,
  retained details, source drilldown and audit. View/selected ID survive URL
  reload/back; permission and empty/loading/retry/error states are included.
  Sidebar-only layout is preserved. Purchasing is a separate lazy-loaded chunk.
- OpenAPI **0.13.0**: **132 paths**, including **24 purchasing additions** and
  thirteen new schemas. No new dependencies or lockfile changes.
- `backend/tests/purchasing.integration.js`, browser smoke and PR-03A release
  command. Existing migration-recovery test now isolates its m011 recovery before
  applying m012; original migration files were not edited.
- Roadmap **v1.14**, build/bootstrap instructions, README, current architecture
  notes and historical handoff status notes identify PR-03B as next. Baseline
  **v10** and SQL reference include m012; authoritative/project-root copies match.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr03a:release` | PASS — complete sequential release command |
| Purchasing integration | PASS — 15 tests including parent: retained-data upgrade/rerun/recovery/tamper, supplier reuse, snapshots, independent approval, exact decimals/free goods, split/concurrent commitments, rejection/cancel, dependencies, scopes/permissions, stale/inactive references, audit rollback, source substitution/direct SQL guards, dates, 301 lines and HTTP session/CSRF/idempotency |
| Foundation / auth / accounting / products / classification | PASS — 22 / 14 / 16 / 12 / 15 tests |
| Inventory / receipts / allocations / reservations / close / corrections | PASS — 11 / 13 / 13 / 14 / 14 / 11 tests |
| Journal editor | PASS — 7 tests |
| Frontend lint/build | PASS — 2,170 modules, lazy-loaded Purchasing chunk |
| OpenAPI | PASS — all 132 paths validated |
| Isolated browser | PASS — all earlier workflows plus partner edit, EBYS contract/request/order, two SKU lines/free sample, independent reviewer, source drilldown, cancellation guard, audit, back/reload, phone forms/details, read-only access and entity isolation |
| Local backup / migration / rerun | PASS — private SQL backup; m012 applied once; twelve applied migrations verified on rerun |
| Local before/after comparison | PASS — all original rows/columns/history retained, source hashes preserved, four new purchasing tables empty |
| Local app and purchasing browser checks | PASS — existing company/admin, four permissions, empty purchasing reads, form guards, sidebar/mobile layouts, logout and clean browser runtime; no business writes |
| Local general smoke | PASS — eight routes, authentication, readiness and mobile navigation |
| Desktop/mobile screenshots, design copies and `git diff --check` | PASS |

The first full release run exposed an existing test-order assumption: it tried to
simulate an interrupted m011 after m012 was already applied. The fixture now
performs m011 recovery using the registry through m011, then runs the full
registry. Targeted tests and the complete release command passed afterwards.
An OpenAPI generation argument also incorrectly placed a description in a GET
request-body reference; validation caught it and the two line-read operations
now document ordinary GET queries. No runtime migration recovery was required.

The PR-02 1,001-layer capacity benchmark was not repeated in this PR: purchasing
does not change its stock services/triggers. Its command and previous results
remain available. Disposable test schemas/accounts were removed by their harnesses.

## Running locally and next work

Open **http://localhost:5173/purchasing**. Repository MySQL, API port 3000 and UI
port 5173 are running. Company **abc A.Ş.**, admin **admin@gmail.com** and the
existing password are retained. Independent approval needs a second authorized
real user; this work created no additional local account.

Ignored local artifacts retain the SQL backup, before/after hashes, verification,
screenshots and runtime process/log records. The data comparison preceded local
login/logout checks, which only change authentication state. Temporary setup
scripts were removed. No commit, remote pull request, supplier communication or
deployment was performed by this work.

For PR-03B, inspect actual supported invoice XML examples/technical specifications
and define strict staging/validation before import. Preserve every source line,
invoice UUID and supplier identity; map multiple SKUs and VAT treatments without
reducing an invoice to one stock item. Match to retained approved purchasing
sources and carry unresolved differences as explicit exceptions. PR-03C then
implements the authorized real receipt and balanced 153/191/320 adapter.
