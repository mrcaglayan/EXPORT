# Reservations and physical dispatch — PR-02D

Implemented 23 October 2026. m009 adds seven tables (50 total), extends issue
event provenance and signed physical entries, and protects reserved stock in both
balance projections. Applied m001–m008 sources remain unchanged; freeze m009 after
application. Receipt posting remains fixture-only until PR-03.

## Reservation identity and selection

A reservation fixes its reference, warehouse, destination COUNTRY pool, date,
reason and document lines. Each line names one SKU and positive quantity in its
base unit. Multiple SKUs and repeated SKU lines are supported without a fixed
business line-count cap. Exact decimal strings, six-place storage, unit precision,
the 1 MiB request guard and finite server resources still apply. Inserts batch at
250 rows; reads default to 25 and cap at 100 per page.

Selection uses unreserved destination stock first, then active GENERAL stock,
FIFO by received date, creation time and layer UUID within each pool. Another
country is never borrowed silently: complete its approved reallocation first.
Repeated lines share a stock cache so one document cannot select a quantity twice.
Layers received after the reservation date, or with a later pool movement, are
ineligible. Both inventory and accounting calendars must be open at creation.

Each allocation retains its reservation line, warehouse/SKU/layer/pool identity,
original quantity and monotonically increasing released/issued quantities.
Outstanding reserved = original − released − issued. Available = on-hand − total
outstanding reserved. Creating or releasing a reservation never changes on-hand,
stock value or ledger entries. Allocation previews and reallocation execution use
unreserved quantities; transfer cost still divides by source-pool on-hand quantity.

States are internal ASSEMBLING → ACTIVE → CLOSED or CANCELLED. Header/line identity
and terminal history cannot be edited or deleted. No internal state survives a
successful service transaction. Warehouses, SKUs and source/destination pools with
outstanding reservations cannot be deactivated, including a destination supplied
entirely from GENERAL. Existing family/unit and stock-use guards remain.

## Partial release, cancellation and dispatch

Release selects quantities by reservation line, taking later allocations first
and preserving earlier FIFO stock. It appends an immutable release header and
exact allocation lines; counters must reconcile to that history. A full release
closes the reservation. Cancellation releases all remaining unissued quantities
and marks CANCELLED. Already posted dispatches remain unchanged. Releases and
cancellation remain possible after period closure because they do not move stock.

Dispatch selects positive quantities by distinct reservation line. The service
consumes only that reservation's fixed allocations in FIFO order, never a newly
available replacement layer. It validates active references, ISSUE movement
effect, exact unit precision and both open posting calendars. Dispatch and posting
dates cannot precede the reservation date; the posting date cannot precede the
source layer's latest pool movement. This conservative rule uses current
projections and does not claim to reconstruct historical availability.

Consumption value = remaining source-pool carrying value × consumed quantity /
remaining source-pool on-hand quantity, rounded half-up in integer millionths.
Full depletion consumes every residual millionth. Free goods retain zero value.
Distinct consumption lines retain allocation → reservation line → receipt layer →
receipt line provenance. One negative physical entry per event/layer and one
negative pool entry per event/layer/pool aggregate those source lines. Both
quantity and value projections reconcile to the ledgers before posting completes.

This stage records physical dispatch and consumed stock cost. It does not create
a GL journal/posting request or infer invoice, ownership-transfer, customs, VAT
deduction or refund events. No approved dispatch-to-GL account/event policy exists
yet. Later accounting integration must define and test that policy explicitly;
PR-02E reports unposted financial differences and blocks close when GL differs.

## Atomicity, SQL guards and retries

All writers acquire the existing common legal-entity lock before authorization,
idempotency claim and stock/period reads. The lock serializes reservation, release,
dispatch, reallocation, reference deactivation and existing close writers within
the entity. Projection updates then take exclusive row locks in deterministic
SKU/layer/pool order until commit. Any future finer-grained protocol must prove
consistent ordering across all these services before replacing this protection.

Dispatch header/consumption lines/event/ledgers/projections, reservation counters,
status, audit and retry result commit in one transaction. Issued counters advance
before projections fall; SQL guards still protect every outstanding reservation.
Audit failure rolls everything back. Ten simultaneous attempts to reserve or
dispatch one remaining quantity produce one successful consumption and no negative
stock. Direct privileged SQL is not an application stock-posting API.

Scoped FKs bind source identities; CHECKs enforce positive action quantities,
nonnegative balances and released + issued ≤ original. Triggers reject edits,
late additions, unsupported source pools, invalid transitions, unmatched counter
changes, mismatched ledger consumption and projection quantities below outstanding
reservations. m009 retains complete evolved m007/m008 verification through the
runner's explicit handoff; failed/interrupted retries remain deliberate operations.

Same idempotency key/content replays the original response. An already-posted
dispatch reference with identical reservation/content also replays with a new
key, even after closure; changed content conflicts. Reservation references remain
unique per entity. Release/cancel with a new key is a new action; clients must
retain the original key when retrying. No source fingerprint deduplicates two
intentionally identical partial releases.

## API and interface

Base: `/api/v1/entities/:entityId/inventory`. Reads require workspace.read,
inventory.read and an assigned entity. All writes additionally require session
CSRF, allowed Origin, JSON and Idempotency-Key. New manage/post permissions are
granted to existing ADMIN roles only within their entity assignments.

| Endpoint | Behavior / permission |
|---|---|
| GET /reservations | Paged headers; optional status and warehouseId |
| POST /reservations | Multi-line reservation; inventory.reservation.manage |
| GET /reservations/:id | Header and status |
| GET /reservations/:id/lines | Requested, reserved, released and issued quantities |
| GET /reservations/:id/allocations | Fixed source allocations and receipt lineage |
| GET /reservations/:id/releases | Immutable release/cancellation history |
| GET /reservation-releases/:id/lines | Exact released allocations |
| POST /reservations/:id/release | Partial release; inventory.reservation.manage |
| POST /reservations/:id/cancel | Cancel remaining quantities; inventory.reservation.manage |
| POST /reservations/:id/issues | Physical dispatch; inventory.issue.post |
| GET /issues, /issues/:id, /issues/:id/lines | Posted dispatches and exact source consumption |

Inventory → Reservations provides a paged multi-SKU editor, status filtering,
quantity selection for partial actions, source allocations and release history.
Dispatches provides read-only cost and source details. Stock balances show on-hand,
reserved and available quantities; ledgers show dispatch references. Actions
respect permissions and state. Read-only inventory users can inspect every view.
Sidebar-only navigation, responsive tables and the absence of page-intro banners
are preserved.

PR-02E is implemented: [trial balance and close](inventory-close.md) reconcile
issue consumption and carry historical reservations using business dates and
recorded UTC release timestamps, separate from stock movement. PR-02F adds
reversals/adjustments and performance budgets on representative synthetic volumes.
The common entity lock and per-allocation counter updates remain explicit scaling
limits; 301-line correctness testing is not a production performance guarantee.

PR-02F is now implemented: see [corrections and release gate](inventory-corrections.md).
It retains exact original receipt/transfer/issue sources and reservation counters,
adds independent count/revaluation/reversal approval and cursor movement reads,
and verifies all inventory stages. Preserve applied m001–m011. PR-03A/03B purchasing and invoice staging are implemented through m013; PR-03C is now implemented in m014; PR-04A is next. See [purchase receipt/accounting](purchase-receipts.md). See [purchasing](purchasing-foundation.md).
