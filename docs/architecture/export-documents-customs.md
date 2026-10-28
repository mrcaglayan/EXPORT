# Outgoing invoices and customs evidence

Implemented in PR-04B, 27 October 2026. This is a register of externally issued
invoices and externally registered customs documents, with exact quantity/source
matching and independent evidence review. It does not issue/transmit e-documents,
submit customs declarations, post export sales/COGS journals, calculate attributable
VAT or establish a refund claim. PR-05A implements the separate [input VAT source register](vat-source-attribution.md) and accepted-source attribution in m017. PR-05B is next.

## Outgoing source and matching

Exports → Outgoing invoices retains the original UBL-TR XML, SHA-256, UUID,
exporter/number, original line identities, price, net, actual VAT, buyer and profile.
Identical UUID/bytes replay; different bytes under that UUID or a reused exporter
invoice number conflict. Cancelled sources and prior mappings remain retained.

Explicit exporter VKN/TCKN configuration is required before matching approval.
An active requested/approved invoice prevents replacement of that identity.
The original seller must match it. The original BuyerCustomerParty is used when
present; otherwise AccountingCustomerParty supplies the buyer. A gateway receiver
is not silently treated as the foreign customer. Source buyer identifiers/country
are checked when supplied, and a person must explicitly confirm the customer and
retain identity evidence against the export card.

The strict parser accepts supported UBL 2.1/TR1.2 TEMELFATURA, TICARIFATURA,
EARSIVFATURA and IHRACAT sources, with SATIS or ISTISNA type. Namespace, DTD/entity,
resource, decimal, line/tax/subtotal and total checks apply. Unsupported adjustments
remain blocking source exceptions. This is not full GİB XSD/Schematron conformance
validation. It does not certify the legal use of a source profile or exemption.

The supplied outgoing reference was EARSIVFATURA/SATIS with 20% VAT. Its profile
and VAT are preserved; it is not silently converted to IHRACAT/ISTISNA or zero VAT.
Purchase-import parsing continues to use its existing recipient and profile rules.
Foreign currencies and source exchange-rate evidence remain original source facts;
this stage performs no conversion or accounting posting.

Each complete mapping revision links every original invoice quantity to one or
more approved/reserved/dispatched shipment lines from one approved export card.
One original line cannot silently combine different SKUs. Base-unit precision and
one-to-one unit confirmation apply. Invoice allocation totals must equal every
source line exactly; requested/approved invoices cannot consume a shipment's
quantity twice. Pending commitments and approval rechecks take the common entity
lock, including concurrent requests.

Workflow: STAGED → REQUESTED → APPROVED or REJECTED. Importer, mapper and submitter
cannot approve/reject their own matching. Reopening appends a later mapping revision.
Current-reference hashes prevent stale approval. Dispatch alone does not invalidate
matching; it changes operational status without changing the matched source.
Independent renewal rechecks current references while preserving the approved plan
and all earlier decisions. Active customs dependencies prevent invoice reopen/cancel.

## Broker declaration and source quantities

Exports → Customs declarations records a declaration reference, registration date,
customs office, broker, external evidence and an explicit transaction basis:
STANDARD_EXPORT, FREE_OF_CHARGE, TEMPORARY_EXPORT or RETURN_EXPORT. Price or VAT
does not select a type. These labels do not implement return stock movements,
temporary-export discharge or a legal tax determination.

Each declaration line selects an approved invoice allocation and an actual
DISPATCHED issue line belonging to that exact shipment/SKU/reservation source.
One declaration uses one export card and a consistent approved transaction type.
Quantities cannot exceed either the invoiced allocation or the physical issue
line, across pending and approved declarations. Registration may precede dispatch;
the retained physical issue must exist before source matching can be requested.

Declared 12-digit GTİP must equal the selected SKU's VERIFIED history entry for
the registration date, including broker name/reference. Merely valid digits or
an unverified catalogue value are insufficient. The declaration retains the full
broker, invoice, shipment, issue, layer and purchase-receipt source snapshot.
Current references are rechecked before independent approval. A later GTİP end
date/retirement does not rewrite already accepted declaration facts. A stale
pending request must be cancelled and recorded again with fresh evidence.

## Partial exits and final closure

An approved declaration accepts separately evidenced exit requests. Each request
selects original declaration lines and exact confirmed quantities. Pending requests
reserve quantity, while only independently APPROVED exits contribute to accepted
totals. A recorder cannot approve/reject their own evidence.

Exit date cannot precede registration or the selected physical dispatch. Final
closure requires prior APPROVED exits plus the current request to cover every
declared quantity exactly. An empty-line final record may close already fully
accepted quantities. Closing date cannot precede its exit date, any earlier
accepted exit, or linked dispatch. Only one pending/approved final record is allowed.

Closure is derived from accepted final evidence; declaration status remains
APPROVED. Approved exits cannot be cancelled, deleted or edited. A declaration
cannot cancel with pending/approved exit dependencies. Rejected/cancelled references
remain retained; a new request uses a new reference. Rejection/cancellation releases
pending quantity commitments without erasing source history. A coordinated legal
correction/reversal process for accepted facts remains later work.

## Permissions, storage and resources

All routes use `/api/v1/entities/:entityId/exports`, existing session/entity
authorization, allowed Origin, CSRF, request IDs, idempotency, audit and transactional
entity locking. Read permission is exports.read. Explicit writes are
exports.document.configure/import/map/review and exports.customs.request/review.
Existing ADMIN roles receive these six permissions; other roles are unchanged.
Independent review still requires a different authorized person.

m016 adds eight scoped tables: export_document_settings, export_sales_invoices,
export_sales_invoice_lines, export_sales_plans, export_sales_allocations,
export_customs_documents, export_customs_lines and export_compliance_decisions.
Composite FKs, immutable-source/history triggers, independent review and quantity
guards supplement service checks. Active outgoing dependencies also prevent card
or shipment cancellation. Applied m001–m015 remain frozen.

No fixed business line ceiling is imposed. The existing 1 MiB JSON and 750,000-byte
XML limits remain; atomic inserts batch at 250, reads page at up to 100 and editors
mount 25 rows per page. Complete mapping/source arrays are loaded for exact totals
and saved atomically. The integration suite exercises 301 invoice/declaration/exit
lines. This is a tested local workload, not a production performance guarantee.

The sidebar-only layout is retained. Outgoing invoices, Customs declarations and
Exit evidence have paged lists, retained detail/history, URLs, reload and mobile
support. No global header or separate page-introduction block is introduced.

## Reference basis and boundaries

Official references consulted 27 October 2026 explain why invoice issuance,
registration and confirmed exit must remain separate. The older guides are used
for workflow/UBL context, not asserted as current complete technical conformance:

- [GİB customs e-invoice guide, July 2016 v1.1](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-Fatura_Uygulamasi_gumruk_islemleri_Kilavuzu.pdf).
- [Ministry customs e-invoice guide v1.1](https://efatura.gtb.gov.tr/files/Kilavuz.pdf).
- [GİB explanation of customs export and document scenarios](https://gib.gov.tr/mevzuat/kanun/436/ozelge/24933).
- [Ministry export FAQ](https://ticaret.gov.tr/gumruk-islemleri/sikca-sorulan-sorular/ticari/ihracat).
- [GİB VAT General Application Communiqué](https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Ffileadmin%2Fuser_upload%2FTebligler%2FKDV%2Fkdv_genteb.htm).

The application stores supplied evidence and human review decisions. Gateway
messages/status polling, signatures, external cancellations, full customs-value
fields, live integrations, foreign-currency export journals, regulatory returns,
VAT attribution/refund rules and historical imports require separate work.
