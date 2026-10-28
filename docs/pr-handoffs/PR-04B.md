# PR-04B handoff — Outgoing invoice matching and customs evidence

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Implemented **27 October 2026 (Europe/Istanbul)**. Next is **PR-05A: input VAT
source register and source-layer attribution to accepted customs quantities**.

## Delivered behavior

Exports now includes Outgoing invoices, Customs declarations and Exit evidence.
Externally issued UBL-TR XML retains its original bytes/hash, UUID, seller, actual
buyer, source lines, profile and VAT. Duplicate UUID/content replays; conflicting
UUID or exporter/number cannot replace a source. Explicit company exporter identity,
customer evidence and complete invoice-to-shipment quantities precede submission.
One original line cannot silently combine different SKUs. Requested/approved
invoices cannot consume the same shipment quantity twice.

Another authorized person reviews the matching independently of importer, mapper
and submitter. Retained mapping revisions, decisions and current-reference hashes
prevent stale approval. Independent renewal preserves the original approved plan.
Approved matching can precede dispatch; dispatch alone does not stale it.

Declaration records retain external reference/date, office, broker, evidence and
an explicit STANDARD_EXPORT, FREE_OF_CHARGE, TEMPORARY_EXPORT or RETURN_EXPORT
basis. Each source links an approved invoice allocation to its actual DISPATCHED
issue line. Exact quantities cannot exceed either invoiced or physical sources.
Broker VERIFIED GTİP must match the SKU, registration date and declared 12-digit
code. Full broker/source snapshots remain retained after later catalogue changes.

Partial exits require separate external evidence and independent acceptance.
Pending requests reserve quantity; approved evidence contributes to accepted totals.
Registration may precede physical dispatch, while confirmed exit cannot precede
registration/dispatch. Whole stock units cannot be fractionally cleared. Final
closure requires exact full accepted quantities and consistent closing/exit dates.
Already accepted full quantities can close with a separate zero-line final record.
Accepted exit facts remain immutable and retain their invoice/declaration lineage.
Dependent outgoing/card/shipment cancellations are blocked.

The workflow is a local evidence register. It performs no live e-document issuing
or transmission, customs submission, export sales/COGS journal, VAT attribution,
deduction/refund calculation or claim. It does not certify source profile/exemption
validity or full GİB schema conformance. Return/temporary labels do not create a
stock-return or temporary-export discharge adapter.

See [the complete contract and official reference links](../architecture/export-documents-customs.md).

## Reference documents and preservation

The user-confirmed outgoing reference remains the Desktop XML ending
`074E2D18-9380-4AAA-87CF-07BED4F02BCC.xml`. Read-only parsing confirms its original
EARSIVFATURA/SATIS profile, TRY currency, two lines and 20% source VAT, with no
arithmetic exceptions or change to its saved hash. It is not silently converted
to an exempt IHRACAT invoice, and it was not imported or posted locally.

The earlier supplier XML/PDF and optional multi-sheet packing XLSX remain
unchanged. No actual workbook or invoice rows were seeded by PR-04B. Direct XLSX
selection/reconciliation remains a separate adapter; manual/CSV packing intake
continues unchanged. Existing purchase parser behavior remains independently tested.

## Files and contracts

- m016_export_documents_customs adds eight scoped tables and six explicit ADMIN
  permissions. Composite FKs, source/history immutability, independent-review,
  exact-quantity and dependency guards supplement transactional services.
- New sales/customs services, validators and routes use existing session/CSRF,
  entity locking, idempotency and audit under `/api/v1/entities/:entityId/exports`.
  All writes are atomic; failed audit leaves no accepted evidence or retry response.
- Exports adds source intake/download, exporter settings, complete paged matching,
  broker choices, independent review/history, declaration/exit recording and closure
  detail. URLs, refresh, reload, reader permissions and mobile views are covered.
  Sidebar-only layout remains; no global header or separate introduction was added.
