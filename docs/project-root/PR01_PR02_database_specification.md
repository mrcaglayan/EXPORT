# PR-01 / PR-02 design baseline — version 17

Created **21 October 2026 (Europe/Istanbul)** with the user's explicit instruction
to write a new baseline and proceed with PR-01A. This is a new design derived
from the implementation roadmap and existing PR-00 application. The originally
referenced documents were not supplied or recovered. This document does not
claim that future inventory features have been implemented.

The tracked files in `docs/design/` are authoritative. Matching copies in
`docs/project-root/` beside the roadmap allow its original filenames to resolve. Update both copies
when revising this baseline. The companion SQL contains implemented PR-01A/PR-01B/PR-02A/PR-02B/PR-02C/PR-02D/PR-02E/PR-02F/PR-03A/PR-03B/PR-03C/PR-04A/PR-04B/PR-05A/PR-05B/PR-06A definitions
and clearly marked future contracts. Runtime schema changes use registered,
forward-only JavaScript migrations; do not execute the reference SQL against
an existing database.

Revised **28 October 2026** for PR-06A deduction/KDV1/refund review. PR-01/02, PR-03A/03B/03C, PR-04A/04B, PR-05A/05B and PR-06A are complete; PR-06B claim packages and settlement tracking are next.

## Scope and shared contracts

- PR-01A implements units, hierarchical product families and individual SKUs.
- PR-01B implements specifications, GTİP history, supplier references, versioned aliases and review states.
- PR-01C completes the product UX and product release gate.
- PR-02A–02F progressively implement physical stock, virtual allocations,
  reservations, immutable movements, reconciled closing and corrections.
- Existing m001/m002/m003 and existing accounting records remain unchanged.
  PR-01A introduces `m004_product_foundation`; PR-01B introduces
  `m005_product_classification`. PR-02A adds `m006_inventory_foundation`.
  PR-02B adds `m007_inventory_receipts`; PR-02C adds `m008_inventory_reallocations`. PR-02D adds `m009_inventory_reservations_issues`. PR-02E adds `m010_inventory_period_close`. PR-02F adds `m011_inventory_corrections`. Later features get new migrations; applied m001–m011 remain unchanged.
- UUID IDs use `CHAR(36)`. Every domain table carries `tenant_id` and
  `legal_entity_id`. Scoped unique keys and composite foreign keys prevent a
  relationship to another tenant/entity, even when a caller knows its UUID.
- InnoDB, utf8mb4, `utf8mb4_0900_ai_ci`. Codes normalize to uppercase ASCII,
  1–40 characters, letters/digits/underscore/hyphen, beginning with a letter or
  digit. Codes are unique within each entity and resource, including inactive
  records. Names allow Turkish and other Unicode text.
- Financial values and future quantities use exact decimal strings and
  `DECIMAL(20,6)`. Do not compute financial totals using binary floating point.
- Mutations share the existing entity lock, permission recheck, transaction,
  idempotency and append-only audit machinery. Lock the entity before consistent
  reads. This deliberately serializes writes per entity in this foundation.
- APIs use `/api/v1/entities/:entityId/<module>`. Authentication supplies tenant
  identity. Every operation checks assignment and permission in the service.
  Writes require allowed Origin, JSON, signed session-bound CSRF and an
  `Idempotency-Key`. No entity-wide authorization is inferred from the UI.

## PR-01A physical schema (implemented)

| Table | Important columns | Keys and meaning |
|---|---|---|
| `unit_of_measure` | id, scope, code, name, symbol, quantity_precision, active | Scoped code and ID keys; entity FK; precision CHECK 0–6 |
| `product_families` | id, scope, code, name, parent_id nullable, active | Scoped code and ID keys; entity FK and scoped self FK |
| `product_skus` | id, scope, code, name, description, family_id, base_unit_id, active | Scoped code and ID keys; entity, family and unit FKs |

Names are at most 160 characters, symbols 16, SKU descriptions 1,000. All records
are created active. No sample products or units are inserted into the local
company. Tests create only synthetic fixtures in disposable schemas.

Families classify goods; only SKUs can own future physical stock movements.
`ZARF` can group `ZARF-A4` and `ZARF-A3`. The latter remain independent stock
identities even if a later GTİP classification is shared. No family-level stock
movement endpoint or quantity field exists in PR-01A.

