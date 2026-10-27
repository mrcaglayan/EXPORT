# Goods receipts and stock ledgers — PR-02B

Implemented 22 October 2026. m007 adds receipts, source layers, immutable events,
physical/pool ledgers and exact current balance projections. It adds no purchasing,
GL account mapping, VAT computation, reservations, issues or reversals.

## Source boundary

The roadmap permits **synthetic test fixtures only** until PR-03 supplies an
authorized purchase-invoice adapter. The normal local/production application
therefore exposes stock reads, with no receipt creation form or POST route.
`POST /api/v1/entities/:entityId/inventory/receipts` is registered only when
`NODE_ENV=test`, `DB_NAME` matches `export_accounting_test_[a-f0-9]{16}`, and
`PR00_TEST_DATABASE` equals that name. The service independently checks these
conditions. The test harness verifies repository-owned MySQL before creating
that disposable schema. There is no client-supplied source-kind override.

The frozen source kind is TEST_FIXTURE. PR-03 must add a new migration and trusted
purchase adapter, including its authorization and invoice-line identity, before
real receipts can post. Do not populate the local company with fixtures or import
the historical workbook. The read UI explains that purchase entry is forthcoming.

## Receipt identity and exact amounts

A receipt has one physical warehouse, a RECEIPT movement type, document/posting
dates, company base currency, description and scoped unique source ID. Each line
has its own stable source-line key, SKU, description, quantity, unit cost and
explicit positive allocations to existing pools. The same SKU may appear on many
lines; no line aggregation discards source identity. Source ID/key comparisons
are ASCII case-sensitive; line order is meaningful. Pools are sorted by UUID for
canonical retries, so changing only allocation order does not change the source.

All amounts/quantities are decimal strings with at most 14 integer and 6 fractional
digits. Quantity must be positive and respect the SKU base-unit precision; each
pool quantity obeys the same precision and their sum equals the line quantity.
Zero unit cost is valid. No artificial value is assigned to free goods.

Line value = quantity × unit cost, rounded half-up once to six places using the
existing exact decimal library. Header value is the exact sum of line values.
Allocate that rounded value proportionally in integer millionths using largest
remainders, breaking ties by pool UUID. This ensures pool values sum exactly to
physical value, including tiny fractional quantities. Individually rounding each
pool's multiplication would not preserve that invariant. Overflow is rejected
before writing. No exchange rate, statutory tax rounding or VAT policy is inferred.

There is no fixed receipt line-count ceiling. The existing 1 MiB JSON guard and
finite server resources still apply. Reference IDs are validated in batches of
500; SQL inserts use batches of 250 inside one transaction. Reads default to 25
and cap each page at 100, including receipt lines; this is not a document limit.

## Schema and immutable posting

Eight new tables bring the schema to 41. Every relationship retains tenant/entity
scope and references stockable SKUs, not product families.

| Table | Grain and protection |
|---|---|
| stock_receipts | Entity/source-kind/source-ID unique; payload fingerprint; ASSEMBLING → POSTED only, immutable thereafter; separate document/posting dates |
| stock_receipt_lines | Receipt/line number and receipt/source-line-key unique; exact cost CHECK; immutable |
| inventory_layers | One per receipt line; fixed warehouse/SKU/source identity, original quantity/cost/value and received date; immutable |
| inventory_events | One immutable RECEIPT event per receipt |
| inventory_physical_ledger | One immutable event/layer quantity/value entry; composite FK binds warehouse/SKU to layer |
| inventory_pool_ledger | One immutable event/layer/pool entry; scoped pool FK and same layer binding |
| inventory_balances | Current quantity/value per warehouse/SKU/layer; nonnegative CHECK, fixed identity, no deletion |
| inventory_pool_balances | Current quantity/value per warehouse/SKU/layer/pool; references physical projection; nonnegative CHECK, fixed identity, no deletion |

FIFO provenance ordering is `(received_date, created_at, layer_id)` with a scoped
warehouse/SKU/date index. This is a deterministic tie-break for same-time layers;
actual reservation/consumption selection belongs to PR-02D. Each layer retains
source receipt and line identity for later tax attribution.

Service lock order: legal entity → retry/source identity → matching inventory and
accounting period → warehouse → movement type → sorted pools → sorted SKUs/units/
families → inserted layer/ledger rows → projections sorted by warehouse/SKU/layer/
pool. The common entity lock serializes all current writers, including closing and
reference deactivation. New layer identities are unique; their projection INSERTs
acquire exclusive row locks until commit. New receipts do not scan or lock old
warehouse history. Later operations on existing stock must lock the specific
physical and pool projections in the same deterministic grain order.

