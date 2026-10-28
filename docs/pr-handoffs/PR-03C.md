# PR-03C handoff — Purchase receipts and balanced invoice journals

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **27 October 2026 (Europe/Istanbul)**. Next is **PR-04A: packing-list
intake, export card sequence, country allocation and export shipments**.

## Delivered behavior

Purchasing → **Invoice imports** now includes explicit purchase posting account
configuration, commercial comparisons/resolution requests, independent commercial
review, full physical goods receipt requests and independent receipt approval.
The preview shows exact stock cost and a balanced goods/VAT/supplier payable
journal. Posting commits stock, source layers, physical/pool ledgers, balances,
journal, lineage and audit in one transaction. Retries cannot post twice.

The 50,000 goods + 5,000 deductible VAT example posts 153 debit 50,000, 191.10
debit 5,000 and 320 credit 55,000. Several SKU lines and mixed source VAT remain
independent. Each taxed line explicitly records whether VAT is deductible or
capitalized, with its accounting basis. Zero-rate/exempt and free goods retain
their source evidence. All-zero goods create stock without a nominal journal.
Foreign currency receipts retain a dated positive conversion rate/evidence and
the explicit small base-currency rounding entry when needed.

An exact source cost of 100 for quantity 3 remains 100.000000 in stock, even
though its informational unit cost is 33.333333. Pool allocations distribute the
exact total. The forward migration preserves fixture multiplication checks and
requires purchase lines/layers to agree with their approved source.

Commercial resolutions retain original findings, accepted source/order prices,
discount allocations, declared supplier bases/factors, reason and evidence.
Only supported exact document discounts and evidenced price variations can be
accepted. Identity, quantities, units, tax arithmetic and unsupported source
structures stay blocking. The reviewer is independent of importer, mapper and
resolution requester. Changes to matching/reference context require fresh review.

Receipt review is independent of its requester. Approval/posting revalidate the
READY invoice, commercial review, exact full quantities, active accounts/SKUs/
units/warehouse/pools/movement, current policy and both open calendars. Existing
stock-close and mapped-account locks still apply. Source IDs link every invoice
line to its approved order, stock receipt line/layer and goods/VAT journal rows.
Public manual journals/posting requests cannot claim PURCHASE_INVOICE.

An active/posted receipt blocks invoice cancellation/return to mapping. Cancel an
unposted receipt first. Posted purchases retain their one-time invoice lineage.
Stock-only purchase receipt reversal is blocked pending a coordinated financial
reversal. Original source XML, source lines and prior matching history stay
immutable throughout.

See [the complete receipt contract](../architecture/purchase-receipts.md).

## Implementation and plans

- `m014_purchase_receipts.js`: four scoped tables and six ADMIN permissions;
  guarded PURCHASE_INVOICE stock source and complete evolved inventory verifier.
  All applied m001–m013 source files remain unchanged.
- Receipt/resolution services and validators extend the existing invoice routes.
  The stock adapter reuses the existing transaction core; journals reuse the
  existing balanced posting function in the same transaction.
- Purchasing screens add account configuration, commercial comparison/review,
  paged receipt lines, journal preview, approval/posting and retained source links.
  Receipt selection survives refresh. Sidebar-only navigation remains intact.
- OpenAPI **0.15.0**, **161 paths**. Roadmap **v1.16**, baseline **v12** and SQL
  reference/copies describe m014 and identify PR-04A next. Earlier handoffs retain
  their dated delivery scope with current status pointers.
- No new runtime dependency was added. No commit, push, deployment, real source
  import, additional user, historical workbook migration or business posting was
  performed by this implementation.

## Executed verification

| Command/check | Result |
|---|---|
| `npm --prefix backend run test:pr03c:release` | PASS: OpenAPI, lint/build, journal editor, foundation/auth/accounting/catalogue, every inventory stage, purchasing, invoices, receipts and isolated browser |
| `npm --prefix backend run test:pr03c` | PASS: 15 checks, including fresh/retained upgrade, recovery/tamper, exact 153/191/320, mixed/free/exempt/capitalized VAT, commercial review, conversion, stale/closed/inactive guards, rollback, concurrency and 301 lines |
| Final frontend lint and production build after label/refresh refinements | PASS: 2,176 modules |
| Final OpenAPI validation | PASS: 161 paths |
| Original supplied XML read-only checks | PASS: DEK discount structure supported; EGT retains zero source arithmetic findings; original hashes unchanged |
| Local `node scripts/migrate-local.js`, from backend, and verification rerun | PASS: m014 applied once; 14 applied migrations; 73 tables |
| Local pre/post hashes | PASS: all existing data/history retained; m001–m013 file checksums unchanged; only expected permissions/role-permissions/schema-history additions |
| Local saved-account desktop/mobile browser check | PASS: PR-03C controls, 2 STAGED invoices / 6 original lines, empty posting policy, no runtime errors; test session logged out |

The full release gate corrected a historical m013 recovery test to exercise its
own version before adding m014, matching the earlier inventory/purchasing recovery
tests. Synthetic browser fixtures use separate approved remaining order quantity;
the quantity guard correctly rejected reuse of an already matched source.

## Local state and runtime

A complete, verified backup is retained in ignored
`.local/backups/pr03c-before.sql` (1,009,438 bytes), with its raw SHA-256 metadata
in `.local/pr03c-backup.json`. Before/after state fingerprints and
`.local/pr03c-verification.json` retain the upgrade evidence. All four new tables
are empty. Both invoices already staged during local app use remain STAGED with
their six original lines; neither was mapped, resolved, approved or posted.

Only the two saved project Node processes were restarted after checking their
process names, IDs and listening ports. API readiness passes at port **3000**;
the frontend is running at **http://localhost:5173**. Runtime ownership/log paths
are retained in `.local/runtime-pr03c.json`. Existing company, admin and password
remain unchanged. No password is copied into this document or tool output.

Ignored screenshots include purchase receipt preview/mobile, posted receipt
desktop/mobile, commercial review and local desktop/mobile invoice screens.
Business posting tests run only in fresh disposable schemas, which are removed
with their temporary test accounts after the run. Temporary implementation helpers
were removed; backup/state/runtime/screenshot evidence remains ignored.

## Boundaries and next step

This workflow receives complete invoices once. Partial physical receipts,
goods-received accruals, supplier credit notes and coordinated purchase financial
reversals remain later extensions. Existing counts/revaluations keep their explicit
GL reconciliation responsibilities. VAT choice records accounting approval;
statutory eligibility, export attribution and refund claims remain PR-05/06.
Unsupported discounts/charges, withholding, source exchange structures, prepayment
and explicit tax/payable rounding remain exceptions. Full signature/XSD/Schematron
validation and live İZİBİZİ connectivity are separate work.

PR-04A should extend the existing product, country-pool reservation and dispatch
sources with export packing-list intake, export cards and shipment links. Preserve
applied m001–m014, every purchase invoice/order/receipt/journal source link,
original ledgers and retained close versions. The supplied outgoing invoice XML
remains a read-only format reference for the later export invoice stage. No real
historical workbook or opening-stock/VAT migration is authorized.