Codes, SKU base units and unit precision are immutable through the API.
Changing these later would require an explicit conversion/migration policy.
Names, descriptions, family membership, parent family, unit symbol and active
status can be edited as applicable. PATCH requires the editable record fields
(not an arbitrary sparse patch); immutable fields are rejected.

An active SKU requires an active family and unit. An active family requires
active ancestors. Reparenting checks the ancestor chain for self/descendant
cycles while holding the entity lock. A unit/family cannot be deactivated while
an active SKU references it; a family also cannot be deactivated while it has
active child families. Inactive references and history remain available.
There is no destructive DELETE API. Composite FKs also prevent deleting a
referenced record directly in SQL. Later inventory FKs must retain this rule.

PR-01A uses one base UOM per SKU. A unit's precision declares allowable decimal
places for later quantity validation; it does not itself implement inventory.
Conversion factors and separate translated-name fields are deferred until a
concrete requirement exists. No implicit box-to-piece conversion is inferred.

## PR-01A API and UI

| Resource under `/api/v1/entities/:entityId/products` | Operations |
|---|---|
| `/units`, `/families`, `/skus` | GET list; POST create |
| `/units/:id`, `/families/:id`, `/skus/:id` | GET record; PATCH editable fields |
| `/audit-events` | GET product-only audit events |

Reads require `products.read`; mutations require `products.manage`; audit reads
require `products.audit.read`. All also require `workspace.read`. m004 explicitly
grants the two new permissions to existing ADMIN roles within their assigned
entities. Read-only roles receive no additional grants automatically.

Lists accept `offset` (default 0), `limit` (default 25, max 100), `q` (literal
code/name substring, max 160), `active` (`true`/`false`), and for SKUs `familyId`.
Audit accepts pagination only. Results have `{items,total,limit,offset,requestId}`;
record responses have `{item,requestId}`. Reads and writes always retain scope.
Names and relationships are shown in the catalogue; selectors have independent
search and paging. Inactive records remain searchable and can be reactivated
when their dependencies allow it.

Errors use the shared structured envelope. Validation is 400; scope/permission
403; inaccessible record 404; duplicate code, idempotency conflict, cycle,
inactive dependency and record-in-use conditions are 409. Duplicate codes are
reported from scoped unique indexes. Product writes, audit details (before/after)
and the stored retry response commit together. Audit failure rolls everything
back. A repeat key/content returns its original response without another write.

The Products content panel contains SKUs, Product families, Units of measure and
permission-controlled Audit trail tabs. Global navigation remains sidebar-only,
with no top bar or separate page-introduction banner.

## PR-01B physical schema and contracts (implemented)

The executable migration is m005. See `docs/architecture/product-classification.md` in the repository for routes,
validation, permissions and operational examples.

| Table | Grain / constraints |
|---|---|
| product_suppliers | Entity/code unique minimal catalogue supplier reference; active flag; purchasing must extend/link this identity explicitly |
| product_attribute_definitions | Entity/code unique; TEXT/DECIMAL/BOOLEAN, unit label and stock-identity flag fixed at creation; name/active editable |
| product_sku_attributes | Scoped SKU/definition unique; typed JSON value; stock-defining value fixed after first assignment, descriptive updates audited |
| product_gtip_history | Scoped SKU/code/inclusive effective window/source; review state, broker evidence and actors; overlapping pending/reviewed/verified windows rejected under entity lock |
| product_alias_sources | Scoped supplier plus hash of exact original code/description; original wording/whitespace retained |
| product_aliases | Scoped source/revision unique; fixed candidate SKU and source reference; nullable current_source_id plus unique key/CHECK permits only one pending/reviewed/verified revision |

Six new tables bring the schema to 29 tables. The supplier reference and original
source tables make supplier identity and preserved alias revisions explicit;
they do not implement purchasing or payable balances.