- OpenAPI **0.17.0**, **228 paths**; roadmap **v1.18**, design baseline **v14**.
  Authoritative/reference SQL and specification copies match. Current handoff,
  bootstrap and build pointers identify PR-05A; older dated scopes remain historical.
- No dependency, commit, push, deployment, new local user or business posting was
  introduced. Applied m001–m015 remain byte-for-byte frozen; m016 is now frozen too.

No fixed business line-count limit was added. JSON remains 1 MiB, original XML
750,000 UTF-8 bytes, atomic insert batches 250, read pages up to 100 and editors
25 rows. Complete arrays still determine exact totals; 301-line workflows are
tested. This measured local workload is not a production performance guarantee.

## Executed checks

The release and focused integration scripts were invoked directly with Node;
their equivalent npm aliases are shown below for reuse.

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr04b:release` | PASS: OpenAPI, frontend lint/build, journal editor, foundation/auth/accounting/catalogue, every inventory stage, purchasing, incoming invoices/receipts, exports, export compliance and full isolated browser |
| `npm --prefix backend run test:pr04b` | PASS: 12 checks including retained/fresh schema, tamper/recovery, actual profile/VAT, source dedup, independent renewal, partial/final exits, quantity races, broker/date/stale guards, explicit types, whole units, audit rollback, 301 lines and HTTP scope/CSRF/idempotency |
| Focused isolated browser | PASS: outgoing intake/mapping/review, broker declaration, partial exit/final closure, source lineage, reader controls, reload and mobile; all earlier domain screens also pass |
| Frontend lint/build | PASS: 2,189 modules |
| OpenAPI validation | PASS: 228 paths, exact request/response and permission/Origin/CSRF contracts |
| Reference-copy/SQL/frozen-source/backup hash checks | PASS |
| Local migration and verification rerun | PASS: m016 applied once; 16 applied migrations, 90 tables |
| Retained row/history/source fingerprints | PASS: old business data and m001–m015 preserved; only expected permission/role-permission/migration-history additions |
| Saved-account local desktop/mobile/reload | PASS: new controls/empty document lists/settings, two retained STAGED invoices/six source lines, no runtime errors; own session logged out |

All write tests use disposable schemas and synthetic accounts/source documents.
The browser fixture reuses an existing synthetic date-range GTİP entry, confirms
whole-unit quantities and waits for accepted review state before the next actor
refreshes. Historical migration recovery tests stop at their own registry version
before upgrading; they do not rewrite earlier migrations.

## Local upgrade and runtime

Verified backup: `.local/backups/pr04b-before.sql`, **1,121,155 bytes**; raw
SHA-256 and completion metadata are in `.local/pr04b-backup.json`. Before/after
fingerprints and `.local/pr04b-verification.json` record the upgrade. All eight
new tables are empty. Both earlier purchase invoices retain STAGED status and
their six original lines. No real exporter identity, outgoing matching, declaration,
exit, stock movement or journal was configured/created by setup.

The two saved project Node processes were checked against their metadata, process
identity and listening-port ownership before restarting. The API is ready at
**3000**; the frontend runs at **http://localhost:5173/exports**. New ownership/log
metadata is retained in `.local/runtime-pr04b.json`. Company, administrator and
password are unchanged. Secrets remain only in ignored local setup files.

Ignored evidence includes source-reference checks, upgrade fingerprints, backup,
runtime/logs and outgoing/customs desktop/mobile screenshots. Temporary PR-04B
inspection/edit/verification helpers are removed at completion.

## Next stage

PR-05A must connect POSTED PR-03C purchase-line VAT facts, currency conversion and
deductible/capitalized treatment to accepted PR-04B quantities through the actual
issue/layer/receipt source chain. Preserve original source VAT separately from
inventory cost, deductible VAT, candidate attributable VAT and future claimable
refund. Prevent duplicate attribution and expose missing/unsupported provenance.
Temporary, free and return transactions require explicit treatment; accepted
customs evidence alone is not a refund determination. No historical migration or
re-posting of existing purchase VAT is authorized. Preserve m001–m016 and all
source, decision, stock, journal and close-version history.
