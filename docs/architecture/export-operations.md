# PR-04A packing lists, export cards and shipments

Current sequence: PR-04B customs evidence and PR-05A source VAT attribution are
implemented; PR-05B is next. See [the latest handoff](../pr-handoffs/PR-05A.md).
The PR-04A scope and next-stage notes below remain its dated delivery contract.

Implemented 27 October 2026 (Europe/Istanbul), extending the retained purchasing
and inventory contracts through `m015_export_operations`. Applied m001–m014
remain unchanged. Nine new scoped tables bring the baseline to 82 tables.
Exports in the sidebar now supports original packing intake, SKU mapping,
independent review, numbered cards and source-linked partial shipments.

## Intake and original source

A packing list is the products and quantities intended for export, optionally
with package references/counts and net/gross weights. It is separate from an
export sales invoice and customs declaration. One line must describe an
individually stockable SKU quantity before approval; a group such as mixed
clothing must be detailed into its stockable product/size quantities first.

Supported intake is manual original-line entry or UTF-8 comma-separated CSV.
The app provides a CSV header template:

```csv
lineKey,itemCode,description,quantity,unitCode,packageReference,packageCount,netWeightKg,grossWeightKg
```

The first five columns are required; optional columns may be omitted. Column
names are exact and unique. Quoted fields support commas, escaped quotes and
line breaks. Header/row widths must agree. Positive quantities use decimal
strings with at most six fractional places; exponent notation and comma decimals
are rejected. Source line keys are unique within the document. Package counts
are positive integers, weights are nonnegative, and supplied net cannot exceed
supplied gross. Package counts/weights are line evidence, not an automatically
deduplicated document total: two SKU lines may share a package reference.

Preview validates without writing, returning the source hash/count and first
25 rows. Intake retains the entire exact CSV text or submitted manual JSON,
SHA-256, original parsed rows, file/evidence reference and importer. Source text
and rows cannot be edited/deleted. A reference is unique within the company,
including cancelled documents. Identical intake under the same reference
replays; changed source/header details conflict. There is no automatic source-hash
deduplication across distinct packing references, since equal lists can represent
different physical shipments.

The supplied `Zambiya 21.10.2026.xlsx` was inspected read-only. It contains an
aggregate packing summary and several differently structured product, size and
book-detail sheets. Summary totals cannot safely become SKU-level movements or
be combined automatically with detail sheets without double counting. Direct
XLSX intake, cross-sheet selection and reconciliation are deferred to a dedicated
format adapter; the current manual/CSV workflow requires explicit stockable
source lines. The workbook itself is unchanged and none of its real rows were
imported, seeded or copied into tracked fixtures. Original Excel formulas,
external references and embedded objects are never executed by this intake.

## Mapping, independent approval and numbering

Each STAGED list accepts an append-only mapping plan with an expected revision,
customer, warehouse, foreign COUNTRY pool, planned date, reason and per-line
SKU/unit confirmation. Customer billing country and delivery country may differ;
the destination is selected explicitly. Active customer CUSTOMER/BOTH, warehouse,
pool, SKU, family and base unit are required. GENERAL and TR are not export
destinations. Planned date cannot precede the packing document date.

Manual and bulk mapping preserve source wording. Optional catalogue-code matching
fills only missing SKUs whose current catalogue code exactly matches the original
item code using binary comparison. It performs no fuzzy matching, description
inference or supplier-alias substitution. When source and SKU unit codes differ,
the user confirms one source unit means one base unit. Unit conversion is outside
this step. Quantity precision and saved base-unit identity are rechecked.

STAGED → REQUESTED captures a business-context hash. A person independent of
the importer, mapper and submitter approves REQUESTED → APPROVED, creating an
export card in the same transaction. Cards use `EXP-YYYY-000001` numbering per
tenant/legal entity/document year. The counter increments under the common
entity lock, rolls back with failed approval and never reuses cancelled numbers.
All cards, ordered decisions, prior mapping plans and original source remain
retained. No card number is assigned by preview or submission.

An unshipped source can return to STAGED for a new mapping/review cycle. Its
previous card is retained as CANCELLED. Unposted dependent shipments must first
be cancelled/rejected; a dispatched shipment blocks remapping/cancellation of
its source/card. Rejected/cancelled documents never release original identities
for reuse.

Referenced details may change after approval. An independent reviewer can renew
an APPROVED source after rechecking current valid references. This appends the
complete current business context and prior review to decision history while
preserving the originally issued card snapshot. Existing unposted shipments keep
their own immutable plans; a changed context requires cancelling them and
requesting fresh review. Changed or inactive SKU/unit mappings need correction,
not a waived unit/quantity check. The original card is not silently rewritten.

## Partial shipments and country allocation

A shipment selects full or partial quantities from approved card source lines.
Requests, approvals, allocated stock and dispatched quantities all commit those
packing quantities. Remaining quantity subtracts all non-rejected/non-cancelled
shipments. Entity locking and database guards prevent concurrent over-shipment.
Rejected or cancelled shipments release only their own packing commitment.