GTİP uses exactly 12 numeric characters, with leading zeroes retained. Format
validation does not determine classification correctness. Different SKUs may
share a code. Each history entry is PENDING → REVIEWED → VERIFIED, or can be
REJECTED before verification. VERIFIED entries can be RETIRED. An authorized
reviewer supplies a reason for each transition. GTİP verification additionally
records broker name, verification reference and date; logged-in reviewer identity
and time are recorded separately. The app does not authenticate external brokers.
The same authorized admin may propose/review; separate-person approval is not
claimed in PR-01B.

Dates include both endpoints; no end means open-ended. A verified range may be
shortened with a reason before adding a successor starting the following day.
This retains historical applicability. Retirement withdraws an entry for all
dates but preserves its history; it is not ordinary expiration. Code/source/start
dates are not edited in place. Rejected/retired proposals can be replaced with
new IDs. Date lookup uses only verified records for an active SKU.

Aliases use the same review transitions. Only an exact supplier + original code
+ original description match to a current VERIFIED revision and active SKU can
be reused automatically. Similarity, GTİP, VAT or destination never implies a
match or SKU merge. After rejection/retirement, a new revision can propose a
different SKU while retaining prior candidates and review evidence. Raw source
strings are never trimmed or normalized by alias identity. Hash matches are
also checked against the retained strings.

All operations reuse scope checks, the entity lock, transaction, idempotency and
append-only product audit. New products.review permission is separate from
products.manage and products.read. Existing ADMIN grants remain entity-scoped;
other roles are not elevated. No legacy data or real classification codes are
seeded. Details are now available on each SKU; product audit stays isolated
from accounting audit access.

## PR-01C product UX and release gate (implemented)

Product tabs, catalogue/alias filters, paging and SKU details use persistent URL
state. Family and alias rows drill into SKUs; reload/Back preserve the view and
Refresh reads current detail. Alias supplier/SKU filters include inactive
references. Shared forms, load/retry states and paging recovery improve the
existing screens. Duplicate warnings are advisory; scoped server uniqueness is
authoritative. Whitespace-only required fields, code/decimal formats and GTİP
date order are checked before submission without altering original supplier text.

`npm --prefix backend run test:pr01` combines OpenAPI, frontend lint/build,
journal editor regressions, foundation/auth/accounting/product/classification
integration and the browser workflow, including focused UX and permission checks.
It uses disposable test schemas only. No new migration, endpoint, stock quantity
or legacy import is added. See `docs/architecture/product-ux.md` for the contract.

## PR-02A inventory metadata (implemented)

m006 adds four empty domain tables, bringing the schema to 33. It grants
`inventory.configure` and `inventory.audit.read` to existing ADMIN roles only;
the existing `inventory.read` remains the read boundary.

| Table | Columns and constraints |
|---|---|
| warehouses | Scoped id/code, name, location, active; owning entity FK |
| inventory_pools | Scoped id/code, name, GENERAL/COUNTRY kind, nullable ISO country code, active; code is GENERAL or country; at most one GENERAL and one pool per country/entity, including inactive rows; SQL CHECK validates assigned countries and kind/code consistency |
| inventory_periods | Scoped id, accounting_period_id, OPEN/IN_REVIEW/CLOSED status; scoped FK and unique accounting-period link; dates/code read from accounting calendar |
| inventory_movement_types | Scoped id/code, name, fixed RECEIPT/ISSUE/REALLOCATION/ADJUSTMENT_IN/ADJUSTMENT_OUT/REVALUATION effect, active |

Pools are entity-wide allocation definitions. A future stock row references
warehouse AND pool; AF, CM and GENERAL share the same physical warehouse rather
than creating extra warehouse or GL identities. Only user-created metadata is
stored; there are no seeded company warehouses, pools, movements or quantities.

Inventory period creation requires an open accounting period and uses its dates
without duplication. Inventory status starts OPEN. Accounting status is shown
separately, and later stock posting must check both calendars under transaction
locks. PR-02E now implements inventory closure/reopening/approval; the original
PR-02A metadata endpoints do not execute those workflows. Movement effects
classify behavior but cannot execute it.

Reads/writes are under `/api/v1/entities/:entityId/inventory`, including paged
warehouses, pools, periods, movement-types, inventory-only audit and scoped calendar
choices, plus a fixed country reference. Codes, pool identity, period links and
movement effects cannot be changed through the API. Name/location/active updates
are audited and idempotent. No DELETE route exists. See
`docs/architecture/inventory-foundation.md` for the exact contracts and country
snapshot maintenance policy. PR-02B adds active/in-use stock guards; PR-02D adds reservation guards.

