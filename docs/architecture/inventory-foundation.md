# Inventory foundation — PR-02A

**Current extension:** PR-02B now implements receipt layers, stock ledgers and
projections. See [the receipt contract](inventory-receipts.md). Metadata alone
still creates no stock. The PR-02A details below describe its original delivery.

Implemented 22 October 2026. This stage configures physical warehouses, virtual
destination pools, inventory calendar identity and movement-type metadata. It
creates no receipts, stock quantities, valuations, reservations or GL postings.

## Warehouse and pool identity

A warehouse represents a physical location. Its entity-scoped code is fixed;
name, location and active status can change. Pools are **entity-wide allocation
definitions**, independent of physical sites. Each company may create at most one
GENERAL pool and one COUNTRY pool per assigned ISO country, including inactive
records. Pool code is derived as `GENERAL` or its country code; kind, country and
code cannot be edited. Names and active status can change. No destructive delete
route exists for any inventory metadata.

Thus one Istanbul warehouse can later hold stock allocated to AF, CM and GENERAL
without creating three warehouses or three financial balances. No warehouse/pool
assignment or balance is needed merely to define those dimensions. PR-02B will
reference both dimensions in each ledger/balance row, using scoped composite FKs.
The intended balance grain remains entity/warehouse/SKU/source-layer/pool, with
physical quantity equal to the sum of pool quantities at the same grain.

This resolves the roadmap's entity-wide GENERAL uniqueness alongside its
same-warehouse allocation rule. It does not turn pools into physical locations,
tax entities or GL accounts. Metadata creation requires no accounting setup.

## Calendar and movement metadata

Inventory periods reference one existing accounting period through a scoped
composite FK and a unique entity/accounting-period key. Code/start/end dates are
read from that calendar; duplicate dates are not maintained. Creating the link
requires an OPEN accounting period, checked under the common entity lock and a
period row lock. Calendar dates remain fixed; PR-02E adds controlled status changes.

Inventory status starts OPEN. PR-02E now implements IN_REVIEW and CLOSED through
[independent close/reopen approval and snapshots](inventory-close.md).
Accounting and inventory statuses are shown separately: closing the GL calendar
does not claim that inventory was reconciled. Stock posting checks **both**
statuses inside the posting transaction. Accounting periods already prohibit
overlapping calendar dates and have no editable-date endpoint.

The calendar picker returns only period identity/dates/status and whether an
inventory link exists. `inventory.read` allows this metadata view without granting
access to accounts, journals or accounting audit. A user who needs a new calendar
must use the separate Accounting permissions and setup workflow.

Movement types contain a fixed code and fixed intended effect: RECEIPT, ISSUE,
REALLOCATION, ADJUSTMENT_IN, ADJUSTMENT_OUT or REVALUATION. Name and active flag are
editable. These are labels/classifications for future executors, not a generic
posting engine or permission to execute any effect. Later stages must require the
appropriate effect, active references, period and approval rules when posting.
REALLOCATION must preserve physical quantity and GL; REVALUATION changes value
only. PR-02B now blocks deactivation of warehouses/pools/SKUs with nonzero stock
and movement types referenced by posted receipts. Later reservation dependencies
must extend these guards; see the receipt contract.

## Country reference

Country pools use assigned [ISO 3166-1 alpha-2 codes](https://www.iso.org/iso-3166-country-codes.html).
The 249-code snapshot was compared in full with the [RIPE published ISO list](https://www.ripe.net/community/internet-governance/internet-technical-community/the-rir-system/list-of-country-codes-and-rirs/)
on 22 October 2026. Reserved/user-assigned codes such as EU, XK and ZZ are excluded.
English display names come from the Node runtime's `Intl.DisplayNames`; code is
the identity, not a translated or geopolitical display name.

`shared/country-codes.js` validates requests and serves the bounded reference list.
m006 contains its own frozen copy in the pool CHECK, so direct SQL also rejects
unassigned codes and invalid GENERAL/country combinations. Runtime code-set
updates require review and a new forward migration of that CHECK; never edit an
applied m006. No live external service is needed to create a pool.

## Schema and API

m006 adds four empty domain tables; total schema is 33 tables:

| Table | Identity and constraints |
|---|---|
| `warehouses` | Scoped code and ID uniqueness; owning entity FK; active CHECK |
| `inventory_pools` | Scoped code/country/ID uniqueness; kind/country/code CHECK; owning entity FK |
| `inventory_periods` | Scoped ID and accounting-period uniqueness; scoped FK to existing accounting period; separate inventory status |
| `inventory_movement_types` | Scoped code and ID uniqueness; fixed effect enum; owning entity FK; active CHECK |

Base: `/api/v1/entities/:entityId/inventory`.

| Path | Methods | Permission |
|---|---|---|
| `/warehouses`, `/pools`, `/movement-types` | GET list, POST create | `inventory.read` / `inventory.configure` |
| Same plus `/:id` | GET record, PATCH editable fields | `inventory.read` / `inventory.configure` |
| `/periods` | GET list, POST calendar link | `inventory.read` / `inventory.configure` |
| `/periods/:id` | GET | `inventory.read` |
| `/accounting-periods`, `/accounting-periods/:id` | GET calendar choices/identity only | `inventory.read` |
| `/countries` | GET fixed country reference, no query parameters | `inventory.read` |
| `/audit-events` | GET paginated inventory-only history | `inventory.audit.read` |

All require authentication, workspace.read and entity assignment. m006 grants the
new configure/audit permissions only to existing ADMIN roles; existing readers
receive no elevation. New CLI admins inherit registered permissions as before.
Every write requires allowed Origin, JSON, signed session-bound CSRF and an
Idempotency-Key. Scope is enforced in both service checks and SQL.

Lists default to 25, max 100 per page, with offset and literal code/name search.
Warehouses/pools/movement types filter active state; pools also filter kind.
Inventory/calendar periods filter their own status and search calendar code.
Audit allows paging only, ordered newest first and restricted to `inventory.*`.
Writes lock the entity before consistent reads, then commit metadata, append-only
audit and the idempotent response together. Duplicate codes/period links return
409; invalid country/kind/immutable fields return 400; foreign references return
404 after scope authorization. Closed-calendar link attempts return 409
ACCOUNTING_PERIOD_CLOSED. Existing successful idempotency replay remains stable.

## UI and verification

Inventory opens directly into its setup card. Content tabs expose warehouses,
pools, periods, movement types and permission-controlled audit. Shared form,
selector, paging, search and retry components reuse PR-01C behavior. No global
header or page-introduction banner is added. The company context is in the sidebar.

Run `npm --prefix backend run test:pr02a` for upgrade/data preservation, permissions,
GENERAL/AF/CM without stock/GL, all country constraints, duplicate/retry races,
calendar status and cross-scope FKs, immutability, paging, audit rollback and HTTP
protections. `test:pr02a:browser` runs the combined browser flow including these
setup forms, closed-period feedback, company switching and inventory-only reader.
Use the existing `test:pr01` regression gate for OpenAPI/lint/build and all earlier
domain suites plus that combined browser flow. Run one browser gate at a time.
All writes in automated tests target disposable schemas on verified local MySQL.

PR-02B now implements receipts, source layers, immutable physical/pool ledgers
and transactional projections using disposable synthetic fixtures. PR-02C is next.
