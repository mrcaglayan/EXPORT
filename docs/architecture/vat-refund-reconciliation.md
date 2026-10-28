# PR-06A — deductions, KDV1 reconciliation and refund approval

Implemented contract, 28 October 2026. This extends the [source register](vat-source-attribution.md)
and [cost allocation](vat-cost-allocation.md). PR-06B owns submission packages,
cross-period threshold aggregation, payments and offsets. Internal approval does
not file a return, submit a refund request, certify legal eligibility or post a journal.

## Three distinct reviews

1. **Deduction:** identify one original goods VAT source or approved non-stock cost
   source; record its legally deductible amount, tax-event date, book evidence,
   eligibility evidence and prior external source refunds. The immutable posted
   journal supplies the book date and deduction month. Recognized VAT cannot exceed
   original deductible VAT. Prior external refunds cannot exceed recognized VAT.
   One active recognition per source prevents repeated deduction registration.
2. **KDV1 reconciliation:** close the exact full calendar accounting month, finish
   all deduction reviews, and capture every approved deduction for that month.
   Enter the latest return reference/version, declared totals and completeness evidence.
   An export refund requires the approved monthly export allocation basis; finish
   all pending candidate cost reviews first. Freeze that basis and its candidate costs.
3. **Refund request:** select original approved goods/cost candidate lines from the
   reconciled export month. Each source needs an approved deduction included in an
   approved reconciliation for this or an earlier month. Request partial amounts
   explicitly, choose cash/offset and an evidenced procedure, then obtain an independent
   review. Free-of-charge exports need additional legal eligibility evidence.

All three use REQUESTED → APPROVED/REJECTED/CANCELLED. Approved records can become
VOID_REQUESTED, then VOIDED or return to APPROVED after independent rejection of
the void. Original input, calculation, source hashes, approval and sequenced decisions
remain immutable. A requester cannot approve their own request or their own void.
REQUESTED, APPROVED and VOID_REQUESTED reserve amounts; a void request alone releases nothing.

## Return arithmetic and source boundaries

Amounts are TRY decimal strings. Source VAT remains exact to six decimal places;
the sum of current registered deductions is rounded once to two places, half up.
The plan shows the rounding difference. Declared return amounts and the total refund
request must be exact cents; candidate claim lines retain six places.

```text
total deductions = opening carry + rounded registered current input + other deductions
payable VAT = max(output VAT − total deductions, 0)
closing carry = max(total deductions − output VAT, 0) − other refunds − export refund
internal export budget = declared export refund − prior external export requests
source capacity = recognized deduction − prior external source refunds − active internal claims
candidate capacity = original candidate VAT − active internal claims against that line
```

Reported totals must match; the application does not silently adjust them. Each
claim must fit both its candidate and original source capacities and the remaining
return budget. A source shared by several exports is counted once across claims
and periods. External claims are explicit reviewed facts: the application cannot
discover filings made outside it.

The opening baseline requires evidence. Every later active reconciliation follows
the immediately preceding approved month and takes its closing carry unchanged.
Domestic-only months use no export basis and zero export refund. Corrections unwind
later months and dependent requests first. Declared refunds reduce carry even if
their internal requests have not yet been created. Cancelling a request does not
restore carry without correcting the return and its reconciliation.

Output VAT, other deductions and non-301 refund amounts are evidenced manual
return inputs. They do not create claimable original source VAT. This is not an
automatic all-sales GL reconciliation, historical VAT import or PDF/OCR importer.
The posted journal date is the supported legal-book date; external book-date adapters
require a later explicit contract.

## Actual form reference

The user supplied a July 2026, three-page KDV1 PDF. It was inspected read-only to
confirm labels and multiple refund categories. No taxpayer identity, real amounts,
document bytes or historical balances enter tracked fixtures or business tables.
Test data is synthetic.

| KDV1 form label | Application field / treatment |
| --- | --- |
| Önceki Dönemden Devreden | Opening carry; linked to prior approved month or evidenced baseline |
| Yurtiçi Alımlara İlişkin KDV and other deduction rows | Registered deductions plus evidenced other deductions |
| İndirimler Toplamı | Declared total deductions, checked against the above |
| Toplam Katma Değer Vergisi | Output VAT including additions |
| 301 – Mal İhracatı / Yüklenilen KDV | Reviewed export basis and the return's allocated 301 refund amount |
| Other exemption/withholding refund categories | Other refund amount; evidenced breakdown separate from 301 |
| İade Edilmesi Gereken KDV | Export plus other refunds; bounded by unabsorbed period VAT |
| Ödenmesi Gereken / Sonraki Döneme Devreden KDV | Declared payable / closing carry, both reconciled |