## PR-02B receipts and stock ledgers (implemented)

m007 adds eight tables, bringing the schema to 41. The new inventory.receipt.post
permission is granted only to ADMIN. Stock reads use inventory.read; audit retains
its separate permission. All APIs retain entity scope and the shared write guards.

| Table | Grain and invariants |
|---|---|
| stock_receipts | Scoped unique source-kind/source-ID; fingerprint, dates, warehouse, period, movement, base currency, total; ASSEMBLING → POSTED only |
| stock_receipt_lines | Receipt/source-line key and line number unique; SKU, quantity, cost, description and exact rounded value; immutable |
| inventory_layers | One immutable source layer per receipt line; warehouse/SKU, original quantity/cost/value, receipt date and stable FIFO order |
| inventory_events | One immutable RECEIPT event per receipt |
| inventory_physical_ledger | Immutable event/layer entry with composite layer/warehouse/SKU FK |
| inventory_pool_ledger | Immutable event/layer/pool entry; scoped pool/layer identity |
| inventory_balances | Nonnegative current physical quantity/value per warehouse/SKU/layer |
| inventory_pool_balances | Nonnegative current allocation per warehouse/SKU/layer/pool, linked to the physical projection |

Posting is fixture-only in disposable test schemas until PR-03 adds authorized
purchase sources. The normal app exposes paged receipt/layer/ledger/balance reads
and source drill-down. No real stock, purchase invoice, GL or VAT is seeded.

Each line retains a distinct source identity, including repeated SKUs. Positive
quantities respect base-unit precision; unit cost may be zero. Exact decimal line
value rounds half-up to six places. Largest-remainder allocation of that rounded
value ensures pool totals equal physical quantity/value. No fixed line-count cap;
1 MiB payload guard, batched references/inserts and paged reads remain bounded.

Entity → period/reference → deterministic layer/projection row locks protect
posting, closing and deactivation. Both inventory/accounting periods must be open;
references active and movement effect RECEIPT. Scoped source uniqueness and retry
fingerprints prevent duplicate posting. Header/lines/layers/ledgers/projections,
audit and retry response commit together; database triggers verify conservation
at posting and reject history edits, deletion and late additions. Warehouses,
pools and SKUs with stock cannot be deactivated; posted movement references are
also guarded. No GL-posted or VAT-deducted state is implied.

FIFO source ordering is received date, creation time and layer UUID; PR-02D now
uses that order for fixed reservation allocations and their consumption. PR-02C extends receipt-only event provenance and
positive pool-movement constraints in m008 for approved equal/opposite movements. See docs/architecture/inventory-receipts.md for
the exact API, rounding, locking, fixture boundary and future migration contracts.

## PR-02C controlled borrowing (implemented)

Two new tables, inventory_reallocations and inventory_reallocation_lines, retain
request/review/cancellation/execution history and fixed FIFO source-layer quantities.
m008 extends inventory_events with exactly one RECEIPT or REALLOCATION source and
allows signed pool entries with matching value signs. Receipt physical entries
remain positive. A target pool projection may start at zero only for a matching
executing request; existing immutability and reconciliation checks are retained.

Preview priority is destination COUNTRY, then GENERAL, then explicit shortfall.
A COUNTRY donor requires an independent authorized reviewer; GENERAL allows the
same authorized reviewer. Pending requests do not reserve stock. Execution
rechecks the approved layers, active references and both open periods under the
entity lock. Backdated stock spending before the layer's latest movement is
rejected. Equal/opposite pool entries conserve physical quantity and value and
create no GL entries. Exact remaining carrying value is split proportionally;
full depletion moves residual rounding value. Audit and retry records are atomic.
Original receipt allocation reads remain tied to their receipt event.

m008 verifies the entire evolved receipt schema via an explicit runner handoff;
old migration checksums/history are preserved. See
[the allocation contract](../architecture/inventory-reallocations.md).

## PR-02D reservations and dispatch (implemented)

