# PR-04A handoff — Packing lists, export cards and shipments

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **27 October 2026 (Europe/Istanbul)**. Next is **PR-04B: export
invoice/e-document, broker GTİP review and GÇB lifecycle**, including later
partial clearance and transaction-type handling.

## Delivered behavior

Exports in the sidebar now stages original packing-list lines through manual
entry or the provided UTF-8 CSV template. It retains the exact source, SHA-256,
original item wording, quantity/unit, optional package/count/weight evidence and
importer. Identical source intake under one reference replays; conflicting content
cannot replace it. Sources and cancelled identities remain immutable.

Explicit per-line SKU and one-to-one base-unit mapping, including bulk updates
and exact catalogue-code assistance, appends retained revisions. The customer,
warehouse and foreign country pool are selected explicitly. A reviewer independent
of importer, mapper and submitter approves the source and assigns the annual
company export-card sequence, for example EXP-2026-000001. Failed approval rolls
back its counter; cancelled numbers remain retained. Current-reference renewal
appends complete review evidence without rewriting the issued card snapshot.

Cards support multiple partial shipment plans. Pending/approved/reserved/
dispatched quantities cannot exceed each original packing line, including under
concurrent requests. An independent person reviews each shipment. Allocation
reserves destination-country stock first, then GENERAL, using existing FIFO
sources. Shortage requires a new receipt or an approved country transfer.
Reservation changes availability while physical quantities stay unchanged.

Dispatch posts the exact reserved shipment quantities through the existing stock
transaction core. Issue lines, stock ledgers/projections, reservation counters,
shipment evidence/status, lineage, audit and retry response commit together.
Posting/stock/audit failures roll back atomically; concurrent retries cannot
dispatch twice. Unposted cancellation releases exactly its reservation and
packing commitments in the same transaction.

Paged provenance retains packing line → shipment → reserved pool/layer → original
stock receipt/source line → purchase invoice/order source when supplied by the
real PR-03C adapter, plus posted dispatch-line UUID. Genuine zero-cost goods keep
their zero value. No VAT amount is inferred from stock value.

Export-owned reservations/issues cannot be released or dispatched through generic
inventory routes. Active/dispatched dependencies block source/card remapping or
cancellation. Dispatched export-issue reversal requires a future coordinated
export return/reversal adapter; stock-only reversal would lose the shipment fact.
Existing stock counts/revaluations keep their explicit reconciliation controls.

See [the full export contract](../architecture/export-operations.md) for state,
permission, source and resource boundaries.

## Supplied workbook

The user supplied `C:\Users\ucaglayan\Desktop\Zambiya 21.10.2026.xlsx` as the
usual incoming list format and clarified that using it directly was optional.
Read-only inspection found eight sheets: an aggregate packing summary and
differently structured detailed product/size/book lists. Summary rows cannot
silently become stockable SKU lines or be combined with detail sheets without
selection and reconciliation.

This stage supports **manual and CSV intake**, not direct multi-sheet XLSX import.
Direct Excel selection, size expansion and summary reconciliation require a
dedicated adapter. No formula, external link or embedded object was executed.
The workbook was not modified and none of its real rows were imported, seeded,
consolidated or copied to tracked fixtures. Only ignored structural metadata and
the original file hash remain in `.local/pr04a-workbook-analysis.json`.

## Files and contracts

- `m015_export_operations.js` adds nine scoped tables, exact workflow/source
  guards, annual card sequencing and eight explicit ADMIN permissions. The
  existing exports.read permission remains. Applied m001–m014 sources stay frozen.
- New export source/record/reference/packing/shipment services, strict validators
  and routes under `/api/v1/entities/:entityId/exports` reuse existing auth, CSRF,
  entity locking, transaction, idempotency, audit and stock functions.
- Inventory reservation/release/issue transaction functions now support the
  internal export adapter. Public routes retain their existing behavior for
  independent inventory sources; export-owned sources require their shipment.