If available refundable VAT limits several categories, the accountant must evidence
the split; the 301 loaded-VAT row is not blindly treated as a cash entitlement.
This preparation workflow supports standard goods export code 301, not manufacturer
code 338 or claims under the other categories on that sample.

## Reviewed legal policy

Version `TR-301-2026-10-28` supports transaction months April 2025–December 2029;
another period needs a reviewed version. Tax rates remain evidenced monthly inputs.

- Deduction follows legal-book recording within the following-calendar-year window.
  Account 191 alone does not establish eligibility. [GİB Law 3065](https://gib.gov.tr/mevzuat/kanun/436)
- Standard goods exports use an ordinary ceiling based on the applicable general rate;
  direct-load excess requires tax inspection. Cash above TRY 50,000 needs an applicable
  report/guarantee procedure. The request deadline is the end of the second following
  calendar year. The TRY 10,000 processing minimum, effective for transactions from
  April 2025, is not subtracted. Small requests await aggregation. Claimed VAT cannot
  also remain in carry. Current full-exemption rules do not use the lowest intervening
  carry as an automatic source cap.
  [GİB consolidated communiqué, II/A-1 and IV/A](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2Fkdv_genteb.pdf)
- The official 55-series explanation confirms the updated processing minimum.
  [GİB explanatory note](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=DUYURU%2FUNIVERSAL%2F2025%2FKDVSerno55Teb_abn.pdf)

Checks aggregate period requests, including evidenced external amounts, so splitting
requests does not reset limits. Above-ceiling or review-required cases need TAX_REVIEW.
Other cash requests above the threshold require YMM, GUARANTEE or TAX_REVIEW and
evidence. Proposed filing follows the export month, cannot precede today's Istanbul
date and must meet the deadline; approval rechecks it. This records a planned procedure,
not receipt of a final external report.

WAITING_AGGREGATION and DOCUMENT_REVIEW_REQUIRED are dated calculation results,
not live submission statuses. PR-06B must recompute processing readiness, verify current
law/documents and record actual timely filing. Other refund categories can contribute
to legal threshold aggregation; PR-06A conservatively uses only export requests and
leaves cross-category/cross-period assessment to PR-06B.

## Persistence, authorization and corrections

m019 adds six scoped tables: `vat_deductions`, `vat_reconciliations`,
`vat_reconciliation_deductions`, `vat_refund_requests`, `vat_refund_lines` and
`vat_refund_decisions` (106 total). Applied m001–m018 remain unchanged. Composite
foreign keys, immutable lines/history, independent transition guards, amount checks
and scoped indexes supplement application checks. Entity locking, idempotency,
lines, decisions and audit share one transaction. Migration verification checks exact
columns, indexes/FKs, CHECK presence and trigger bodies; interruption needs explicit recovery.

Active reconciliations prevent deduction changes, changes to their export basis or
candidate costs, and reopening their accounting calendar. Active deductions prevent
voiding original cost sources. Dependent claims prevent voiding either their export
reconciliation or source-deduction month. Goods are frozen through the PR-05B basis.
PR-06B must additionally protect submitted/settled claims until an evidenced external
withdrawal/amendment permits release.

Routes are under `/api/v1/entities/:entityId/vat`: `deductions`, `reconciliations`,
`refund-requests`, their previews/decisions/actions/lines, `refund-periods` and
`reconciliations/:id/candidates`. Reads require `vat.read`; writes use six
`vat.{deduction,reconciliation,refund}.{request,review}` permissions. Writes/previews
require session, same-origin CSRF and JSON; persisted writes require idempotency keys.
No business line-count ceiling: reads cap at 100, UI pages at 25, inserts batch at
250 and JSON requests remain limited to 1 MiB.

The VAT panel retains sidebar-only navigation, invalidated previews after edits,
independent review controls, paged selection, retained evidence and responsive tables.
No business history, tax returns, claims or users are seeded.

## Verification

`npm --prefix backend run test:vat-refund` covers migration/rerun/drift/recovery,
dates, arithmetic, limits, goods/cost provenance, prior external refunds, 301-line
claims, races, independent review/void, rollback, authorization and carry corrections.
`npm --prefix backend run test:pr06a` adds OpenAPI, lint/build, all earlier domains
and browser workflows. See [the handoff](../pr-handoffs/PR-06A.md) for recorded results.
