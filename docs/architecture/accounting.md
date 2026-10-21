# Accounting foundation — PR-00C

This extends PR-00B identity. The Accounting page and API implement configuration,
balanced journals, posting requests and audit. No product, inventory, purchase,
export or tax event is implemented here. No historical records or opening
balances are seeded.

## Scope and permissions

Every route is under `/api/v1/entities/:entityId/accounting`. The service checks
the authenticated tenant, the explicit legal entity, its active state and the
user's assignment/permission. Browser-selected context is not an authorization
boundary. Composite foreign keys bind accounts, periods, journals and requests
to the same tenant/entity.

| Permission | Operations |
|---|---|
| `accounting.read` | Settings, accounts, fiscal years, periods, posted journals and posting-request reads |
| `accounting.configure` | Set currency, create/update accounts, create fiscal years and periods |
| `accounting.post` | Post journals and process/retry posting requests |
| `accounting.request` | Enqueue a posting request |
| `accounting.period.close` | Close a period with a reason |
| `accounting.audit.read` | Read only accounting events in the entity audit trail |

Migration m003 explicitly grants the five new permissions to existing ADMIN
roles; their existing entity assignments still apply. Read-only roles receive
no new grants. All mutations require authentication, signed session-bound CSRF,
an allowed Origin, JSON and an `Idempotency-Key`.

## Configuration and dates

An entity starts unconfigured. An administrator selects TRY, USD, EUR or GBP as
its fixed base currency. There is no FX conversion or second-currency posting
in this release. Account codes are scoped and unique; types are ASSET, LIABILITY,
EQUITY, INCOME and EXPENSE. Accounts can be renamed or deactivated; code/type
changes and destructive deletion are not exposed.

Fiscal years cannot overlap within an entity. Periods must fit their fiscal
year and cannot overlap any other period in the same entity. Dates are strict
ISO calendar dates from 1900 through 2199. Document date and posting date remain
separate; the posting date determines the accounting period.

Closing takes an exclusive period lock and requires a reason. PENDING/FAILED
requests and any unposted journal in that period prevent closing. A closed
period rejects new journals and new queued requests, including backdated ones.
Already committed idempotent successes can still be replayed. No period
reopening or journal reversal workflow exists in PR-00C.

## Money and journal integrity