- Lazy-loaded Exports screens include manual/CSV preview, template/download,
  paged mapping/review history, export cards, partial shipments, allocation,
  dispatch and source detail. URLs, refresh, reload and reader controls are tested.
  Sidebar-only layout remains; no top bar/global introduction was added.
- OpenAPI **0.16.0**, **202 paths**. Roadmap **v1.17**, design baseline **v13**,
  final-state SQL/reference copies, build instructions and current handoff pointers
  identify PR-04B next. Earlier dated delivery details remain historical.
- No dependency was added. No commit, push, deployment, real export source intake,
  historical workbook migration, customer/pool/SKU creation or extra local user
  was performed by this implementation.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr04a:release` | PASS: OpenAPI, frontend lint/build, journal editor, foundation/auth/accounting/catalogue, every inventory stage, purchasing, invoices, receipts, exports and full isolated browser |
| `npm --prefix backend run test:pr04a` | PASS: 11 test-runner checks including fresh/retained migration, tamper/recovery, original CSV/manual source, independent numbering/review, partial quantities, concurrent over-shipment, country/GENERAL allocation, closed/stale guards, rollback, 301 lines and real purchase-to-export provenance |
| Final frontend lint/build after border styling consistency | PASS: 2,182 modules |
| Final OpenAPI validation | PASS: 202 paths; source/preview response types and stock ownership guards documented |
| `git diff --check` | PASS |
| Local migration apply and verification rerun | PASS: m015 applied once; 15 applied migrations; 82 tables |
| Old row/history/source fingerprints | PASS: all prior business data and m001–m014 checksums/history retained; expected permission/role-permission/schema-history additions only |
| Local saved-account desktop/mobile smoke | PASS: new Exports controls, empty packing/cards, two existing STAGED invoices retained, no runtime errors; session logged out |

Tests use synthetic source rows and fresh disposable schemas/accounts only. Their
cleanup removes only the generated test schema/account. Historical m014 recovery
tests now stop at their own migration registry version before upgrading to m015.
The complete prior domain suite verifies the internal stock-function refactor.

## Local upgrade and runtime

A verified local backup is retained at `.local/backups/pr04a-before.sql`
(**1,040,575 bytes**) with its raw SHA-256 in `.local/pr04a-backup.json`.
Before/after fingerprints and `.local/pr04a-verification.json` record the upgrade.
All nine new tables, including card sequences, are empty. Both previously staged
invoices retain their six source lines and STAGED status; no mappings, approvals,
receipts, export cards, shipments or journals were created locally by setup.

Only the two saved project Node processes were restarted after verifying their
identities and expected listening ports. The API is ready at port **3000** and
the frontend runs at **http://localhost:5173/exports**. Runtime ownership/log paths
are retained in `.local/runtime-pr04a.json`. Company, administrator and password
remain unchanged; no secret is copied into tracked docs or tool output.

Ignored screenshot evidence includes export intake, shipment preview, dispatched
desktop/mobile views and local empty Exports/intake screens. Temporary inspection,
editing and verification helpers were removed after completion; backup, source
structure metadata, state hashes, runtime metadata/logs and screenshots remain.

## Boundaries and next step

Dispatch is a stock movement. It creates no export sales/COGS journal, external
e-invoice, customs declaration/clearance, input VAT attribution or refund claim.
Partial deliveries use separate shipment plans; one reserved plan dispatches its
exact quantities once. Direct XLSX import and coordinated shipment return/reversal
remain explicit later work. Source content stays limited to 750,000 UTF-8 bytes,
whole JSON to 1 MiB, with batched atomic writes and paged editors/reads rather
than a fixed business line ceiling.

PR-04B should link export invoice/e-document and broker-reviewed GTİP/customs
facts to these existing cards, packing lines and actual issue/source quantities.
Distinguish partial customs clearance and transaction types without treating
dispatch or invoice issuance as clearance/refund entitlement. Preserve applied
m001–m015, all purchase and export source relationships, original ledgers,
decision revisions, card numbering and retained stock close versions. The earlier
outgoing invoice XML remains a read-only reference for that export-document stage.
