# Product catalogue — PR-01A

Implemented from the **new, user-authorized 21 October 2026 baseline**, not from
recovered original files. See the [design specification](../design/PR01_PR02_database_specification.md)
and [SQL reference](../design/PR01_PR02_schema.sql). PR-01A/01B schema and PR-01C
product UX are implemented; inventory contracts remain planned.

## Use

Open `/products`, select the company in the sidebar, then create units and
families before adding SKUs. For example, a family `ZARF` may contain separate
`ZARF-A4` and `ZARF-A3` SKUs. This is an example, not seeded company data.
Only SKUs will own stock movements when inventory is implemented.

Units define a symbol and quantity precision (0–6 decimal places). SKU base
units, unit precision and all codes are fixed after creation. Name, description,
family membership, family parent, symbol and active status can be edited where
applicable. No conversions or automatic VAT calculations are implied.

An active SKU needs an active family and unit. An active family needs active
ancestors. Deactivate dependent SKUs/child families first, or move children to
another parent. Inactive records and their codes remain reserved. No delete
endpoint exists. Cycles and concurrent reparenting are checked under the entity
write lock; scoped FKs prohibit foreign-entity relationships.

The catalogue and selectors support search and paging. Lists include inactive
records unless filtered; selectors offer active choices and retain an existing
selection even across pages. Readers can inspect the catalogue; managers can
edit; product audit access is a separate permission. The UI preserves the
sidebar-only layout and starts at the content panel.

## API, permissions and transactions

Base: `/api/v1/entities/:entityId/products`.

| Resource | Methods | Permission |
|---|---|---|
| `/units`, `/families`, `/skus` | GET list | `products.read` |
| Same collections | POST | `products.manage` |
| Same resources plus `/:id` | GET | `products.read` |
| Same resources plus `/:id` | PATCH | `products.manage` |
| `/audit-events` | GET | `products.audit.read` |

All require authentication, `workspace.read` and an entity assignment. m004
grants the two new permissions only to existing ADMIN roles; existing assignments
still limit their reach. New CLI-provisioned admins receive the registered
permissions. Roles are checked from the database, not trusted from a JWT claim.

Every write requires allowed Origin, JSON, CSRF and `Idempotency-Key`. Shared
`entity-context.js` holds the common entity lock, reauthorization, idempotent
transaction and audit implementation. Accounting keeps its existing adapter.
Product writes do not require an accounting base currency.

Before/after product details are recorded as `product.<resource>.<action>`.
Product audit returns only that namespace. Accounting audit uses an explicit
allowlist of its own action namespaces, preventing cross-module disclosure
through shared audit storage. Domain changes, audit and retry response commit
atomically; a failed audit leaves no partial catalogue change.

Lists accept `q`, `active`, `offset`, `limit` and, for SKUs, `familyId`; audit
accepts pagination only. Default page size 25, maximum 100. Literal wildcard
characters in search are escaped. All SQL values are parameters; table/column
choices come from static internal resource definitions. The OpenAPI contract
defines accepted editable fields, result envelopes and structured errors.

## Migration and checks

`m004_product_foundation` adds `unit_of_measure`, `product_families` and
`product_skus`: 23 total application tables. Scoped uniqueness and FKs retain
tenant/entity identity; units have an enforced precision CHECK. m001–m003 are
unchanged. Runtime migrations use the existing runner, not the reference SQL.

Run `npm --prefix backend run test:pr01a` and
`npm --prefix backend run test:pr01a:browser`. Both operate on disposable random
schemas on the verified repository-owned MySQL instance. The browser alias
runs the combined product/accounting/authentication gate on port 5184.

The backend gate covers upgrade/history, roles, independent SKUs, retries,
duplicate races, foreign scopes/FKs, hierarchy races, deactivation, immutable
fields, query validation/paging, audit rollback, HTTP protections and separate
audit permissions. The browser gate covers real forms, filters, duplicate and
in-use errors, paging without losing selection, audit, reload, mobile and readers.

PR-01B [classification](product-classification.md) is implemented in m005 (six
more tables, 29 total), including typed specifications, GTİP review/history and
versioned supplier aliases. PR-01C [product UX and release checks](product-ux.md)
are implemented; PR-02A warehouse/pool metadata is next. Unit
conversion and translated-name fields remain deferred until needed. Inventory
quantities, invoices, VAT attribution and historical imports remain later work.