A request retains dates, source/SKU quantities, reason, evidence and current card
review context. It does not reserve physical stock yet. A different person from
the requester approves the shipment. Approval and later operations rebuild its
exact immutable context; stale references/plans require a fresh request/review.
Reservation cannot precede the source document. Expected dispatch cannot precede
reservation; actual dispatch must be on/after reservation and stock posting must
be on/after actual dispatch. A planned date is a forecast, not a customs date.

Allocation requires both export allocation and inventory reservation permission.
It atomically creates an owned `XPR-<shipment-id>` inventory reservation and
per-line links. The existing allocator chooses destination-country stock first,
then GENERAL, in source FIFO order. Repeated SKU lines consume a shared
availability plan, so one source quantity cannot be counted twice. Other-country
stock requires the existing independently approved transfer; no silent borrowing
is added. Shortage may be previewed or retained as a requested plan, but allocation
stays blocked until sufficient unreserved stock exists.

Reservation changes available stock without moving physical quantity/value.
The source layer, pool, reservation line and original stock receipt remain linked.
Unposted reserved shipment cancellation releases exactly its outstanding reserved
quantities and cancels the shipment in the same transaction. Generic inventory
release/dispatch routes reject export-owned sources; extra database guards protect
their workflow ownership. Other inventory reservations retain their prior API.

## Dispatch and provenance

Dispatch requires both export dispatch and inventory issue permission. RESERVED
shipments dispatch their exact selected quantities once, using the existing FIFO
source allocations and exact residual value calculation. Partial deliveries use
separate partial shipment plans; this adapter does not partially dispatch one
shipment plan. Both inventory and accounting calendars, active references,
reservations, balances and stock-close locks are rechecked.

The existing inventory posting function runs inside the export entity transaction:
issue/header/lines, physical and pool ledgers, balances, reservation consumption,
export status/dispatch evidence, audit and retry record commit together. Failed
allocation/issue/audit writes roll back all earlier work. Concurrent or repeated
successful actions return the retained reservation/issue. Changed dispatch details
conflict with the existing posted source.

The source-read endpoint traces:

```text
packing line → shipment line → reservation line/allocation → country or GENERAL pool
→ inventory layer → stock receipt/source line → purchase invoice/order source
                           ↘ posted inventory issue line after dispatch
```

Purchase invoice and order identifiers are included when the stock came from the
PR-03C real purchase adapter. Free stock remains at genuine zero cost. No purchase
VAT is invented from inventory cost. Source links page at database level and
never require an accounting permission merely to inspect export quantities.

Dispatched export issue reversal is blocked through the generic stock correction
path until a coordinated export reversal/return workflow can preserve shipment
quantities and later customs dependencies. Existing stock counts/revaluations
retain their explicit inventory/GL reconciliation responsibilities. A completed
dispatch creates no export sales/COGS journal, e-document, GÇB clearance, VAT
attribution or refund claim. Those later facts remain separate PR-04B/05/06 work.

## Access, resources and verification

All endpoints use `/api/v1/entities/:entityId/exports`, authenticated tenant/entity
scope, service authorization and scoped foreign keys. Mutations use the common
entity lock, transaction, audit and idempotency path. Origin/JSON/CSRF checks apply
to all POSTs; read-only previews do not create retry records. Readers cannot
import, map, approve, reserve or dispatch through UI or direct service calls.

| Permission | Behavior |
|---|---|
| exports.read | Existing reference, source, card and shipment reads |
| exports.intake | Packing intake and source preview |
| exports.map | Mapping and review submission |
| exports.review | Independent packing approval/renewal/rejection/cancellation |
| exports.shipment.request | Shipment request/cancel; reserved cancellation also needs inventory.reservation.manage |
| exports.shipment.review | Independent shipment approval/rejection |
| exports.shipment.allocate | Reserve reviewed shipment; also inventory.reservation.manage |
| exports.shipment.dispatch | Post reviewed reserved shipment; also inventory.issue.post |
| exports.audit.read | Export audit evidence |

The eight new permissions are assigned explicitly to existing ADMIN roles only.
The existing exports.read contract is retained. No real customers, destinations,
SKUs, stock, packing sources, cards, sequence rows or extra users are seeded.

No fixed business line ceiling: source content budget remains 750,000 UTF-8 bytes,
whole JSON 1 MiB, 250-row SQL batches in one transaction, 25-row mounted editors
and 1–100 row database reads. Preview/source arrays may include a complete plan
within those resource budgets; the UI pages long plans. Tests stage/map/review/
reserve/dispatch 301 independent source lines and exercise purchase-layer lineage.

`npm --prefix backend run test:pr04a` checks the isolated export integration.
`npm --prefix backend run test:pr04a:release` includes all earlier domains,
OpenAPI, frontend lint/build and browser regressions. See the
[handoff](../pr-handoffs/PR-04A.md) for results and local upgrade evidence.
Next is PR-04B export invoice/e-document, broker GTİP review and GÇB lifecycle.
