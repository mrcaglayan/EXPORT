# Product UX and release gate — PR-01C

Implemented 22 October 2026. Extends the PR-01A/01B API contracts without new
endpoints, permissions, dependencies or tables. Applied m001–m005 remain intact.
There is no empty UI migration. Product work creates no stock or GL balances.

## Navigation and reads

`/products?view=skus&sku=<uuid>` opens current SKU details. `view` selects a content
tab, and namespaced query parameters retain each catalogue/alias list's search,
status, references and offset. Examples: `skus.familyId`, `skus.q`, `units.offset`,
`aliases.supplierId`, `aliases.skuId`, `aliases.status`. Filter edits replace the
current history entry; tab and detail changes add entries for browser Back.
Invalid list filter values are bounded/ignored before API requests. An invalid
or inaccessible detail ID produces the structured API error and a route back.

These URLs do not select or authorize a company. The authenticated sidebar context
still determines every entity-scoped API request. Switching entities remounts
the page; data from the previous entity is never reused. A bookmark for another
entity's SKU fails closed until the user selects an authorized matching company.
Read-only users can inspect details; manage/review/audit controls remain separately
permission-gated and the services independently enforce authorization.

Family rows drill into that family's SKUs. Alias rows open their candidate SKU;
browser Back returns to the filtered aliases. SKU headers load from the record API,
including on Refresh, rather than retaining a list snapshot. A refresh retains
the mounted detail editors while the header is revalidated; a failed read hides
them. Inactive SKU history remains readable; creation forms are hidden until the
SKU is reactivated. Review/retirement permission remains independent.

Search requests debounce for 250 ms and cancel obsolete reads. Lists/selection
pickers stay paginated at 25; requests never fetch an unbounded catalogue. Filter
pickers include inactive references; new relationships default to active ones.
Selections survive search/paging, and failed selected-record reads show an error
without silently replacing the ID. Shared loading/error/retry feedback is used
throughout. An out-of-range page explicitly offers a return to page one.

Tabs remain inside the main content card, with arrow/Home/End keyboard navigation
and selected-tab visibility after mobile resize. Global navigation stays sidebar
only, with no header, breadcrumbs or separate page-introduction banner.

## Forms and integrity

Reusable inline forms check required wording (rejecting whitespace-only text),
codes, decimal specification syntax, 12-digit GTİP codes and date ordering.
Validation never trims or rewrites original supplier code/description strings.
Native field feedback focuses the invalid field. Server errors retain inputs and
support references. Successful catalogue saves leave a visible confirmation.

Duplicate-code warnings inspect up to 100 search results after a debounce and
only warn about an exact normalized code match, including inactive records. This
is an advisory convenience, not an availability guarantee: no warning does not
mean a code is free. The scoped unique index and existing transaction/idempotency
logic remain authoritative, including requests racing with another user.

## Verification

`npm --prefix backend run test:pr01` is the complete fail-fast gate:

1. OpenAPI validation, frontend lint/production build and journal editor regression.
2. Fresh/upgrade migrations and foundation, authentication, accounting, product
   and classification integration suites, including isolation, duplicate races,
   review transitions, source retention, audit rollback and idempotency.
3. One combined browser flow covering product/classification/accounting/auth,
   plus PR-01C URL/back/reload/refresh, inactive filters, validation, retry, page
   recovery, mobile keyboard tabs and cross-entity detail checks.

`test:pr01c` runs the browser flow alone. Each integration stage uses the existing
harness to verify the repository-owned MySQL data directory, create a random
disposable schema/user, and remove only those objects. Browser tests own their
API and Vite at port 5184; run one browser gate at a time. Installed Edge is the
default; existing BROWSER_CHANNEL/BROWSER_PATH overrides still work. Screenshots
are ignored local artifacts. The normal frontend `test:smoke` checks the running
local app without creating business data.

PR-02A is next. Inventory, invoice lines, VAT policy, real tariff assignment and
workbook imports remain outside PR-01. Passing local checks does not establish
production capacity or deployment readiness.
