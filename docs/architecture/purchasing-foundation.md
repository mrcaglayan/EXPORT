# Purchasing foundation — PR-03A

**Current extension:** PR-03C is now implemented in m014; read the
[purchase receipt/accounting contract](purchase-receipts.md). The original
staging/foundation delivery below retains its dated boundaries. PR-04B outgoing/customs evidence is implemented in m016; next is PR-05A.

Implemented 27 October 2026. This stage records trading partners, supplier
contracts, multi-item purchase requests and purchase orders with independent
approval. m012 adds four tables, bringing the schema to 63 tables. Applied
m001–m011 sources and all existing catalogue/stock/accounting history are retained.

## Partner identity

A trading partner is SUPPLIER, CUSTOMER or BOTH. Supplier/BOTH partners link to
one existing scoped `product_suppliers` identity or create one atomically using
the new partner code/name. Existing aliases keep their supplier IDs. There is
no automatic conversion of old catalogue suppliers or real-data seeding.
Customer-only partners have no supplier link. The partner code, role and supplier
link are immutable; contact/legal details and active status may be maintained.
The product supplier remains the catalogue identity, with its own display name
and active status. Supplier purchasing requires both records to be active.

Country codes use the application's assigned-code reference. A nonempty tax ID
is unique by entity and country, but this stage does not authenticate it or apply
statutory tax-number validation. No bank account, payment instruction or credit
limit is inferred. Deactivation requires cancelling pending/approved supplier
contracts and orders. Retained documents snapshot the partner's details at
submission. If those details change before approval, cancel and resubmit using
the current details; already-approved snapshots remain readable.

## Documents and decisions

`purchasing_documents` holds the three typed document headers, scoped references,
dates, purpose, terms, EBYS reference, actors and reasons. References are unique
within entity and kind and compared exactly. An EBYS value is a required textual
reference supplied by the user; no external document is fetched, authenticated
or sent. File attachments, external signing and supplier dispatch are later work.

| Kind | Required source and behavior |
|---|---|
| CONTRACT | Active supplier partner, currency, validity range and terms; independent approval retains commercial evidence. It is a terms reference, without a price catalogue or spending ceiling. |
| REQUEST | Required delivery date and one or more SKU lines. Each line has its own immutable ID and unique user/source `lineKey`, original description, positive quantity, base-unit ID and SKU/unit snapshot. A SKU may appear on several distinct lines. |
| ORDER | One approved request, active supplier partner, currency, delivery date and selected request lines. Optional contract must be approved and match supplier, currency and order date. Each selected request line appears once per order. |

Submission is atomic: ASSEMBLING → REQUESTED. ASSEMBLING exists only inside the
transaction. Another authorized user approves REQUESTED → APPROVED; a reviewer
may instead reject it. The requester may cancel REQUESTED or APPROVED documents
with a reason. Rejected/cancelled documents remain terminal and readable. There
are no edit/delete/reopen APIs for submitted documents or their lines. To revise
content, cancel and submit a new reference. A reviewer may reject their own
pending submission, but cannot approve it. Cancel dependent pending/approved
orders before cancelling their request or contract.

Dates are date-only. Delivery cannot precede document date. An order cannot
precede its request or contract document date, and must be within any selected
contract's validity. Contract validity controls order placement, not delivery.
Future document dates are permitted. This stage has no accounting-period effect.

## Exact quantities and source commitments

Request quantities use each active SKU's base unit and its allowed precision.
Submission and approval recheck SKU/family/unit activity and unchanged unit
identity. There is no unit conversion, substitute-SKU matching or tolerance.
Order lines link directly to `purchase_request_lines`; the SKU cannot be replaced
through an order payload. SKU and unit labels are read from the retained request
snapshot, even if catalogue display text later changes.

ASSEMBLING, REQUESTED and APPROVED orders count against each request line's
quantity. Pending approval therefore holds its quantity, avoiding two approved
orders overspending one request. Split orders and different suppliers are allowed
within the original quantity. Rejection or cancellation releases the commitment.
These are purchasing commitments, separate from inventory reservations.

