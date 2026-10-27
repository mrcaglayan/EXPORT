# Stock corrections and PR-02 release gate

Implemented in PR-02F, 27 October 2026. m011 adds two tables (59 total), exact
reversal links and derived posting dates on immutable stock events. It preserves
applied m001–m010 sources and original event/ledger fields. The event date backfill
copies each retained source's posting date; it does not change that date.

## Correction workflow

Inventory → Corrections supports three kinds of request. All require a reference,
posting date, reason and evidence reference. Evidence is a retained textual
reference, not an uploaded or independently authenticated document.

| Kind | Quantity and value behavior |
|---|---|
| COUNT | Record observed quantity for existing source-layer/pool stock. Variance uses remaining carrying value proportionately, with residual value consumed on full depletion. An empty source uses its original unit cost for a positive variance. |
| REVALUATION | Record a target total carrying value for existing stock with positive quantity. Quantity delta is zero. Target value may be zero; resulting value cannot be negative. |
| REVERSAL | Invert every original physical/pool entry, retaining the original quantities and costs. Supports posted receipts, executed pool transfers, dispatches, counts and revaluations. Exactly one posted reversal per original event. A reversal cannot itself be reversed. |

Counts and revaluations operate only on existing source-layer/pool projections.
They cannot create a purchase source or assign provenance to unidentified goods.
Each request may include many stock items and has one line per layer/pool.
There is no fixed business line-count ceiling; the 1 MiB request guard, batched
inserts and paged editor/reads remain. Requests do not reserve stock.

Request captures before-quantity/value, calculated signed deltas, optional observed
quantity or target value, original pool entry for reversals and a hash of the
layer's movement history. Identity, evidence and lines are immutable. Lifecycle:
ASSEMBLING → REQUESTED → APPROVED → POSTING → POSTED. REQUESTED may instead become
REJECTED or CANCELLED; APPROVED may be CANCELLED. Assembly/posting states exist
only within transactions. Rejected/cancelled records remain discoverable.

Another authorized user must approve. The requester may cancel, and an authorized
reviewer may reject their own request. Posting may be performed by the requester
after independent approval. Approval and posting both recheck active references,
source fingerprint, before-balances, outstanding reservations, valid carrying
value and both open calendars. Posting date cannot precede the latest movement
on an affected source layer. Changed stock requires cancellation and a new plan.

Reversing a dispatch restores stock to its original layers and pools as available
stock. Original issue lines, reservation counters and terminal reservation state
stay unchanged. Create a new reservation before dispatching the returned goods.
Receipt reversal is blocked if its exact quantities/costs cannot be removed while
preserving reservations and valid remaining value. Reverse dependent movements
or submit an explicitly reviewed correction; the application never silently
borrows another country's allocation. A pool-transfer reversal has no physical
or GL effect and preserves the original transfer history.

No correction generates a GL journal, posting request, invoice, ownership event,
customs event or VAT calculation. Explicit stock-to-GL comparison continues to
show any resulting difference and blocks close until resolved through authorized
accounting. The application does not invent an account/event policy. Approved
reopen remains necessary for a correction dated in a closed stock period.
Old snapshots, their event membership and report values remain unchanged.

## Schema and API

inventory_corrections retains request/review/posting actors, reasons, evidence and
original-event link. inventory_correction_lines retains exact source grain,
before-balances and deltas. inventory_events adds CORRECTION, correction_id,
reverses_event_id (scoped unique) and immutable derived posting_date. Scoped FKs,
state/immutability triggers, source validation and exact post reconciliation
protect the complete workflow. Ledger checks now permit quantity=0 with nonzero
value; projections reject value without quantity. Physical and pool deltas
reconcile per source layer. m011 verifies the complete evolved m007–m009 schema
through the existing explicit verifier handoff; m010 still verifies its closes.