Seven tables retain reservation headers/document lines/fixed source allocations,
release headers/lines and issue headers/consumption lines. m009 brings the schema
to 50 tables and verifies the full evolved receipt/reallocation schema. It extends
immutable events with exactly one ISSUE source, signed physical entries and
projection guards against spending reserved stock. Both original migration sources
and history remain unchanged.

Reservation priority is destination COUNTRY then GENERAL, FIFO within each pool.
Repeated SKUs remain separate document lines; stock is shared across planning so
a quantity cannot be reserved twice. Available equals on-hand minus outstanding
allocations, including for previews and transfers. Partial release takes later
allocations first; cancellation frees only the unissued remainder. Dispatch
consumes exact retained allocations, proportionate remaining carrying value and
full residual value on depletion. Free stock remains zero cost. On-hand changes
only on dispatch, with matching physical and pool quantities/values.

Both posting calendars, active references and conservative movement-date checks
apply under the common entity lock. Partial release/cancel can occur after closure.
All source lines, counters, ledgers/projections, audit and replay results are atomic.
No document-line cap; batched inserts, paged reads/editor and 1 MiB JSON guard.
Inventory includes reservation actions, dispatch source details and reserved/
available balances. ADMIN-only manage/post permissions preserve reader access.

No GL journal or posting request is generated: no approved dispatch accounting
event/account policy exists yet. Invoice, dispatch, ownership transfer, customs
and VAT effects remain distinct. PR-02E exposes unposted GL differences and
carries historical outstanding reservations across periods. See
[the reservation contract](../architecture/inventory-reservations.md).

## PR-02E reports and controlled close (implemented)

m010 adds seven tables (57 total): explicit reconciliation accounts, versioned
snapshot headers/lines/event membership, period controls, reopen requests and
retained dependent-period plans. Scoped FKs and immutable lifecycle triggers
protect source identity and independent approval. Snapshot totals use DECIMAL(30,6).

Reports start from the prior valid approved close plus later movements. Physical
and pool quantities/values reconcile; reservations carry across month-end using
business dates and recorded UTC release times. Versions freeze identities and
event membership. Explicit active ASSET mappings compare posted GL with stock;
missing mappings/differences block close. No accounting or VAT event is inferred.

Prepare locks inventory and mapped GL postings through its cutoff. A different
authorized user approves the unchanged report. Approved reopen invalidates all
later dependent closes and opens their linked closed accounting calendars while
retaining superseded versions. Reclose proceeds chronologically with new versions.
Financial detail has a separate permission boundary from inventory reads.

See [the close contract](../architecture/inventory-close.md) for exact permissions,
UTC reservation cutoff, calendar coordination, schema/API and performance limits.
Stock source entry remains fixture-only. PR-02F adds value-only adjustments
and reversal lineage to these calculations without changing old snapshots.

## PR-02F stock corrections and release gate (implemented)

m011 adds inventory_corrections and inventory_correction_lines (59 total), reviewed
COUNT/REVALUATION/REVERSAL plans and exact original-event links. Event dates are
derived from retained source dates and indexed; no historical source date changes.
Physical/pool ledgers now support value-only deltas, while projections reject
negative stock/value and value without quantity. The complete evolved m007–m009
schema is verified by m011; m010 retains close verification and immutable versions.

Counts value variance from remaining carrying cost, or original unit cost on an
empty source. Revaluation requires positive quantity. Exact reversals retain every
source entry and original cost, once per event; reversal of a reversal is blocked.
Returned dispatch stock is unreserved; original reservation/issue history remains.
A different reviewer approves; posting rechecks source fingerprints, outstanding
reservations, dates and both calendars under the entity lock. No automatic GL or
VAT event is inferred. Audit and idempotency remain atomic with stock changes.

Movement history uses scoped cursor pagination. Closed reports aggregate/page in
MySQL, and live projection checks use grouped ledger totals. The combined test:pr02
gate includes fresh/upgrade migrations, concurrency, domain regressions, browsers
and a synthetic 1,001-layer/10,002-entry performance gate. Read the [correction
contract](../architecture/inventory-corrections.md) for budgets and remaining limits.

## Shared inventory invariants and future extensions