Both period statuses must be OPEN, with the posting date inside the linked
accounting period. Warehouse, pool, SKU/unit/family and movement type must be
active; the effect must be RECEIPT. Company base currency must already be set.
The transaction creates header/lines/layers/event/ledgers/projections, transitions
the header to POSTED, appends audit and stores the idempotent response together.
Any failure rolls back all these writes, including an audit failure after posting.

Database triggers independently block history UPDATE/DELETE and late additions
to posted receipts. Posting checks line totals, one exact layer per line, matching
physical and pool quantities/values, projections and both open periods. Projection
inserts must match their assembling receipt ledger. Projection balances remain
mutable by future authorized services; direct privileged SQL is not an application
posting API and must not be used to change stock.

Same idempotency key/content returns its original response. The scoped source key
also prevents duplication when clients retry with different keys or users. Changed
source content returns SOURCE_CONFLICT; changed key/content returns
IDEMPOTENCY_CONFLICT. Successful source replay is permitted after period closure
or reference changes. No GL journal or posting request is generated; stock valuation
is not a claim of financial posting or VAT deduction.

Deactivating a warehouse, pool or SKU with nonzero stock quantity/value now fails
with INVENTORY_IN_USE under the same lock. Used movement types retain their active
state while posted history references them. Names remain editable and fixed codes
remain available for historical reads. Existing family/unit guards still apply.

## API and screens

Base: `/api/v1/entities/:entityId/inventory`. All reads require `inventory.read`,
workspace access and entity assignment. The new `inventory.receipt.post` is granted
only to ADMIN and protects fixture posting along with session, CSRF, Origin, JSON
and Idempotency-Key. Inventory audit uses the existing separate audit permission.

| GET path | Result and filters |
|---|---|
| /receipts | Posted headers; literal source/description search, warehouse and paging; newest posting date first |
| /receipts/:id | Immutable posted receipt header |
| /receipts/:id/lines | Paged lines with original pool quantity/value allocations |
| /layers | Original source quantities/costs in FIFO order; warehouse/SKU filters |
| /balances | Current physical projection per layer; warehouse/SKU filters |
| /pool-balances | Current pool projection per layer; warehouse/SKU/pool filters |
| /physical-ledger | Immutable physical entries with source provenance; warehouse/SKU filters |
| /pool-ledger | Immutable pool entries with source provenance; warehouse/SKU/pool filters |

Inventory content tabs expose these views alongside existing setup. Receipt/source
links open a paged line breakdown, SKU links filter stock rows, and warehouse/pool
selectors include inactive history. Exact values keep six decimal places; the UI
does not sum quantities across different units. Shared loading/retry/paging controls,
mobile horizontal tables and keyboard tabs preserve sidebar-only navigation.

Run `test:pr02b` for receipt integration, `test:pr02a` for metadata regression and
`test:pr01` for prior domains, OpenAPI/lint/build and the combined browser flow.
`test:pr02b:browser` runs that browser flow alone. All fixture writes occur only in
disposable schemas. The normal `frontend test:smoke` does no business writes.

## Next boundaries

PR-02C is implemented by m008: approved pool reallocations extend event provenance,
allow signed pool movements and update insert guards/projection creation rules
while retaining receipt checks. The original receipt allocations remain unchanged.
See [controlled borrowing](inventory-reallocations.md) for the current contract.
PR-02D is implemented by m009: [reservations and dispatch](inventory-reservations.md)
add outstanding-stock protection, signed physical/pool consumption and retained
source lineage. Current balances expose reserved and available quantities.
PR-02E implements [closing snapshots and explicit GL comparison](inventory-close.md); PR-02F adds
reversals/adjustments and the comprehensive gate. Preserve applied m001–m010 and
keep baseline/OpenAPI copies synchronized.

PR-02F is now implemented: see [corrections and release gate](inventory-corrections.md).
It retains exact original receipt/transfer/issue sources and reservation counters,
adds independent count/revaluation/reversal approval and cursor movement reads,
and verifies all inventory stages. Preserve applied m001–m011. PR-03A/03B purchasing and invoice staging are implemented through m013; PR-03C is now implemented in m014; PR-04A is next. See [purchase receipt/accounting](purchase-receipts.md). See [purchasing](purchasing-foundation.md).
