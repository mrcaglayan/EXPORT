# PR-02B handoff — Receipts, source layers and stock ledgers

**Current status — 23 October 2026:** PR-02D is implemented; see the
[PR-02D handoff](PR-02D.md). PR-02E is next. The dated results below describe
the earlier PR-02B delivery.

Completed **22 October 2026 (Europe/Istanbul)**. Next is **PR-02C: destination
allocation and approved pool borrowing**.

## Delivered behavior

Receipts retain every source line as a separate immutable cost layer, including
multiple SKUs, repeated SKUs and zero-cost goods. Positive quantities respect SKU
base-unit precision. Exact decimal values and largest-remainder pool allocation
preserve physical quantity/value = total pool quantity/value without rounding drift.
There is no fixed line-count ceiling; 301 lines were tested with batched writes.

The Inventory card now has Receipts, Stock balances, Pool balances, Source layers,
Physical ledger and Pool ledger views alongside setup. Warehouse/pool filters,
SKU filtering, receipt/source drill-down, paged line details, retry and mobile
views retain sidebar-only navigation. Read-only inventory users can inspect stock
and provenance without posting, configuration or audit privileges.

**Source boundary:** as required by the roadmap, only disposable test fixtures can
post receipts in PR-02B. The normal app has no receipt POST route or entry form.
PR-03 must introduce an authorized purchase-invoice source adapter. The local
company remains empty of stock; no historical workbook or synthetic stock was
loaded. Stock valuation does not create GL, payable or VAT entries.

## Integrity and files

m007 adds eight tables (41 total), scoped FKs, source uniqueness, immutable-history
triggers and posting reconciliation guards. It grants inventory.receipt.post only
to ADMIN. Service writes check active references, receipt movement effect, base
currency and both open accounting/inventory periods under the entity lock.
Deterministically ordered projection inserts hold row locks until commit. Source
and idempotency fingerprints prevent duplicate posting even with different retry
keys; changed content conflicts. Audit or later failure rolls back all stock and
retry writes. Nonzero stock prevents warehouse/pool/SKU deactivation; used movement
types are also guarded.

Main implementation: `backend/src/migrations/m007_inventory_receipts.js`,
`services/inventory-receipts.service.js`, `services/inventory-usage.js`,
`validators/receipts.validators.js`, inventory routes, product/metadata guards,
integration tests and OpenAPI 0.8.0 (62 paths). UI: `StockPanel.jsx`, inventory tabs,
and receipt browser checks composed into the existing smoke harness.

README, roadmap v1.9, build/bootstrap status and historical handoff notes identify
PR-02C as next. Baseline v5 includes the m007 tables and triggers; authoritative and
project-root copies match. See the [receipt contract](../architecture/inventory-receipts.md)
for rounding, source boundaries, locking, API and future migration requirements.
Applied m001–m006 and dependency lockfiles are unchanged; now preserve m007 too.

## Executed checks

| Command/check | Result |
|---|---|
| `npm --prefix backend run test:pr02b` | PASS — 13 tests, including upgrade, exact allocation, retries/concurrency, multiple/free/repeated SKU lines, validation, scope, deactivation, immutability, rollback, 301 lines, periods and HTTP/source boundary |
| `npm --prefix backend run test:pr02a` | PASS — 11 metadata regression tests |
| `test:pr01` non-browser stages | PASS — OpenAPI 62 paths, lint/build, 7 journal editor tests, 22 foundation tests, 14 auth tests, 16 accounting tests, 12 product tests and 15 classification tests |
| `npm --prefix backend run test:pr02b:browser` | PASS — complete combined workflow, including receipt views, reader access, company isolation and mobile layout |
| Final frontend production build | PASS — 2,161 modules |
| Final OpenAPI validation | PASS — 62 paths |
| `npm --prefix backend run db:migrate:local` | PASS — m007 applied to repository-owned MySQL |
| `npm --prefix backend run db:migrate:status` | PASS — all seven applied, each at attempt 1 |
| Local before/after comparison | PASS — original row hashes/migration history retained, m001–m006 source hashes unchanged, eight new stock tables empty |
| `npm --prefix frontend run test:smoke` | PASS — running local app, no business writes |
| Live six stock views and source boundary | PASS — empty stock views; normal receipt POST returns 404 |
| Readiness/UI | PASS — HTTP 200 |
| Desktop/mobile screenshot review | PASS — receipt allocations, horizontal stock tables, selected mobile tab visible, no global header/document overflow |
| `git diff --check` | PASS |

The first receipt test run found a Date/string difference between initial service
responses and stored retries; receipt headers now consistently serialize the
timestamp. The full prior regression command reached its browser stage and failed
on an ambiguous pager locator shared with a hidden filter picker. That test was
scoped correctly, and the combined browser command then passed. The final receipt
suite also passed after restricting original allocation reads to the receipt event.
All disposable schemas/accounts were removed by their harness.

## Running locally and next work

Open **http://localhost:5173/inventory**. Repository MySQL, API port 3000 and Vite
port 5173 are running. Company **abc A.Ş.**, administrator **admin@gmail.com** and
the existing password are unchanged. Private credentials, snapshots, logs and
screenshots remain ignored. No commit, remote PR or deployment was created here.

PR-02C must add approved equal/opposite pool reallocations with maker-checker
rules, quantity/value conservation and no physical or GL effect. Its forward
migration must extend receipt-only event provenance, signed pool deltas and
projection insert guards while preserving original receipt allocations and
immutable history. FIFO consumption/reservations remain PR-02D, closing/GL
reconciliation PR-02E, and corrections/reversals PR-02F. Existing development-only
dependency audit findings remain unchanged. Tests are local correctness checks,
not a production throughput guarantee.