Use scoped FKs to **product_skus**, never product families, for movements,
layers, balances and reservations. Warehouse pools share a physical warehouse.
Maintain physical quantity = sum of pool quantities per warehouse/SKU/layer;
reserved quantity cannot exceed on-hand and available cannot be negative.
Carry source-layer identity through allocations, reservations and dispatch for
later VAT provenance. Pool-only reallocations have no physical or GL effect.

Each posting takes the common entity lock, validates the inventory period, then
locks affected balance rows in a documented deterministic order. Safely create
missing projection rows under scoped unique keys before locking. Recheck
availability inside the same transaction. Event lines, projections, audit,
idempotency and any required accounting request commit together. Do not report
GL-posted until its posting request links to a POSTED journal.

PR-01/PR-02 DDL is implemented through m011, with purchasing in m012 and invoice staging/matching in m013 and purchase receipts in m014 and export operations in m015 and outgoing/customs evidence in m016. PR-05A onward
must extend these contracts through tested forward migrations while preserving
old source and close history. PR-03C now implements real receipt/GL/VAT integration; preserve applied m001–m014.

## Journals and later purchase invoices

The journal has no fixed business line-count ceiling; minimum two lines and
exact balance remain mandatory. Request size remains 1 MiB and infrastructure
resources remain finite. The editor mounts 25 rows per page while totals cover
all rows; account validation batches at 500 unique IDs and inserts at 250 lines,
inside one atomic transaction. Local tests exercise 300 and 1,000 lines and six
concurrent submissions by two users. These measurements are not a deployment SLA.

PR-03 invoices must support many different SKUs and VAT treatments. Each source
line retains SKU, quantity, UOM, unit price, net, VAT treatment/amount and stable
line identity. Preserve links from invoice/stock lines to any aggregated journal
lines. Manual GL descriptions do not replace invoice items. No statutory tax
policy or automatic VAT computation is added by this baseline.

## Verification and changes

PR-01A gates: migration from zero and from m003; rerun/checksum preservation;
scoped uniqueness and composite FK rejection; permissions and CSRF; retries and
duplicate races; hierarchy cycles including concurrent edits; deactivation and
immutable identity rules; audit rollback; filter/pagination and browser workflows.
Future PRs must extend this baseline and SQL reference alongside their migration,
OpenAPI, tests and handoff. Applied migration sources remain immutable.

## Implemented PR-03A purchasing extension

Version 10 extends this originally PR-01/02-named baseline with m012. Four new
scoped tables (63 total): trading_partners, purchasing_documents,
purchase_request_lines and purchase_order_lines. See
[the purchasing contract](../architecture/purchasing-foundation.md) for complete
workflow, permissions, date/quantity/price rules and API. The final-state SQL below
remains reference-only and includes the new tables/triggers.

Partners link existing catalogue supplier identities or create a new one atomically.
Contracts/requests/orders retain EBYS, partner/SKU snapshots, source-line keys and
independent decisions. Pending/approved order quantities cannot exceed an approved
request line. Reject/cancel releases commitments. Submitted lines, review evidence
and snapshots are immutable; supplier communications and financial postings are
not created by this stage. No fixed document line ceiling; 301-line integration
coverage, 1 MiB guard, batched writes and paged UI/API.

## Implemented PR-03B incoming supplier invoice extension

Version 11 adds m013's six scoped tables (69 total): purchase_invoice_settings,
purchase_invoices, purchase_invoice_lines, purchase_invoice_plans,
purchase_invoice_mappings and purchase_invoice_decisions. See
[invoice staging](../architecture/purchase-invoice-staging.md) for the limited
UBLTR-STAGING-1 contract, supported precision, exceptions and decision workflow.

Original XML, UUID, source hash and every line/tree are immutable. Price source
strings allow 18 fractional places without truncation; matching blocks meaningful
precision beyond six. Amounts and base-unit quantities retain DECIMAL(20,6).
Mapping revisions and ordered review decisions remain append-only. Approved
matching quantities are protected against concurrent over-ordering; authorized
return-to-mapping retains prior decisions and releases matching commitments.
No actual examples are imported and no inventory/GL/VAT event is posted here.

## Implemented PR-03C receipt/accounting extension

