# PR-01 / PR-02 design baseline — version 2

Created **21 October 2026 (Europe/Istanbul)** with the user's explicit instruction
to write a new baseline and proceed with PR-01A. This is a new design derived
from the implementation roadmap and existing PR-00 application. The originally
referenced documents were not supplied or recovered. This document does not
claim that future inventory features have been implemented.

The tracked files in `docs/design/` are authoritative. Matching copies beside
the parent roadmap allow its original filenames to resolve. Update both copies
when revising this baseline. The companion SQL contains implemented PR-01A/PR-01B table definitions
and clearly marked future contracts. Runtime schema changes use registered,
forward-only JavaScript migrations; do not execute the reference SQL against
an existing database.

Revised **21 October 2026** for completed PR-01B. PR-01C is next; inventory remains planned.

## Scope and shared contracts

- PR-01A implements units, hierarchical product families and individual SKUs.
- PR-01B implements specifications, GTİP history, supplier references, versioned aliases and review states.
- PR-01C completes the product UX and product release gate.
- PR-02A–02F progressively implement physical stock, virtual allocations,
  reservations, immutable movements, reconciled closing and corrections.
- Existing m001/m002/m003 and existing accounting records remain unchanged.
  PR-01A introduces `m004_product_foundation`; PR-01B introduces
  `m005_product_classification`. Later features get new migrations.
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

## PR-01C next (not implemented as a separate release gate)

Polish catalogue/specification/GTİP/alias navigation and filters, drilldowns,
validation and permission UX; compose the full product release gate from the
PR-01A/01B tests and add focused missing UX checks. No stock quantities or legacy
imports. Existing PR-01A/01B features should be extended, not recreated.

## PR-02 target schema contracts (planned, not applied)

| Stage | Planned records | Grain and invariants |
|---|---|---|
| 02A | `warehouses`, `inventory_pools`, `inventory_periods`, movement metadata | Scoped physical warehouse; GENERAL or COUNTRY pool with ISO country identity; scoped dates/status; no extra physical warehouse or GL balance for a country pool |
| 02B | receipts/items, receipt source layers, inventory events, physical/pool ledgers and balance projections | SKU/warehouse/source-layer identity; immutable posted event/lines; receipt quantity and valuation preserved; idempotent source posting |
| 02C | pool reallocation request/review/execution | Same warehouse/SKU/layer; equal/opposite pool deltas; requester cannot approve own other-country borrowing; physical and GL unchanged |
| 02D | reservations and reservation layer allocations, dispatch/source links | Available quantity at warehouse/SKU/layer/pool; FIFO, deterministic locks, no over-reservation or duplicate consumption |
| 02E | close requests, versioned snapshots, reconciliation checkpoints | Entity/period/version, SKU/warehouse/layer/pool balances; approved prior close plus in-period movements; locked periods and controlled reopen |
| 02F | reversals, approved adjustments, valuation changes | Exact original-event lineage; immutable history, idempotent reversal; quantity/value conservation at every affected grain |

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

Final DDL, status enums, event columns and indexes for these future stages must
be added and tested in their own migrations. This baseline deliberately records
their required grains/relationships without installing unused inventory tables.
It is not a substitute for the PR-02 concurrency and reconciliation release gate.

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
