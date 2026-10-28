# PR-05B contract — costs, overhead and ATİK

Implemented 28 October 2026 (Europe/Istanbul). Preserve applied
m001–m018 after local application. PR-06A remains responsible for KDV1 reconciliation and final claimability.

## Approved source facts

Non-stock expense/asset VAT uses retained supplier invoice lines and explicit
links to already POSTED VAT debit journal lines. Accounting offers a non-stock
supplier-invoice journal type, using VAT_COST_INVOICE and the original XML UUID.
VAT registration/allocation does not create stock or post the expense again.
A source requires independently reviewed invoice identity,
dated exchange rate, deductible amount, account and supporting evidence. It cannot
reuse a PR-03C goods receipt line or its VAT journal. Conversely, goods receipts
cannot consume an invoice with a posted non-stock journal, including before VAT
registration and after analytical void. Journal debit commitments and original invoice-line uniqueness prevent
multiple registered sources from creating the same deductible VAT twice.

DIRECT_CHARGE, OVERHEAD and ATIK are explicit source categories. An ATİK source
identifies one asset and its first-use date; its reviewed unrecovered-VAT calculation
basis cannot exceed its original deductible VAT. Grouped assets or special schemes
are not inferred from their account code. All amounts/currency/source evidence
remain separate from inventory cost. Source approval does not certify KDV1 recovery.

## Period basis and priorities

An independently reviewed monthly allocation basis captures approved PR-05A goods
attribution lines, their accepted customs dates and candidate VAT. Pending goods
reviews or corrections block it. It also records evidenced eligible turnover, total
turnover, VAT-free acquisition value and applicable general VAT rate; no legacy
example percentage is hard-coded. The analytical ordinary ceiling is the positive
eligible value less VAT-free acquisition value multiplied by that reviewed rate.
This is a working ceiling pending PR-06A legal/reconciliation checks.

Active period bases freeze changes to candidate goods attribution in their month.
To correct that baseline, release dependent cost allocations, independently void
the basis, and request a new review. Approved customs and original invoices remain
immutable. Later accepted exports must enter a new reviewed basis before allocation.

Cost allocations reserve their original source basis while REQUESTED, APPROVED or
VOID_REQUESTED. A request targets retained goods-attribution lines with explicit
positive weights and relationship evidence. Six-decimal largest-remainder splitting
conserves the complete amount across all targets without a fixed line ceiling.

- Direct charges use the explicitly linked source basis; exceeding the ordinary
  ceiling remains an exception for PR-06A rather than automatic refund authorization.
- Overhead first apportions its source basis using eligible/total period turnover,
  then applies remaining ceiling after goods and direct charges. Non-export and
  ceiling-limited portions remain visible and cannot be reused as another expense.
- ATİK uses the asset's cumulative eligible/all-use turnover from its first-use
  date, subtracts prior committed shares, floors a negative difference to zero,
  and applies remaining headroom after direct costs and overhead. Each period
  recomputes the ratio; an unused earlier amount is not carried directly forward.
  Inputs are cumulative from first use, including domestic-only months without
  an allocation basis. Eligible and total values cannot decrease; added eligible use
  must fit added total use. Periods proceed chronologically with prior approved history. Corrections unwind dependent later periods first.

Candidate priority is goods/direct charges → overhead → ATİK. Later-priority
commitments block additional earlier-priority candidates or corrections that would
invalidate their basis. HOLD and EXCLUDED preserve amounts/evidence separately from
candidate totals. Independent approval and evidenced void retain all original lines
and sequenced decisions. PR-06A must add claim dependencies before claiming any amount.

## Verification and scope

The source, period and allocation UI uses paged selectors, preview, independent
review/correction and audit. It uses existing session/CSRF, entity lock, idempotency and
transactional audit. Disposable tests cover original-source dedup and goods collision, mixed currency,
exact allocation/residuals, ceilings/priorities, ATİK decreasing ratios and multiple
periods, independent review, cancellation/void dependencies, races, rollback, scope,
301 lines, migration recovery and mobile/read-only behavior.

No actual business imports, VAT registrations, expense postings, historical opening
balances, claims or new local accounts are part of implementation/setup. Read-only
reference material informs design; write tests use disposable synthetic fixtures.

Primary basis: GİB [VAT General Application Communiqué, IV/A3-1.2–1.3](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2Fkdv_genteb.pdf),
including its current cumulative ATİK text (PDF pages 276–278), and GİB
[VAT refund list guidance](https://intvrg.gib.gov.tr/intvrg_duyuru/kdv_iadesi_duyuru_yeni.html).
This analytical workflow retains evidence for professional review; it does not
issue a legal certification or substitute for the subsequent period/claim controls.

PR-06A now adds deduction, reconciliation and claim dependency guards through m019. See [the reconciliation contract](vat-refund-reconciliation.md); applied m018 remains frozen.