Version 12 extends the baseline with m014 and four scoped tables: purchase_posting_settings,
purchase_invoice_resolutions, purchase_receipts and purchase_receipt_lines (73 total).
Stock receipts gain the guarded PURCHASE_INVOICE source. Exact invoice stock value
is authoritative independently of rounded informational unit cost; fixtures retain
multiplication guards and layers must exactly match their source. Existing source
rows, m001–m013 history and close snapshots remain unchanged.

The [receipt contract](../architecture/purchase-receipts.md) defines explicit
account mappings, line VAT choice/basis, foreign-currency conversion evidence,
commercial discount/price review, complete physical receipts, independent approval,
atomic stock/journal/audit posting, idempotency and source-line lineage. Public
manual journals cannot use the reserved purchase source. Posted invoice approval
and its one-time receipt lineage remain retained; stock-only purchase reversals
are blocked until a coordinated financial reversal is implemented. No real data
is seeded. PR-04A now extends this baseline with export cards/intake/shipments in m015.

## Implemented PR-04A export operations

Version 13 adds m015 and nine new scoped tables: export_packing_lists,
export_packing_lines, export_packing_plans, export_packing_mappings,
export_packing_decisions, export_card_sequences, export_cards, export_shipments
and export_shipment_lines (82 total). Existing m001–m014 sources stay frozen.
Original source/hash, mapping and ordered independent decisions remain immutable.
Annual company export-card numbering is assigned only at independent approval;
voided numbers remain retained. Partial shipments guard remaining packing
quantities, then reserve existing destination/GENERAL FIFO source stock and
atomically dispatch its exact quantities/cost. Linked inventory reservations
and issues cannot bypass the export workflow. Per-line provenance reaches the
original purchase receipt/invoice/order sources where available. No customs,
sales/COGS journal, VAT/refund eligibility or historical source is inferred.

See [the export contract](../architecture/export-operations.md) for intake fields,
permissions, review renewal, stock source boundaries and tests. Current intake
supports manual lines and UTF-8 CSV; the supplied multi-sheet XLSX remains a
read-only format reference pending an explicit sheet/summary reconciliation adapter.
PR-04B now extends export invoice/e-documents, broker review and GÇB lifecycle in m016. See the implemented extension below.

## Implemented PR-04B outgoing/customs extension

m016 adds eight scoped tables (90 total):

| Table | Purpose |
|---|---|
| `export_document_settings` | Explicit exporter identity |
| `export_sales_invoices` | Immutable externally issued XML and matching workflow |
| `export_sales_invoice_lines` | Original invoice quantities/net/actual VAT |
| `export_sales_plans` | Retained complete mapping revisions and transaction type |
| `export_sales_allocations` | Exact original invoice to shipment quantities |
| `export_customs_documents` | Declaration/partial exit/final evidence workflow |
| `export_customs_lines` | Exact invoice allocation, dispatched issue and broker source snapshots |
| `export_compliance_decisions` | Append-only independent review and renewal evidence |

All actor/source relationships use scoped FKs. Immutable-source/history, independent-review, exact coverage and cross-document quantity guards supplement entity-locked transactional services. Existing card/shipment cancellation gains outgoing dependency guards. Applied m001–m015 stay unchanged. The SQL reference mirrors exported m016 table/trigger definitions without permission inserts.

Original profile/VAT and foreign buyer identity are preserved. Local matching approval does not certify statutory validity. Declarations use actual DISPATCHED sources and date-effective broker VERIFIED GTİP. Registration may precede dispatch; accepted exit cannot. Independently approved partial quantities and exact final totals determine closure; accepted exit facts cannot be edited or cancelled. STANDARD_EXPORT, FREE_OF_CHARGE, TEMPORARY_EXPORT and RETURN_EXPORT remain explicitly evidenced. No live e-document/customs transmission, export journal, VAT source register or refund is implemented here.

See [the complete contract](../architecture/export-documents-customs.md) and [handoff](../pr-handoffs/PR-04B.md). PR-05A extends original purchase VAT sources through accepted customs quantities without rewriting these facts.


## PR-05A extension — original VAT and accepted-export attribution

