# PR-02D handoff — Reservations and FIFO dispatch

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **23 October 2026 (Europe/Istanbul)**. Next is **PR-02E: stock trial
balance, month-end snapshots and close**. PR-02E was not started.

## Delivered behavior

Inventory → Reservations supports many stock items and repeated SKU lines,
partial release, partial dispatch and cancellation of the unshipped remainder.
It selects unreserved destination stock then GENERAL, FIFO within each pool,
and retains the exact reservation-line/pool/receipt-layer allocation. No silent
country borrowing or fixed document-line cap was introduced. The existing 1 MiB
request guard, paged editor/reads and batched inserts remain.

Reservations reduce availability without changing on-hand or stock value.
Allocation previews and transfers now exclude reserved quantities; transfer
valuation still uses on-hand quantity as its denominator. Dispatch consumes only
the selected reservation's retained source quantities, posts matching negative
physical/pool entries and preserves original receipt allocations. Partial costs
use exact remaining carrying value; full depletion consumes residual rounding
value, and free goods stay zero cost. Dispatches shows quantities, consumed cost
and original receipt-line provenance. Stock balances show reserved and available
quantities. Permissions, mobile tables and sidebar-only navigation are preserved.

Both calendars, dates, reference activity, unit precision and stock availability
are checked under the common entity lock. Counter/history, event, ledger,
projection, audit and idempotency changes commit together. Release/cancel can
free outstanding quantities after closure without changing stock. Posted dispatch
reference/content replays with a new retry key; changed content conflicts.

## Schema and planning

m009 adds seven reservation/release/issue tables (50 total), issue event
provenance, signed physical entries and projection guards against spending reserved
stock. Composite FKs and lifecycle/immutability/reconciliation triggers protect
source identity and history. Only assigned ADMIN roles receive reservation.manage
and issue.post permissions. m009 verifies the complete evolved m007/m008 schema
through the explicit verification handoff; original m001–m008 sources/history
remain unchanged. All nine migrations are now applied and frozen.

OpenAPI 0.10.0 documents 84 paths under `/api/v1`. README, roadmap v1.11, build/
bootstrap status and historical handoff pointers identify PR-02E as next. Design
baseline v7 and its SQL reference include the evolved schema; authoritative and
project-root copies match and retain the original replacement provenance.

The accounting boundary is explicit: dispatch records stock quantity and consumed
cost only. It does not create a GL journal/posting request or infer invoice,
ownership transfer, customs closing, VAT deduction or refund. An approved dispatch
event/account mapping is still needed. PR-02E must expose unposted financial
differences instead of claiming GL parity, and carry outstanding reservations
across periods while retaining separate release history.

See [reservation contract](../architecture/inventory-reservations.md),
[allocation contract](../architecture/inventory-reallocations.md) and
[migration operations](../architecture/migrations.md).

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr02d` | PASS — 14 tests: forward upgrade with existing receipt, rerun/tamper/recovery, destination/GENERAL priority, reserved transfer protection and costing, partial release/dispatch, exact source/replay, ten concurrent reserve and issue attempts, repeated/multiple SKUs, free/fractional stock, audit rollback, periods/scope/deactivation, SQL guards, HTTP protections, 301 lines and reconciliation |
| PR-02B / PR-02C integration regressions | PASS — 13 / 13 tests |
| Foundation / auth / accounting / products / classification / inventory metadata | PASS — 22 / 14 / 16 / 12 / 15 / 11 tests |
| Journal editor regression | PASS — 7 tests |
| Frontend lint and production build | PASS — 2,164 modules; reservation/dispatch screens split into a lazy-loaded bundle |
| OpenAPI validation | PASS — 84 paths |
| `npm --prefix backend run test:pr02d:browser` | PASS — combined prior workflow plus multi-SKU reservation, partial release/dispatch, free sample, cancellation, immutable source history, stock views, read-only access and mobile layout |
| Local backup and migration | PASS — private SQL backup before m009; nine migrations applied once; rerun verifies without reapplying |
| Local before/after comparison | PASS — original row hashes/history and migration source hashes preserved; 50 tables; all 17 stock/reservation/issue tables empty |
| `npm --prefix frontend run test:smoke` | PASS — running local app, login/logout, navigation, readiness and mobile controls; no business writes |
| Local reservation/dispatch checks | PASS — existing company/account, new permissions, empty stock/dispatch reads, reservation editor and mobile layout |
| Screenshots / baseline copy comparison / `git diff --check` | PASS |

The 301-line dispatch measured 1,724 ms in the disposable integration run. It is
a correctness/capacity check, not a deployment performance guarantee. The entity
write lock and per-allocation counter updates remain scaling limits for PR-02F's
representative-volume benchmark; no fixed business line limit was added.

Early implementation checks caught and corrected a nested-trigger separator,
decimal-default verification formatting and an older negative-stock assertion
that needed to accept the new reservation guard. The final layout rerun exposed
an existing product-browser timing race: it could inspect the old matching row
before filtered results loaded. The test now waits for the filtered row set.
The complete gate then passed. Mobile source columns were widened to avoid tall
rows caused by wrapping layer UUIDs. Disposable schemas/accounts were removed by
their harnesses. No dependencies were installed or lockfiles changed.

## Running locally and next work

Open **http://localhost:5173/inventory**. Repository MySQL, API port 3000 and Vite
port 5173 are running. Company **abc A.Ş.**, **admin@gmail.com** and its existing
password are unchanged. Private SQL backup, before/after hashes, screenshots,
runtime process record and logs remain ignored. Migration data comparison ran
before local browser login/logout checks, which only change authentication state.
No stock fixtures, extra real users or historical workbook data were added.
No commit, remote PR or deployment was created.

Receipt creation remains fixture-only until PR-03 connects authorized purchasing.
Next implement PR-02E reports, versioned snapshots and controlled close/reopen
using a new forward migration. Include dispatch consumption and outstanding
reservations, preserve immutable history, and make financial reconciliation gaps
explicit until the approved accounting event policy is implemented.