All quantities/prices/net amounts are DECIMAL(20,6) strings. The server computes
each line as quantity × unit price with six-place half-up rounding, then sums
the rounded lines with exact decimal arithmetic. A zero price requires a
retained free-goods reason; a positive price has none. Order totals are net in
the selected TRY/USD/EUR/GBP currency. No exchange rate, VAT rate, invoice total,
payable, journal or stock value is generated. PR-03B preserves imported invoice
lines; PR-03C will define the approved matching/receipt/accounting adapter.

There is no fixed document-line ceiling. Requests remain subject to the 1 MiB
JSON limit and finite resources. Writes use 250-row batches inside one
transaction; editors and source choices show 25 rows per page; API reads allow
1–100 rows. The integration suite exercises 301 retained request/order lines.
This is a regression case, not a deployment throughput guarantee.

## Integrity, permissions and API

All mutations use the shared entity lock before reads. Header/lines, quantity
commitments, audit and idempotent result commit together. Approval rechecks
active references, source state/date, contract match and partner snapshot.
SQL scoped foreign keys, unique keys, amount/shape checks and triggers protect
identity, exact line totals, request membership, over-ordering, independent
review, transitions and append-only source history. Creation cannot publish an
incomplete line count or mismatched total. Trigger writers also take the entity
lock; application writers retain their established lock order.

The four permissions are granted only to assigned ADMIN roles on upgrade:
`purchasing.read`, `purchasing.manage`, `purchasing.approve` and
`purchasing.audit.read`. Other roles receive no implicit write/review permission.
`workspace.read` is also required. A real independent approver must be provisioned
through the existing authorized identity process; no extra local user is seeded.

All routes below are under `/api/v1/entities/:entityId/purchasing`:

| Route | Contract |
|---|---|
| GET/POST partners; GET/PATCH partners/:id | Paged scoped partner records; manage permission for writes |
| GET/POST contracts, requests, orders; GET resource/:id | Scoped document reads/submission |
| GET requests/:id/lines; GET orders/:id/lines | Stable source lines; request committed/available quantities are live |
| POST resource/:id/approve, reject, cancel | Explicit reason, permission, state and requester/independent-review guards |
| GET skus, suppliers; GET resource/:id | Paged purchasing reference choices without requiring catalogue write permission |
| GET audit-events | Purchasing namespace only, separate audit permission |

Every write requires a session, allowed Origin, JSON, CSRF token and
Idempotency-Key. Replay with the same actor/operation/payload returns the retained
result; a changed payload conflicts. No DELETE, document PATCH, external-send,
invoice-import or production receipt POST route is added. OpenAPI 0.13.0 contains
132 documented paths including these 24 additions.

## Screens and verification

The sidebar Purchasing entry opens purchase requests, orders, contracts, trading
partners and permission-controlled audit tabs. URL query parameters retain view
and selected document for reload/back/source drilldown. Loading/retry, empty and
validation states use shared controls. Mobile keeps tables within horizontal
scroll containers; navigation remains sidebar-only, with no global header or
page-introduction block.

```text
npm --prefix backend run test:pr03a
npm --prefix backend run test:pr03a:browser
npm --prefix backend run test:pr03a:release
```

The scoped MySQL harness creates and removes only its own disposable schema and
account. Tests cover upgrade/rerun/recovery/tampering, supplier reuse, snapshots,
approval separation, split/concurrent orders, free/decimal lines, quantities,
scope/permissions/HTTP/CSRF/replay, audit rollback, source substitution, direct
SQL guards and 301-line paging. The release command also checks existing domain
regressions, OpenAPI, journal editor, frontend lint/build and the full browser
workflow. The PR-02 capacity benchmark remains available via
`test:pr02f:performance`; purchasing changes do not alter its stock services.

PR-03B is now implemented in m013; see
[incoming invoice staging](purchase-invoice-staging.md) for retained sources,
mapping revisions and independent decisions. PR-03C will add actual goods receipt and 153/191/320 integration,
including mismatch exceptions and source-line links. A supplier order here is
an internal approval record, and does not claim a completed financial or stock
posting.
