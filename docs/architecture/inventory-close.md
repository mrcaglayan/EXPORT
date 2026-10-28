# Stock trial balance and controlled close — PR-02E

Implemented 26 October 2026. m010 adds seven tables (57 total), five ADMIN-only
permissions and independent close/reopen workflows. Applied m001–m009 and their
verification contracts remain unchanged. See [PR-02E handoff](../pr-handoffs/PR-02E.md).

## Reports and financial boundary

Inventory → Trial balance & close shows opening, incoming, outgoing and closing
quantity/value, outstanding reservations and available quantity. Reports support
physical or pool grain, grouping by layer, SKU, family, warehouse or pool, scoped
filters, paged source movements and retained close versions. Quantity groups also
include base unit, so unlike units are never added together. Physical value is
the entity stock total; pool value is an allocation of that same stock.

A live report starts from the latest valid approved prior snapshot and applies
later immutable movements through the selected period end. Movements before its
start affect opening; movements inside the period affect incoming/outgoing.
Without a prior snapshot, the ledger supplies opening history. Exact integer
millionths are used in calculations; snapshot totals use DECIMAL(30,6).
Snapshot lines freeze catalogue identities and source provenance. Movement
membership is frozen separately, preventing later backdated corrections from
appearing in an old version. Movement display labels use the current catalogue.

Historical reservations use reservation business dates, issue posting dates and
the recorded UTC timestamp of releases. Releases have no editable business date.
A release after period end does not reduce that period's reserved quantity even
if the reservation is now cancelled. Reservations reduce availability, not stock
value. Their source hash is part of the close content hash. The UTC cutoff is
shown in the API; this is distinct from current availability.

An authorized user explicitly selects active ASSET accounts for reconciliation.
There is no inferred account-code prefix or automatic balancing journal. Posted
debit-minus-credit through period end is compared with physical stock value.
Missing/inactive mappings, a difference, pending financial postings, incomplete
stock events, projection discrepancies or invalid historical stock block close.
This stage requires TRY base currency. Dispatch remains a stock/cost event;
invoice, ownership, customs, deductible VAT and refund policy are separate work.
Mapping changes require both inventory.reconciliation.configure and
accounting.configure, and are blocked while any current/pending close exists.

## Close and reopen

Prepare requires inventory.period.prepare and inventory.reconciliation.read.
Earlier configured inventory periods must have approved current closes. It
captures a numbered immutable snapshot and moves the inventory period to
IN_REVIEW under the common entity lock. Stock posting and mapped-asset journal
posting through that cutoff are locked. Unrelated accounting activity retains
its existing accounting-calendar rules. Adding an earlier stock period while a
later close exists is blocked.

A different user with inventory.period.approve and reconciliation.read approves.
The report is recomputed and its hash must still match. Approval changes the
period to CLOSED; rejection retains the version and returns it to OPEN. The
preparer may reject their own review but cannot approve it. A stale review must
be rejected and prepared again. Accounting periods may be closed independently;
preparing/approving stock close does not itself change their status.

Reopen requires inventory.period.reopen plus accounting.period.close. The request
records the selected period and every later dependent closed period, their
snapshot IDs and accounting status. Resolve later reviews first. A different
user with inventory.period.approve plus accounting.period.close approves this
exact plan. Changed dependencies require rejection and a new request. Approval
atomically opens the affected inventory calendars and any closed linked
accounting calendars, clears their current snapshot pointers and retains all
old versions. Those versions read as SUPERSEDED; reclose creates new versions in
chronological order. One pending reopen request is allowed per entity.

All mutations, audit and retry responses share a transaction and entity lock.
DB triggers enforce immutable snapshots, grain reconciliation, independent
approval, pointer/status transitions and mapped-journal locks. Existing periods
without a workflow control row retain their legacy privileged SQL behavior;
there is no generic API for editing inventory status. No extra local reviewer
account is created; an actual second authorized user is needed for approval.

## Schema, API and permissions

| Table | Purpose |
|---|---|
| inventory_reconciliation_accounts | Explicit scoped asset account set |
| inventory_period_snapshots | Period/version, preceding snapshot, immutable summary/hash and review actors |
| inventory_snapshot_lines | Frozen physical/layer and layer/pool quantities, values, reservations and identities |
| inventory_snapshot_events | Frozen in-period event membership |
| inventory_period_controls | Current or pending snapshot pointer per period |
| inventory_period_reopens | Request/review actors, reasons and terminal decision |
| inventory_reopen_periods | Immutable affected periods, snapshot IDs and accounting state |

All routes are under `/api/v1/entities/:entityId/inventory`. GET trial-balance,
trial-balance/movements, periods/:id/close-status, periods/:id/snapshots and
snapshots/:id require inventory.read; financial summaries and GL blockers are
redacted there. GET reconciliation and reconciliation-accounts require
inventory.reconciliation.read. POST reconciliation-accounts, periods/:id/prepare-close,
snapshots/:id/approve or reject, periods/:id/reopens and reopens/:id/approve or
reject apply the permissions above. Reopen headers/plans have scoped paged
reads. Writes require session, Origin/JSON, CSRF and Idempotency-Key. Audit remains
under inventory.audit.read. See OpenAPI for exact request/response contracts.

## Capacity and next work

Lists default to 25 and cap at 100 per page; snapshot inserts batch at 250. These
are transport/batch sizes, not document-line ceilings. Closed reports read their
snapshot. Live balance calculations use a prior close, but projection validation,
reservation history and cumulative GL reconciliation still inspect historical
data; PR-02F now groups/pages closed reports in MySQL and aggregates projection checks.
Live balances still load source rows into memory. The entity write lock and larger
workloads remain scaling limits beyond the PR-02F synthetic benchmark. A 301-layer
integration case exercises correctness, not a production latency guarantee.

PR-02F implements [reversals, adjustments/revaluation and the inventory
release/performance gate](inventory-corrections.md), including value-only movements
and exact event lineage while preserving old snapshots. PR-03A/03B purchasing and invoice staging are implemented through m013; PR-03C is now implemented in m014; PR-04A is implemented in m015; PR-04B is next. See [export operations](export-operations.md). See [purchase receipt/accounting](purchase-receipts.md). See [purchasing](purchasing-foundation.md).
Receipt entry stays fixture-only until authorized purchasing integration in PR-03.
