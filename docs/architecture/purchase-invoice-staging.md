# Purchase invoice staging and source matching — PR-03B

**Current extension:** PR-03C is now implemented in m014; read the
[purchase receipt/accounting contract](purchase-receipts.md). The original
staging/foundation delivery below retains its dated boundaries. Next is PR-04A.

Implemented 27 October 2026. Purchasing → Invoice imports stages **incoming
supplier purchase invoices**, retains original XML/source lines and appends
mapping revisions for independent matching review. m013 adds six tables,
bringing the schema to 69 tables. Existing m001–m012 sources are preserved.
Stock receipts and automatic balanced 153/191/320 integration remain PR-03C.

## Reference and supported import contract

The [İZİBİZİ documentation](https://dev.izibiz.com.tr/guide/e-fatura-baslarken/e-fatura-genel-bilgilendirme)
identifies UBL-TR as its invoice exchange format. Namespace handling follows
[OASIS UBL 2.1](https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.html).
This application implements the explicitly limited **UBLTR-STAGING-1** extraction
and matching contract below. It does not claim full GİB XSD/Schematron validation,
signature authentication, supplier acceptance or legal VAT deductibility.

- One UTF-8 XML 1.0 `Invoice` document, with UBL 2.1 / TR1.2 metadata. Basic,
  commercial and e-Arşiv SATIS/ISTISNA profiles are supported for arithmetic
  checks. Unsupported profiles/types are staged with blocking exceptions.
- Supplier and invoice customer each carry one VKN or TCKN PartyIdentification.
  VKN is ten digits and TCKN eleven. This is identity format/matching validation,
  without statutory authentication. A separately configured company receiving
  identity must exactly match the XML customer before submission.
- Stable invoice UUID, invoice number/date, TRY/USD/EUR/GBP document currency,
  positive quantities/base-price quantities, explicit source unit codes, item
  names/codes and nonnegative monetary values. Every invoice line is retained;
  repeated SKUs remain distinct source lines.
- Each line's quantity × price / price-base quantity is compared with its declared
  net amount using that source amount's decimal scale. Source price strings retain
  up to 18 meaningful fractional digits; more than six meaningful places remain a
  blocking pricing-adapter exception. Trailing zero places are normalized exactly
  for comparison, while the original lexical value remains in XML/source JSON.
- Amounts/quantities use the existing DECIMAL(20,6) contract. VAT is checked from
  explicit `0015` treatments, taxable bases and rates; line VAT uses half-up
  rounding to two places. No list of statutory rates or deduction policy is
  inferred. Zero-rate VAT needs the retained exemption code/reason. Mixed rates
  on different lines are supported. Header VAT groups must equal the sums of
  retained line treatments, including legitimate per-line rounding.
- Net plus VAT, gross/payable and source-line/document totals reconcile exactly
  without unhandled adjustments. Nonzero line/document discounts or charges,
  withholding, additional taxes, prepayments, explicit rounding adjustments and
  real currency conversion remain blocking exceptions. Zero-value line allowance
  entries and same-currency rate-one exchange metadata are retained and accepted.
  Declared document tax-exclusive net is displayed separately from the source
  line-extension total; neither is silently rewritten to match the other.

Use an İZİBİZİ **XML export**, without ZIP, SOAP or envelope wrapping. PDFs are
reference documents and have no import endpoint. The strict namespace-aware
`sax` parser rejects malformed XML, duplicate scalar cardinality, DTD/entity
declarations, unknown entities, invalid characters and structural resource
excess. External references, signatures, XSLT and embedded attachments are never
fetched or executed. The browser decodes UTF-8 with fatal error handling and
preserves a BOM. Source is downloaded as an attachment, not rendered as HTML. Protected login
return URLs retain their query and hash so a reviewer returns to the selected
invoice after signing in.

The XML byte budget is 750,000 UTF-8 bytes, depth 64 and 100,000 elements; the
whole API JSON retains its 1 MiB limit. There is no fixed business line-count
ceiling. Reference choices/editor pages show 25 rows, read APIs allow 1–100,
and atomic writes batch 250 rows. Tests cover 301 retained source lines/maps.
These are resource/regression contracts, not a deployment throughput SLA.

## Supplied examples and direction

The user confirmed that the earlier Desktop XML is an **outgoing export invoice**.
It was used only for general UBL structure; it was not imported or treated as
an incoming supplier document. Two supplied purchase PDFs were inspected as
read-only references and contained no embedded XML. Neither source nor extracted
text was added to tracked tests or business tables.

The later incoming supplier XML examples were inspected read-only:

| Example | Observed import behavior |
|---|---|
| EGT…0101 | Three NIU-unit lines, TEMELFATURA / ISTISNA, zero source VAT with exemption evidence and eight-place prices containing trailing zeros. Parser/arithmetic checks pass; actual recipient, supplier/order mapping and independent review remain required before matching approval. |
| DEK…0223 | Three NIU-unit lines, TICARIFATURA / SATIS, 20% source VAT and a document-level discount. Declared line-extension, source prices and discounted line amounts use different bases. Source is preserved and staged with discount/net exceptions; no discount allocation or total correction is invented. |

The implementation/reference checks did not import these files, seed real parties
or post stock/GL. During subsequent final verification, DEK…0223 appeared in the
development app as one STAGED source with three lines and the expected discount
exceptions. That record was preserved; it was not created by the test/setup scripts.
Synthetic fixtures reproduce structural cases without real supplier/customer
identifiers, descriptions or invoice content. Private ignored analysis records
retain source hashes and diagnostics. No outbound/production API was contacted.

## Retained data and workflow

`purchase_invoice_settings` stores the explicit legal-entity receiving identity.
No real VKN/TCKN is seeded. Changing that identity is blocked while REQUESTED or
READY matching exists. Its configuration change is audited and permissioned.

`purchase_invoices` retains original XML, SHA-256, UUID, supplier/customer IDs,
date, currency, profile/type, filename/evidence, native amounts and parsed header
issues. `purchase_invoice_lines` retains source line ID/order, original supplier
code/name text, quantity/unit, price/base, declared amount scale, net/VAT, every
tax treatment and the complete namespace-aware source line tree. Embedded header
data remains available in the full original XML. No source edit/delete API exists.

UUID is unique by tenant/entity across all statuses. An identical retained XML
hash returns the existing record even with a different retry key. Changed XML
bytes under the same UUID conflict. Supplier scheme/tax ID plus invoice number
cannot be staged under a different UUID. Cancellation/rejection never frees
source identity for duplicate import. Import, lines, audit and retry result commit
atomically; malformed required fields/amounts are rejected without partial data.

Lifecycle: ASSEMBLING → STAGED → REQUESTED → READY or REJECTED. ASSEMBLING exists
only inside the import transaction. STAGED, REQUESTED or READY may be CANCELLED
by an authorized invoice reviewer. Cancelled sources remain terminal and readable. An authorized reviewer may return
REQUESTED, READY or REJECTED matching to STAGED for another mapping/review cycle.
This releases matching quantities and clears only the current review fields;
immutable purchase_invoice_decisions retain every prior submission/approval/
rejection/cancellation/reopen context with an ordered sequence. Source XML and
prior mapping revisions stay unchanged. Corrected XML evidence needs a separate
explicit source-correction contract, never overwriting. No business receipt or
posting is performed by READY.

While STAGED, each saved plan appends `purchase_invoice_plans` and a complete
`purchase_invoice_mappings` revision. Updates merge by source-line ID, including
explicit mapping removal; `expectedRevision` prevents lost concurrent edits.
Changing order clears retained order-line links. Prior revisions remain paged
and inspectable. Revisions retain selected partner/order, actor, reason, SKU,
order-line link, unit confirmation, free-goods reason and manual/alias provenance.

Bulk editor selections can span pages. Automatic SKU mapping fills only unmapped
lines using an active **VERIFIED exact supplier code/name alias**. It does not
use fuzzy description, GTİP, VAT rate or price matching, does not create/verify an
alias and never chooses an order source silently. Alias revision ID is retained.
The invoice reviewer still checks the selected SKU/source plan independently.

## Matching and independent decisions

A selected active Turkish supplier partner must match the XML supplier VKN/TCKN.
An approved order must match supplier/currency and not postdate the invoice.
Present XML order references must identify the chosen order. Every source line
must map to an active SKU and line belonging to that order, using its base unit,
quantity precision and approved price at source line-net rounding precision.
Source unit codes differing from the SKU base unit require explicit one-to-one
confirmation with a retained mapping reason; conversions are not supported.
Zero price needs both an approved order free-goods reason and invoice mapping
evidence. Zero-rate VAT is separate from zero price.

Multiple invoice lines may match one approved order line, and partial invoices
are supported. Aggregate REQUESTED/READY invoice quantities plus the current
submission cannot exceed its ordered quantity. Rejection/cancellation releases
that matching commitment. The shared entity lock makes concurrent submissions
consistent. The purchasing order cannot be cancelled until linked pending/ready
invoice matches are cancelled. This does not create an inventory reservation.

Submission runs all source/matching checks and seals the current plan, recipient,
supplier/order and active SKU/reference context. Approval rechecks that context
and other invoice commitments. A changed context produces STALE_REVIEW; source
is never repaired to make a review pass. Approver must differ from importer,
latest mapping author **and** submitter. Review/cancellation reasons are retained.
Reads expose paged blocking exceptions and whether the retained review is stale.
The receiving/stock adapter in PR-03C must revalidate this contract before posting.

## API and permissions

All routes below are under `/api/v1/entities/:entityId/purchasing`:

| Route | Contract |
|---|---|
| GET/POST invoice-settings | Read/configure receiving identity |
| GET/POST invoices; GET invoices/:id | Paged source imports / immutable header with current plan |
| GET invoices/:id/lines | Paged current or explicit historical mapping revision |
| GET invoices/:id/source; GET invoices/:id/lines/:lineId/source | Original XML or full retained line tree |
| GET invoices/:id/validation | Paged source/matching exceptions from a consistent transaction read |
| GET invoices/:id/plans, decisions; POST invoices/:id/mappings | Retained history / append bulk mapping revision |
| POST invoices/:id/submit, approve, reject, cancel, reopen | Scoped, reasoned lifecycle decisions |

Read uses `purchasing.read`. Four new permissions are explicit ADMIN grants in
existing assignments: `purchasing.invoice.import`, `.map`, `.review`, `.configure`.
`workspace.read` is also mandatory. No extra real user is seeded. Every write
requires allowed Origin, authenticated session, JSON, CSRF and Idempotency-Key.
Audit/retry state and business data commit together. Scoped FKs, source/plan
immutability guards, independent-review/state/line-completeness checks and SQL
quantity/dependency guards supplement service validations. No old migration is
edited. m013 verifies its new tables and added order-dependency trigger while
m012 continues to verify its own unchanged contract.

OpenAPI **0.14.0** documents **147 paths**, including fifteen additions and ten
new schemas. The parser is pinned to sax 1.6.1. The existing body-parser lock was
updated from 2.3.0 to compatible 2.4.0 after npm audit identified its compressed-body
DoS advisory; no application policy/API changed. Backend audit then reports zero
known vulnerabilities. PDF reference inspection used only an ignored local tool.

## Verification and next step

```text
npm --prefix backend run test:pr03b
npm --prefix backend run test:pr03b:browser
npm --prefix backend run test:pr03b:release
```

The disposable MySQL harness checks fresh/retained-data migration, rerun/tamper/
recovery, source deduplication, exact text/precision, alias verification, bulk
revisions, HTTP auth/CSRF/idempotency, scopes, unit/VAT/free/price exceptions,
independent review, stale references, concurrency, audit rollback, 301 lines and
no stock/GL side effects. Browser coverage includes upload, configuration,
bulk/manual mapping, revision history, XML download, independent review, duplicate
source, order dependency, mobile, read-only access and protected query URLs.
The release command also runs all existing domain regressions, lint/build,
OpenAPI and journal editor checks.

Next is **PR-03C**: approved invoice/purchase → goods receipt → inventory and
balanced 153/191/320 integration, with explicit discrepancy handling, retained
source links and accounting/VAT policy. Define handling for the supplied discount
variant before it can become a posted purchase. Export invoice generation remains
the later PR-04 family. No legacy workbook or historical balance is imported here.
