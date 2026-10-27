# PR-03C purchase receipts and commercial resolutions

Implemented 27 October 2026. This extends the existing purchase source/matching
contract with forward migration `m014_purchase_receipts`; m001–m013 stay frozen.
It adds four scoped tables (73 total), six explicit ADMIN permissions, API
contracts and Purchasing → Invoice imports screens. No accounts, recipient IDs,
receipts, additional users or real stock/GL transactions are seeded.

## Source and authorization

The retained source XML, original parser findings, invoice lines, mapping revisions
and matching decisions remain unchanged. A receipt requires a READY invoice whose
current matching and commercial approval still pass all checks. Invoice UUID,
source-line UUID and approved order-line UUID remain distinct identifiers.

All services check the assigned tenant/entity and permission. Writes use the
common entity lock, scoped transaction, CSRF/Origin, idempotency and audit path.
Reviewers cannot approve their own receipt request. A commercial reviewer must
also be independent of the importer and mapper. No external supplier communication
or invoice acceptance is implied by these internal decisions.

| Permission | Action |
|---|---|
| purchasing.receipt.configure | Explicit account mappings |
| purchasing.exception.request | Evidence-backed commercial request |
| purchasing.exception.review | Independent commercial review |
| purchasing.receipt.request | Goods receipt request/cancellation |
| purchasing.receipt.review | Independent receipt approval/rejection |
| purchasing.receipt.post | Posting, also requiring inventory.receipt.post and accounting.post |

Reads require `purchasing.read`. The JSON receipt preview uses POST with
CSRF/Origin but is read-only and does not create an idempotency record.

## Commercial resolution

Resolution requests retain an immutable proposal, reason, evidence, current
mapping revision and business-context hash. Independent approval/rejection is
terminal. A matching/reference change invalidates the resolution; a fresh request
and review are needed. Original findings stay in the invoice source, while only
the exact covered findings are resolved for current readiness.

Supported cases are an evidenced order/source price variation and the following
document-discount variant: source unit prices describe pre-discount goods, each
line net is already discounted, header line-extension total describes the goods
before discount, and tax-exclusive total describes the discounted line nets.
The adapter proves all of these exact equalities before proposing acceptance:

- Sum of quantity × price / price base, rounded at each source line amount scale,
  equals declared header line-extension total.
- Every derived line discount is nonnegative; their sum equals the declared
  document allowance total and the sum of non-charge document allowances.
- The source line nets sum exactly to the tax-exclusive total. Original line VAT,
  tax groups and net + VAT = gross = payable checks still pass.

Declared supplier bases, approximate factors and original reasons are retained
as review evidence. They are not silently rewritten or used to invent another
net. Nonzero line discounts/charges, document charges, withholding, prepayments,
unsupported source exchanges and explicit payable/tax rounding remain blocked.
Recipient/supplier identity, units, quantity limits, tax arithmetic/exemptions,
source integrity and unsupported formats cannot be waived through this approval.

The supplied DEK structure is covered by this explicit variant; its real staged
record receives no automatic resolution, mapping or posting. Synthetic fixtures
exercise equivalent discount behavior without real identifiers or content.

## Receipt plan and accounting policy

This step receives the complete invoice once. The requester explicitly confirms
physical receipt of every invoiced quantity; pool allocations must equal that
quantity. Differences require correction/review before proceeding. Partial
physical receipts, goods-received accruals and supplier credit notes need a later
coordinated workflow. Multiple invoices may still match portions of an approved
purchase order under the existing remaining-order-quantity guard.

Posting settings explicitly select active company accounts: stock ASSET (for
example 153), supplier payable LIABILITY (320), and a deductible VAT ASSET account
for each source rate (for example 191.10). Account prefixes never infer policy.
The optional separate rounding account handles only base-currency conversion
rounding. Existing stock-close reconciliation account mappings remain explicit
and are configured separately; this adapter does not silently change them.

Each source line chooses `DEDUCTIBLE`, `CAPITALIZE` or `NONE`. Taxed lines retain
the accounting basis for deduction/capitalization; NONE requires zero source VAT.
Deductible VAT debits its configured rate account. Capitalized VAT increases that
line’s stock cost. Zero-rate/exempt and free goods preserve original evidence.
This records an authorized accounting choice; it does not determine statutory
deductibility or create a VAT refund attribution/claim.

