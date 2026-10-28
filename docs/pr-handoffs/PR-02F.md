# PR-02F handoff — Corrections and inventory release gate

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **27 October 2026 (Europe/Istanbul)**. PR-02 is complete. Next is
**PR-03A: trading partners, contracts, purchase requests/orders, EBYS references
and approvals**. PR-03A was not started.

## Delivered behavior

Inventory → Corrections supports physical counts, zero-quantity value changes
and exact reversals of posted receipts, executed pool transfers, dispatches and
prior non-reversal corrections. Requests retain evidence, original source entries,
before-balances, calculated deltas and source movement hashes. Another authorized
user approves; posting rechecks source stock, reservations, active references,
dates and both calendars. A stale plan requires cancellation and a new request.

Exactly one reversal may post for an original event. Original source records,
issue lines, reservation counters and close versions remain unchanged. A dispatch
reversal restores available stock to its original layers/pools; a new reservation
is required for another dispatch. Physical/pool quantities and values reconcile;
negative carrying value and value without quantity are rejected. Audit, workflow,
stock projections, event/ledger entries and retry results commit atomically.

Movement history offers cursor pagination and explicit reversal lineage, plus an
integrity report. Closed stock reports aggregate/page in MySQL. Live projection
checks aggregate scoped ledgers once. Counts/revaluations support many different
source lots/SKUs without a fixed document-line ceiling; 1 MiB payload, batched
writes and paged reads/editors remain. Sidebar-only navigation is preserved.

No correction creates a GL/VAT entry or invents purchase provenance. Stock-to-GL
differences remain explicit and block close until resolved through authorized
accounting. Counts can only select existing source-layer/pool projections. No real
stock, mappings, extra users or historical workbook data were seeded.

See [the correction and release contract](../architecture/inventory-corrections.md)
for workflow, permissions, evidence/source limits and API details.

## Migration and plans

m011 adds inventory_corrections and inventory_correction_lines (59 tables total),
correction/reversal event links, indexed derived event posting dates and expanded
ledger/no-orphan projection checks. Existing event dates are copied from retained
source dates. Original source/ledger values and migration history are preserved.
m011 verifies the evolved m007–m009 stock contract; m010 still verifies closes.
All eleven migrations are applied once and frozen; preserve m001–m011.

OpenAPI 0.12.0 documents 108 `/api/v1` paths. Roadmap v1.13, build/bootstrap
instructions, README and historical handoff status notes identify PR-03A as next.
Design baseline v9 and final-state reference SQL include PR-02F; authoritative and
project-root copies match. Earlier handoffs retain their dated delivery results.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr02` | PASS — complete fail-fast inventory release gate |
| PR-02F correction integration | PASS — 11 tests: retained-data upgrade, date backfill, rerun/tamper/recovery, receipt→allocation→reserve→dispatch→reverse→close, independent review, exact costs, counts/revaluation, stale/reserved/inactive/date/scope guards, concurrent posting/reversal, audit rollback, HTTP session/CSRF/idempotency, cursor paging, retained closes, 301 lines/free goods and SQL immutability |
| Foundation / auth / accounting / products / classification / inventory metadata | PASS — 22 / 14 / 16 / 12 / 15 / 11 tests |
| Receipts / allocations / reservations / closes | PASS — 13 / 13 / 14 / 14 tests |
| Journal editor | PASS — 7 tests |
| Frontend lint/build and OpenAPI | PASS — 2,166 modules, lazy-loaded correction screens, 108 validated paths |
| Synthetic capacity budget | PASS — 1,001 source layers, four 1,000-line revaluations, at least 10,002 ledger entries, integrity, monthly close and cursor/closed reads |
| Combined isolated browser workflow | PASS — earlier workflows plus reversal/count/revaluation, independent reviewer, posting permission separation, retained close, movement history, integrity, read-only access and mobile forms/details/history; rerun after the final layout fix |
| Local backup / migration / rerun | PASS — private SQL backup before m011; eleven migrations applied once and verified on rerun |
| Local before/after comparison | PASS — original table columns/rows and migration sources preserved; 59 tables; both new correction tables empty |
| Local app smoke and correction screens | PASS — existing account/company, permissions, empty stock/correction reads, integrity report, disabled empty submission, responsive forms and logout; no business writes |
| Screenshots, matching baseline copies and `git diff --check` | PASS |

The final combined-gate benchmark measured:

| Operation | Observed | Local regression budget |
|---|---:|---:|
| Post 1,000 receipt lines | 30.7 s | 60 s |
| Full 1,000-line correction, including request/review/post | 12.1–15.0 s | 35 s |
| Post approved 1,000-line correction | 9.2–10.9 s | 20 s |
| Live monthly trial balance | 403 ms | 3 s |
| Stock integrity | 127 ms | 3 s |
| Cursor page | 155–239 ms | 3 s |
| Prepare 1,001-layer close | 27.3 s | 30 s |
| Approve close | 442 ms | 15 s |
| Closed grouped/layer page | 79–91 ms | 3 s |

These are synthetic local regression measurements, not a deployment SLA. The
entity write lock serializes mutations; bulk receipt/close operations remain
slower, and live report/source preparation still uses memory/history. Test larger
and multi-company workloads on the intended hardware before promising throughput.

Early benchmark failures exposed repeated correlated scans: 1,000-line correction
posting reached 66 seconds, and the monthly live report took 44 seconds. Grouped
SQL checks corrected both paths. The full gate then passed with the budgets above.
OpenAPI validation also caught a missing parameter reference, which now reuses
the existing scoped ID parameter. Disposable test schemas/accounts were removed
by their harnesses. No dependency or lockfile changes were needed.

Final local checks caught phone-width overflow in the correction form: the
fieldset retained its browser minimum width despite the table's scroll container.
The fieldset now permits shrinking, and movement-history buttons wrap. The
isolated browser suite now checks populated count/revaluation forms and movement
history at 390 px. That suite, local smoke, lint and build passed after the fix;
desktop/mobile screenshots were inspected.

## Running locally and next work

Open **http://localhost:5173/inventory** → **Corrections** or **Movement history**.
Repository MySQL, API port 3000 and Vite port 5173 are running. Local MySQL was
restarted after the session resumed. Company **abc A.Ş.**, administrator
**admin@gmail.com** and the existing password are unchanged. A real second
authorized user is still needed for independent approval.

Ignored SQL backup, before/after hashes, benchmark results, screenshots, runtime
process record and logs remain local. Data comparison preceded browser login/logout
checks, which change authentication state only. No commit, remote PR or deployment
was performed by this work.

Next implement PR-03A by extending existing partner/catalogue identities and scoped
approvals. Preserve source-line identity for later multi-item invoice integration
in PR-03B/PR-03C, and define authorized stock/accounting/VAT event mappings before
automatic financial posting. Real receipt entry remains fixture-only until the
purchasing adapter is implemented.
