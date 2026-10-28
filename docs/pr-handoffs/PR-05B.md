# PR-05B handoff — Direct charges, overhead and ATİK

Completed **28 October 2026 (Europe/Istanbul)**. Full release verification and
the local upgrade passed. Next is **PR-06A: KDV1 reconciliation and claim review**.

## Delivered behavior

VAT has Cost sources, Monthly bases and Cost allocations. Register a retained
non-stock supplier invoice line against its already posted VAT debit. Accounting's
“Non-stock supplier invoice” journal option links that posting to the original
invoice UUID. No expense, payable, stock or VAT journal is posted a second time by
registration or allocation. Posted non-stock invoices cannot also receive goods or
be cancelled. Goods sources retain their existing PR-03C/PR-05A workflow.

Each source, monthly basis and allocation requires independent review. Monthly
bases capture every approved candidate goods line for the accepted customs month,
plus evidenced complete turnover, VAT-free acquisitions and the applicable general
rate. They freeze candidate-goods changes until dependent allocations and the basis
are independently voided. Original accounting/customs/source evidence remains intact.

Direct costs use explicit source relationships. Overhead uses eligible/total period
turnover and remaining ordinary ceiling. ATİK uses each asset's reviewed unrecovered
VAT and cumulative eligible/all-use turnover from first use, including domestic-only
months, less earlier committed allocations. Declining ratios produce no negative
allocation; limited amounts never become automatic carry-forward. Goods/direct costs
precede overhead, then ATİK. Corrections unwind dependent categories and asset periods.

Exact six-decimal weights conserve the full amount across selected original goods
lines. HOLD and EXCLUDED reserve their source basis with zero candidate VAT.
REQUESTED and VOID_REQUESTED continue reserving amounts. Decisions are sequenced;
analytical void retains the original plan and independent approval.

See [the allocation contract](../architecture/vat-cost-allocation.md).

## Boundaries and operation

- m018 adds six scoped tables and six ADMIN request/review permissions. Applied
  m001–m017 stay frozen. New total: 100 tables / 18 migrations.
- No fixed business line ceiling. Reads are paged to 100, UI tables to 25 and SQL
  inserts to 250 per batch within the same transaction; the JSON boundary is 1 MiB.
- `/api/v1/entities/:entityId/vat` adds 34 paths. OpenAPI 0.19.0 has 280 paths.
  Roadmap v1.20 and design baseline v16 include the new forward-only contract.
- Source invoice parsing/arithmetic exceptions must be resolved before cost use.
  This step does not extend goods-only commercial exceptions to non-stock costs.
  Mixed goods/non-stock invoices need a later coordinated posting adapter; they
  cannot be split across the existing complete-goods receipt and cost journal.
- Complete turnover, asset use and dated legal rate are evidenced and independently
  reviewed inputs. Grouped assets, HİS and other special exceptions are not inferred.
  Direct costs above the ordinary ceiling remain visibly flagged for PR-06A.
- Final KDV1 reconciliation, statutory deduction/recovery, duplicate-claim protection,
  claim approval/package and payment/offset tracking remain PR-06A/PR-06B.
- No real imports, historical migration, cost registration, allocation, expense
  posting, claims, new local accounts, commit, push or deployment are setup actions.

## Verification

`npm --prefix backend run test:pr05b:release` passed in one complete run. It covers
OpenAPI, frontend lint/build, journal editor, foundation/auth/accounting/products,
all inventory stages, purchasing/invoices/receipts, exports/customs, goods VAT, cost
VAT and the complete isolated browser regression flow. Write checks use disposable
schemas and synthetic accounts.

| Check | Result |
|---|---|
| PR-05B focused checks | PASS: 15 checks, including 301-line exact allocation, FX, original debit/source deduplication, priority and cumulative asset calculations, HOLD/EXCLUDED commitments, direct ceiling exception, independent review/void, races, late-failure rollback, scope/CSRF/origin/idempotency and migration recovery |
| Earlier goods VAT | PASS: 15 checks; the m017-only migration test retains its historical boundary before upgrading to m018 |
| Full browser flow | PASS: non-stock journal selection/posting, cost source/month/allocation previews, independent approval/void, retained history, reader restrictions, reload, mobile and prior workflows |
| Frontend lint / build | PASS: 2,195 modules; Vite reports a 500.80 kB main-chunk size warning, retained as PR-07 performance work |
| API contract | PASS: OpenAPI 0.19.0, 280 paths |
| Local migration / rerun | PASS: m018 applied once; 18 applied migrations / 100 tables |
| Existing data/history/checksums | PASS: existing business rows and earlier metadata preserved; only expected migration and permission additions |
| Local saved-account smoke | PASS: desktop/mobile/reload, empty VAT registers, two STAGED invoices, no runtime errors; successful smoke session logged out |

Release output and timing are retained in `.local/pr05b-release.log` and
`.local/pr05b-release.json`. Backup `.local/backups/pr05b-before.sql` is
**1,210,773 bytes**, with completion and SHA-256 evidence in
`.local/pr05b-backup.json`. Before/after fingerprints and
`.local/pr05b-verification.json` confirm six new empty tables, unchanged existing
business rows and two STAGED supplier invoices with six original lines.

Only saved project Node processes were restarted after checking process identity
and listening-port ownership. API readiness passes on 3000; the app is available at
**http://localhost:5173/vat**. Ownership and logs are recorded in
`.local/runtime-pr05b.json`. No company, administrator or password was changed.
Applied m018 is now frozen with m001–m017. Final source/SQL/reference-copy/link and
backup checks are in `.local/pr05b-final-audit.json`. Temporary PR-05B helper files
are removed; ignored backups, logs, state evidence and screenshots remain.

## Next stage

PR-06A: reconcile deductions and KDV1 periods against reviewed goods/cost candidates;
apply evidenced eligibility/limitations; prevent duplicate claims and independently
approve refund requests. Add claim dependencies before permitting source, monthly
basis or allocation voids. Preserve m001–m018 and every original source/decision.