API monetary values are decimal **strings**, never JSON numbers. The validator
accepts up to 14 integer digits and six fractional digits, rejects signs,
exponents, malformed/over-precision input and overflow, and normalizes to six
places. SQL uses `DECIMAL(20,6)`. `decimal.js` uses precision 50; explicit
multiplication rounds half-up to six places. Addition is exact and checked for
overflow. See the [decimal.js API](https://mikemcl.github.io/decimal.js/).

A journal has at least two lines and no fixed business line-count ceiling. Each line has one positive debit or credit and zero
on the other side. Totals must match exactly. Every account must be active and
belong to the entity; currency must match its base currency. The UI and API both
support additional lines, including repeated accounts with distinct descriptions.
The editor mounts at most 25 line rows at a time; totals and validation cover all
rows. Account checks use batches of 500 unique IDs and inserts use batches of
250 lines, inside the same atomic transaction. The 1 MiB request guard and
15-second client timeout remain; capacity is not infinite.
The editor starts with two rows and allows adding/removing rows down to that
minimum. Each row has its own debit or credit amount. Blank monetary fields are
normalized to zero; incomplete/invalid, two-sided or all-zero rows block submission.

The browser calculates totals and differences using BigInt integer millionths,
without binary floating-point arithmetic. It checks the API's six-decimal and
14-integer-digit limits, including total overflow. Formatting does not round away
small differences. The form requires valid, balanced lines plus the document
date, posting date and journal description before posting or queueing. Server
validation remains authoritative. Failed submissions retain all entered lines;
successful ones start a new blank entry. Editing clears prior success feedback.

Amount entry uses a dot for decimals with no thousands separators, for example
`50000.00`. Selecting a VAT account does not calculate VAT automatically. Multiple
goods and VAT rows can represent one manually entered purchase journal. These
rows are accounting entries, not SKU/quantity/unit-price invoice detail. The
later purchase module must preserve multiple invoice items, their VAT treatments
and source-line links when generating the corresponding journal.

The service builds a DRAFT header and its lines in one transaction, then changes
the header to POSTED. Database triggers independently check line count, totals
and the open period at that transition. They prohibit later header/line changes
and deletion. DRAFT is an internal assembly state, not an API draft-editing
workflow; failed transactions leave no draft behind.

Example request body for `POST .../journals` (substitute configured account IDs):

```json
{
  "documentDate": "2026-01-10",
  "postingDate": "2026-01-15",
  "currency": "TRY",
  "description": "Synthetic integration example",
  "sourceModule": "MANUAL",
  "sourceId": "example-001",
  "lines": [
    { "accountId": "<goods-account-id>", "description": "Goods", "debit": "50000", "credit": "0" },
    { "accountId": "<input-vat-account-id>", "description": "Input VAT", "debit": "5000", "credit": "0" },
    { "accountId": "<payable-account-id>", "description": "Supplier payable", "debit": "0", "credit": "55000" }
  ]
}
```

A successful response is `{ "journal": { ... }, "requestId": "..." }`; the
journal has `status: "POSTED"`, matching totals `"55000.000000"` and its stored lines.
See `backend/openapi.yaml` for complete schemas and errors.

## Transactions, retries and audit

Foundation accounting writes first lock the legal-entity row, then recheck
permissions inside the transaction. All writers use this order. This deliberately
serializes writes for each entity; different entities remain independent.
Posting takes a shared period lock, closing an exclusive lock, and accounts are
locked in sorted ID order. This favors a simple, proven foundation over high
throughput. Measure and retain the concurrency invariants before narrowing locks.

The idempotency key is 8–128 safe ASCII characters and unique within an entity.
Its hash includes operation, actor and normalized payload. A matching repeat
returns the original result; a different operation/actor/payload returns 409
`IDEMPOTENCY_CONFLICT`. Domain changes, append-only audit and the saved response
commit together. Audit failure rolls the operation back. These records do not
expire in this release.

Journals and posting requests also have independent unique
`(tenant, entity, sourceModule, sourceId)` identities. Repeating the same source
content does not create another journal even with a new idempotency key;
different content produces `SOURCE_CONFLICT`.

The frontend keeps the same key for an uncertain network/5xx outcome and the
same request content. It does not automatically retry mutations. Journal source
IDs also remain stable until success. Source identity survives different keys.

## Posting-request boundary

`POST .../posting-requests` validates a balanced, scoped payload and stores it as
PENDING. `POST .../posting-requests/:id/process` explicitly processes or retries
it. There is no background worker in this release.

- **PENDING:** accepted for processing, not reported as GL-posted.
- **FAILED:** a known domain rejection (for example an inactive account), with
  an error code and attempt count. No partial journal is retained.
- **POSTED:** linked to a matching, balanced POSTED journal. The journal, success
  audit and request transition commit together.

The processor uses a transaction savepoint so a domain failure can be recorded
without preserving partial journal work. Unexpected SQL, network or commit
errors roll back the whole attempt and do not turn it into a false domain
success/failure. Retrying a FAILED request uses a **new** idempotency key after
fixing the cause; the old key replays its original FAILED result. Processing an
already POSTED request returns it without another journal or attempt.
Known FAILED processing outcomes are HTTP 200 with `status: "FAILED"`; clients
must inspect that status. Transport success alone never means GL-posted.

For future inventory/purchase services, `enqueueInTransaction(tx, context, input)`
is the adapter boundary: validate domain permission and acquire the same entity
lock before calling it **inside the source transaction**. Source changes and the
request must commit together. Do not mark a future stock event GL-posted from
enqueue success; require a POSTED request with its journal ID. No stock event
integration is claimed by this foundation.

## Operations and verification

Nine accounting tables bring the local schema to 20 tables. The migration seeds
permissions only, not accounts, currency, fiscal dates or financial data.
PR-01A adds three product tables in m004; PR-01B adds six in m005 (29 total).
Applied migrations are immutable; future schema changes require m006 or later.
See [migration operations](migrations.md) for separate DDL credentials and
trigger-definer requirements.

All list endpoints use `offset` and `limit` (default 25, maximum 100). The UI
provides paginated tables and paged account/year selections. Audit is restricted
to its separate permission. Content panels, keyboard-operable tabs and mobile
table scrolling preserve sidebar-only navigation and no page-introduction banner.

Run from the repository root:

```text
npm --prefix backend run test:pr00c
npm --prefix backend run test:pr00c:browser
npm --prefix backend run check:openapi
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:journal
```

Integration and browser mutations use disposable databases and synthetic users.
Tests cover exact decimal arithmetic, scope, closed periods, source/key
deduplication, concurrent posting/closing, outbox failure/retry, immutability and
audit rollback. Browser tests also cover the three-line goods/VAT/payable example,
a five-line multi-item example with repeated goods accounts and different VAT
accounts, row addition/removal, imbalance prevention and preserved descriptions.
Frontend tests cover invalid money, six-place precision, total overflow and line
minimum count and 1,000-line validation. Existing local accounting data is preserved.
No statutory account catalogue, tax policy, FX, opening-balance import, reports,
worker scheduling, cancellation/reversal or production rollout is included.

### Large-journal verification — 21 October 2026

Local measurements before the product implementation: 300/1,000 distinct-account
lines posted in 89.2/272.1 ms; six concurrent submissions by two users finished
in 888.1 ms. Browser edit-to-paint: 26.5/33.0 ms; click-to-visible-posted-row:
232/437 ms. Measurements use synthetic disposable data and are not deployment
SLAs. A forced audit failure after a 600-line multi-batch insert rolls back all
lines/header/idempotency. Reproduce using the journal performance/browser scripts.