| Route under `/api/v1/entities/:entityId/inventory` | Permission / behavior |
|---|---|
| GET corrections, corrections/:id, corrections/:id/lines | inventory.read; paged, scoped retained evidence |
| POST corrections | inventory.correction.request; validated count/revaluation/reversal plan |
| POST corrections/:id/approve or reject | inventory.correction.review; independent approval |
| POST corrections/:id/cancel | inventory.correction.request; requester only |
| POST corrections/:id/post | inventory.correction.post; approved immutable plan only |
| GET movements | inventory.read; physical/pool cursor feed and explicit reversal lineage |
| GET integrity | inventory.read; ledger/projection, layer/pool and reservation checks |

The three new permissions are granted only to existing assigned ADMIN roles.
All writes require authenticated scope, Origin/JSON, CSRF and an idempotency key.
Stock/event changes, projection updates, workflow, audit and retry results commit
under the common entity lock. A posting replay returns the existing event.
Competing reversal requests cannot both post. Failure at audit rolls back all
of these changes. No extra real user is created for independent approval.

Movement history orders by recorded event time, event ID and entry ID. Its opaque
cursor is bound to scope and filters; each page returns nextCursor/hasMore.
New events can appear ahead of a previously read page: this is a live browser,
not an immutable export. Return to its first page for new events, or inspect a
close snapshot for frozen membership. Existing offset-based ledger routes remain
compatible. Event-date/cursor and event-entry indexes support these reads.

Trial balance includes signed corrections and zero-quantity value changes in
incoming/outgoing totals, preserving opening + incoming − outgoing = closing.
The movement detail identifies correction references and source history. Closed
report grouping/filtering/pagination runs in MySQL against frozen snapshot data.
Live projection checks aggregate each scoped ledger once. Live report construction
still loads relevant source balances/movements into memory, and GL/reservation
checks still inspect history; these are explicit limits beyond tested volumes.

## Verification and operational limits

Run from the repository root with its local MySQL running:

```text
npm --prefix backend run test:pr02f
npm --prefix backend run test:pr02f:performance
npm --prefix backend run test:pr02f:browser
npm --prefix backend run test:pr02
```

The combined gate is fail-fast: OpenAPI, frontend lint/build, journal editor,
foundation/fresh migrations, auth/accounting/products/classification, inventory
metadata/receipts/allocations/reservations/closes/corrections, capacity benchmark
and the complete browser flow. Each harness owns and removes its disposable
schema/account; it does not reset development business data. Only one browser
gate may use port 5184 at a time.

The synthetic benchmark uses 1,001 source layers, four 1,000-line revaluations,
at least 10,002 physical/pool entries, a monthly close and paged reads. Thresholds
are local regression budgets with headroom based on observed runs, not a
deployment SLA: 60 s receipt, 35 s complete bulk correction (10 s request, 5 s
review, 20 s post), 3 s live/closed/integrity/page reads, 30 s close preparation,
15 s approval. Results are saved in ignored `.local/benchmarks/pr02f.json`.

Initial measurements exposed repeated correlated scans in posting and live
reconciliation. Grouped checks reduced bulk posting from tens of seconds to
single-digit/low-double-digit seconds and the live monthly read to hundreds of
milliseconds in the final runs. Receipt guards and immutable snapshot insertion
remain slower bulk operations. The entity write lock still serializes mutations;
benchmark the intended deployment hardware and larger/multi-company workloads
before promising interactive latency or sustained throughput.

PR-02 completes here. PR-03A purchasing is now implemented in m012; see
[purchasing](purchasing-foundation.md). Invoice staging is now implemented in m013; PR-03C is now implemented in m014; PR-04A is next. See [purchase receipt/accounting](purchase-receipts.md). Preserve m001–m013, exact source
lineage, correction/reversal history and old snapshots. Real purchase receipt
posting remains fixture-only until the authorized PR-03 purchasing adapter;
multi-item invoice accounting and VAT integration remain PR-03B/PR-03C.