For the user's example the preview and posted journal are:

| Account | Debit TRY | Credit TRY |
|---|---:|---:|
| 153 | 50,000 | 0 |
| 191.10 | 5,000 | 0 |
| 320 | 0 | 55,000 |

Several SKU/VAT lines produce separate goods/VAT journal lines and one payable
line. Retained receipt-line details identify invoice and approved order sources,
VAT choice/basis, exact native/base amounts and goods/VAT journal line numbers.
Posted reads join the stock source line and inventory layer. The receipt header
links the exact stock receipt and posted journal; journal source is the invoice
UUID record ID under reserved `PURCHASE_INVOICE`.

Invoice/base currencies may differ. A positive six-place rate states base
currency per source currency unit, with date and evidence. Same currency requires
rate 1; evidence cannot be dated after posting. Native net/VAT/payable amounts stay
retained. Conversion rounds each stock/VAT amount once to six places; any small
remaining difference uses the configured conversion-rounding account. Its amount
is bounded by the number of rounded components and shown in the preview.

Exact source value is authoritative. Quantity 3 and stock value 100 retain rounded
unit cost 33.333333 and exact layer value 100.000000. Pool values allocate that
exact total by integer largest remainders. m014 widens stock value checks for this
authorized source, preserves multiplication guards for test fixtures, and requires
purchase stock lines to match the approved receipt. Layers must match their source
line exactly. No quantity/value precision or global unit-cost type is changed.

All-zero free goods create zero-value stock and no nominal journal. A financial
journal requires positive balanced lines under the existing accounting contract.

## Workflow, atomic posting and dependencies

Receipt state is ASSEMBLING → REQUESTED → APPROVED → POSTING → POSTED. Assembly
and posting transitions occur inside transactions, with rejected/cancelled
requests retained. One active/posted receipt is allowed per invoice. Cancelling
an unposted request or rejecting review releases that active slot, preserving all
old plans, lines and decisions. Terminal history cannot be edited or deleted.

Approval and posting rebuild the complete receipt plan from current references,
account policy/labels, invoice review/resolution, quantities and currency evidence.
A changed context requires cancelling the unposted plan and requesting a fresh
review. Active SKU/family/unit, warehouse, pools and receipt movement are checked;
both inventory and accounting periods must be open. Existing stock-close locks
and mapped-account locks still apply.

Posting commits stock receipt/source layers, receipt event, immutable physical
and pool ledgers, balances, balanced journal, source lineage, audit and retry
record in one entity transaction. Journal/stock/audit failures roll everything
back. Batched SQL does not break atomicity. Same-key or same-source repeated and
concurrent posting returns the original POSTED result.

Public manual journals and posting requests cannot claim PURCHASE_INVOICE; an
additional database guard requires an approved receipt in POSTING with its
retained journal hash. Existing test-fixture posting remains unavailable outside
an explicitly isolated test database. There is no generic public stock source
override or direct purchase journal endpoint.

An active/posted receipt blocks invoice cancellation or return to mapping.
Cancel an unposted receipt first. Posted purchases retain their invoice approval
and cannot be reposted. A stock-only exact reversal of a purchase receipt is
blocked because it would leave supplier payable/VAT behind; coordinated financial
reversal/credit-note support remains future work. Existing reviewed counts and
revaluations retain their existing explicit GL reconciliation responsibilities.

## Verification and limits

There is no fixed business line ceiling. Source XML keeps its existing 750,000
UTF-8 byte/structural budget, JSON remains 1 MiB, SQL writes batch at 250 rows,
and reads/editors page at 25–100 rows. Tests post 301 lines and 603 journal rows.
Source VAT is validated and preserved rather than inferred from current tax rates.
Full XSD/Schematron/signature validation and live İZİBİZİ connectivity remain
outside this stage.

Run `npm --prefix backend run test:pr03c` for isolated integration checks and
`npm --prefix backend run test:pr03c:release` for existing domain regressions,
OpenAPI, frontend lint/build and isolated browser checks. The local development
upgrade requires a verified backup and source/history comparison; see the
[handoff](../pr-handoffs/PR-03C.md). Next is PR-04A export packing-list intake,
export cards, country allocation and shipment linkage.
