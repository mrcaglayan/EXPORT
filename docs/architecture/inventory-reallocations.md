# Country allocation and controlled borrowing — PR-02C

Implemented 23 October 2026. m008 adds two tables (43 total) and extends receipt
events, signed pool entries and target projection creation. Original m001–m007
files and checksums remain unchanged. Receipts still use disposable fixtures only;
the normal company cannot create stock until PR-03 supplies a purchase adapter.

## Selection and review

The allocation preview uses eligible destination-country stock first, then active
GENERAL stock, and returns the remaining shortfall. It never silently selects
another country's stock. This is an advisory preview of current stock, not a
reservation or historical balance. A transfer request explicitly names its source
pool, destination COUNTRY pool, warehouse, SKU, quantity, posting date, active
REALLOCATION movement type, unique reference and reason. GENERAL or another
country can supply the transfer; destination and source must differ.

Requests fix FIFO source layers and quantities using received date, creation time
and layer UUID. They do not reserve stock. A competing execution can make an
approved request unavailable; it then fails atomically and stays APPROVED. The
requester can cancel it and create a replacement. Execution never silently changes
the approved layers, quantity or donor. PR-02D now subtracts outstanding reservations from planning and execution.

States: internal DRAFT → REQUESTED → APPROVED or REJECTED. The requester alone can
cancel REQUESTED/APPROVED requests. APPROVED → internal EXECUTING → EXECUTED occurs
in one transaction. No DRAFT/EXECUTING state survives a successful API call.
Header/plan identity and terminal history cannot be edited or deleted. Review and
cancellation require reasons. A COUNTRY source requires a reviewer different from
the requester for both approval and rejection, even when the requester is ADMIN.
A GENERAL source allows the same user to review if they hold review permission.
Execution can be performed by the requester after the required approval.

## Amounts, periods and locking

Amounts are exact decimal strings, with six fractional places in stored stock.
Quantities must respect the SKU's base-unit precision. Both inventory and
accounting calendars must be OPEN at creation, approval and execution. References
must remain active. Rejection and cancellation remain possible after closure.
Layers received after the posting date, or with any later-dated pool movement,
are ineligible: current projections cannot establish historical availability.
The plan is checked again at execution. This deliberately conservative date rule
also prevents a later event on another pool of that layer from being ignored.

All writes first lock the legal entity, then authorize again and claim the
idempotency record before reading references, periods, requests or projections.
That shared lock serializes every current stock/configuration/close writer for
the entity. Execution reads the fixed layers in line order; target row creation
and source/target projection UPDATEs acquire exclusive InnoDB locks until commit.
No narrower-lock concurrency is claimed. Future writers must preserve this lock
protocol or replace it with a proven common lock ordering across all services.

For each line, transferred value = remaining source-pool value × transferred
quantity / remaining source-pool quantity, rounded half-up in integer millionths.
Full depletion transfers the entire residual carrying value. This handles tiny
receipt-allocation remainders and free stock without creating or losing value.
Review approves layer quantities; line values are assigned once during execution.

Each event posts exactly two entries per approved layer: source −quantity/−value
and target +quantity/+value, within the same warehouse/SKU/layer. Neither physical
ledger/balance nor accounting journal/posting-request tables change. Both pool
projections must reconcile to their ledger before the header becomes EXECUTED.
Scoped FKs, unique event/layer/pool keys, signed amount CHECKs, nonnegative balance
CHECKs and lifecycle/immutability triggers independently guard posting structure.
Direct privileged projection updates are not an application stock-posting API.

Header/lines/event/entries/projections, audit and retry result commit together.
Audit failure rolls everything back. Same key/payload replays the original result;
changed content conflicts. References are unique per entity and case-sensitive.
An already-executed request with a new retry key returns its existing result
without another stock event. Approval/cancellation with a new key after the state
changed returns INVALID_STATE. Pending requests prevent reference deactivation;
executed movement types also remain in use.

## API and UI

Base: `/api/v1/entities/:entityId/inventory`. Reads require workspace and
inventory.read in an assigned entity. Writes also require session CSRF, allowed
Origin, JSON and Idempotency-Key. New permissions are granted to ADMIN only within
existing entity assignments; no local reviewer user is created automatically.

| Endpoint | Purpose / permission |
|---|---|
| GET /allocation-preview | Destination/GENERAL quantities and shortfall; warehouseId, skuId, toPoolId, quantity, postingDate |
| GET /skus and /skus/:id | Inventory-scoped SKU choices without products.read |
| GET /reallocations | Paged request history, optional status |
| GET /reallocations/:id | Request and retained review/execution metadata |
| GET /reallocations/:id/lines | Paged fixed layer plan and executed value |
| POST /reallocations | inventory.reallocation.request |
| POST /reallocations/:id/approve or /reject | inventory.reallocation.review; independent for COUNTRY |
| POST /reallocations/:id/cancel | inventory.reallocation.request; requester only |
| POST /reallocations/:id/execute | inventory.reallocation.execute |

Pages default to 25 and cap at 100 records; there is no request layer-count ceiling.
Planning inserts batches of 250; all execution lines share one transaction.
Existing 1 MiB request guard and finite database/server capacity still apply.
Ledger reads expose event kind, event posting date and reallocation reference
alongside receipt provenance. Receipt details retain their original allocation.

Inventory → Allocation & borrowing has a planner, status filter, request form,
fixed-layer detail and permission/state-aware review, cancellation and execution.
Read-only users can preview and inspect history. Company switching clears this
screen through the existing scoped workspace boundary. Tables scroll on mobile;
no global top bar, header or page-introduction banner was introduced.

## Forward schema verification and next stage

m008 explicitly replaces m007 verification and verifies the entire evolved
receipt schema, all retained/replaced triggers, the new tables and permissions.
The runner validates replacement references and honors them only once applied or
during an explicit retry of a failed/interrupted successor. A pending successor
does not suppress the original verifier. Checksums, order, named migration lock
and recovery gates remain mandatory. See [migration recovery](migrations.md).

PR-02D is implemented by m009: [reservations and dispatch](inventory-reservations.md)
subtract outstanding reservations from preview and transfer execution, retain exact
source allocations and extend event/physical-ledger guards. m009 verifies the full
evolved m007/m008 schema; applied migration sources remain unchanged.
Do not repurpose an approved reallocation request as a reservation. PR-02E implements
[period close/snapshots](inventory-close.md); PR-02F adds reversals/adjustments and the final release gate.

PR-02F is now implemented: see [corrections and release gate](inventory-corrections.md).
It retains exact original receipt/transfer/issue sources and reservation counters,
adds independent count/revaluation/reversal approval and cursor movement reads,
and verifies all inventory stages. Preserve applied m001–m011. PR-03A is next.