m017 adds vat_input_sources, vat_attributions, vat_attribution_lines and
vat_attribution_decisions (94 tables / 17 migrations). A scoped unique index on
journal_lines supports its original VAT source FK without changing journal rows.
Sources retain original posted purchase-line VAT, conversion, deductible/capitalized
treatment, stock layer and journal evidence. Accepted customs exit quantities trace
the exact issue/layer/purchase chain. Pending and approved attributions reserve
original quantity and exact tax; last depletion takes the residual. Independent
review and evidenced void preserve original decisions. VOID_REQUESTED retains
commitments and accepted totals until an independent acceptance releases them.
Candidate VAT is analytical, separate from tax-period deduction and claimability.
See [the complete contract](../architecture/vat-source-attribution.md). Preserve
applied m001–m017; later claims/returns require coordinated dependency guards.

## PR-05B physical schema and reviewed allocation contract

| Table | Retained contract |
|---|---|
| vat_cost_sources | Original supplier line, posted VAT debit, category, conversion/deduction facts and per-asset first-use/unrecovered basis |
| vat_allocation_bases | Reviewed month, complete turnover and applicable rate, ordinary ceiling and frozen approved candidate-goods VAT |
| vat_allocation_basis_lines | Immutable original goods-attribution membership, candidate VAT and customs/source snapshots |
| vat_cost_allocations | Source/month/category/treatment, consumed basis, ratio result, allocated/candidate/non-export/limited amounts and cumulative asset history |
| vat_cost_allocation_lines | Positive weights and exact six-decimal allocation to original monthly goods lines |
| vat_cost_decisions | One scoped parent, immutable actor/reason/context and deterministic decision sequence |

The three headers use ASSEMBLING → REQUESTED → APPROVED/REJECTED/CANCELLED;
APPROVED → VOID_REQUESTED → VOIDED or back to APPROVED. Original reviews and
plans stay immutable. Independent reviewers accept/reject requests and voids.
Pending and void-pending amounts reserve source basis. Original debit sums and
invoice-line uniqueness prevent reuse; posted non-stock invoices cannot also enter
complete-goods receipts. Monthly candidate goods are frozen while their basis is
active. Corrections release later priority and later asset-period dependencies first.

Direct charges use explicit relationships; overhead uses period eligible/total
turnover and remaining ordinary ceiling; ATİK uses reviewed unrecovered VAT times
cumulative eligible/all-use turnover from first use, less previous committed
allocations, floored at zero and limited to remaining ceiling. Cumulative values
include domestic-only months. Largest-remainder integer micro-units conserve the
amount over positive weights, including 301-line inputs. No fixed business ceiling.

API 0.19.0 / 280 paths, session/CSRF, scoped permissions, entity locking, idempotency
and atomic audit are retained. Six request/review permissions are assigned only to
ADMIN roles. Full original inputs and legal/rate/turnover/use evidence are reviewed;
these analytical candidates do not certify final refund eligibility. PR-06A now adds deduction-period reconciliation, claims and claimed-source correction guards through m019.
See [the detailed allocation contract](../architecture/vat-cost-allocation.md).

## Implemented PR-06A contract

PR-06A adds reviewed original-source deductions, closed monthly KDV1 reconciliation, carry-chain checks, exact duplicate-safe refund requests, dated eligibility/limit checks and independent correction history. m019 adds six tables (106 total) and six request/review permissions. Original candidates and recognized deductions are both reserved; prior external claims reduce capacity. No tax return, claim, stock or journal is seeded or submitted. OpenAPI 0.20.0 has 314 paths.

- `vat_deductions`
- `vat_reconciliations`
- `vat_reconciliation_deductions`
- `vat_refund_requests`
- `vat_refund_lines`
- `vat_refund_decisions`

The complete contract and official policy references are in [VAT refund reconciliation](../architecture/vat-refund-reconciliation.md). Closed full calendar months retain all recognized source deductions and the declared carry/refund arithmetic. Every original claim line is capped by both its candidate and recognized deduction, including previous external refunds. Active reconciliation freezes deduction changes, the monthly export basis/candidate costs and accounting reopening; claims block dependent correction. Six-decimal sources use one explicit cents rounding for the return. Standard 301 policy version TR-301-2026-10-28 supports April 2025–December 2029, with explicit eligibility/procedure evidence; no external submission is implied. PR-06B must add immutable filing/package/settlement records and external withdrawal guards.
