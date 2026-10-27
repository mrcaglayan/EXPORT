# PR-03B handoff — Incoming purchase invoice staging and matching

**Current status:** PR-03C is implemented; see [its handoff](PR-03C.md).
PR-04A is next. The dated PR-03B delivery below retains its original scope.

Completed **27 October 2026 (Europe/Istanbul)**. Next is **PR-03C: approved invoice
and purchase → goods receipt → inventory plus balanced 153/191/320 integration**,
with explicit mismatch/discount handling. At that handoff PR-03C was not started.

## Delivered behavior

Purchasing → **Invoice imports** stages incoming supplier UBL Invoice XML exports
with original XML/SHA-256, UUID, supplier/customer identities and every source
line. Identical source re-import returns the retained record; changed source bytes
under an existing UUID conflict. A supplier invoice number cannot appear under
another UUID. All rejected/cancelled identities remain retained.

The company receiving VKN/TCKN is explicitly configured before matching submission.
Bulk/manual SKU mapping and verified exact supplier aliases preserve source line
identity. Every line matches an approved order source with exact supplier,
currency, units, quantity precision, price and free-goods evidence. Mixed VAT rates
remain separate line treatments. Checks compare net/VAT/payable arithmetic and
source totals without asserting statutory VAT deductibility.

Mapping plans append revisions, with an expected-revision guard for concurrent
editing. Pending/ready invoice quantities cannot exceed ordered quantities,
including concurrent partial invoice submissions. Source unit codes such as
C62/NIU need explicit one-to-one base-unit confirmation when catalogue unit codes
differ. No conversion or silent SKU substitution is performed.

A person independent of importer, mapper and submitter approves matching.
Current references and the sealed review context are rechecked. An authorized
reviewer can return pending/ready/rejected matching to STAGED to correct mappings;
ordered decision history retains the earlier submission/review context and all
mapping revisions. Reject/cancel/return releases matching quantities. A purchasing
order cannot be cancelled while linked matching remains pending/ready.

READY means matching is approved for the later receipt adapter. This step creates
no stock receipt, inventory event, GL/VAT posting, deduction/refund claim, supplier
acceptance or external API communication. No actual supplier examples, extra
users, recipient IDs, invoices or historical workbook data were imported/seeded.

See [the complete import contract](../architecture/purchase-invoice-staging.md).

## Supplied files and limits

The user confirmed the earlier Desktop XML was an **outgoing export invoice**.
It remains only a format reference for the later export stage. The two purchase
PDFs were inspected read-only and contain no embedded XML. Their real content
was not copied into tracked fixtures.

Two incoming supplier XML examples were inspected read-only:

- EGT…0101: three NIU-unit lines, ISTISNA/zero source VAT with exemption details;
  eight-place trailing-zero prices parse and arithmetic checks pass. Business
  recipient/order mapping and review still need actual authorized configuration.
- DEK…0223: three NIU-unit lines and 20% VAT, with a document discount and differing
  source price/line-extension/discounted amount bases. The source stages with
  explicit blocking discount/net exceptions. No amount correction or discount
  allocation was invented. PR-03C must define the approved handling before posting.

The supported contract is UBLTR-STAGING-1, using strict namespace-aware parsing.
Malformed/unsafe XML is rejected. Nonzero discounts/charges, withholding/additional
taxes, real currency conversion, prepayments, explicit rounding adjustments and
unsupported profiles remain exceptions. Full XSD/Schematron/signature verification
and live İZİBİZİ connectivity are not implemented. External XSLT/attachments are
retained as source and never executed.

No fixed document-line ceiling: 25-row editors, 1–100 read pages and 250-row
atomic write batches remain. XML is limited to 750,000 UTF-8 bytes and the full
JSON to 1 MiB; structural depth/element budgets apply. Tests cover 301 source
lines. Price strings preserve up to 18 meaningful decimal places without
truncation; more than six meaningful places block matching pending a pricing
adapter. Source line amount scale controls price/net rounding comparisons.

## Files, schema and plans

- `m013_purchase_invoice_staging.js`: six new scoped tables, immutable source,
  mapping and ordered decision history, workflow/quantity/dependency guards and
  four explicit ADMIN invoice permissions. Existing m001–m012 sources/tables are
  retained. Thirteen migrations and 69 tables are the new local baseline.
- Invoice XML parser, record/readiness helpers, source/mapping/workflow service,
  validators and routes under `backend/src/`; `frontend/src/pages/purchasing/`
  adds intake, recipient configuration, bulk editor, exceptions, downloads and
  retained line/plan/decision detail. Sidebar-only navigation is preserved.
- Protected login now retains path/query/hash so a reviewer returns to the exact
  selected invoice. Browser tests cover that behavior.
- OpenAPI **0.14.0**, **147 paths**, including fifteen invoice additions and ten
  new schemas. Existing paths/components retain their prior contracts except the
  documented order-cancellation dependency behavior.
- `sax` is pinned to **1.6.1**. Existing transitive body-parser **2.3.0 → 2.4.0**
  resolves its compressed-request DoS advisory. Backend npm audit reports zero
  known vulnerabilities. Frontend dependencies/lockfile are unchanged. PDF
  inspection used an ignored temporary local tool, without adding a project dependency.
- Roadmap **v1.15**, build/bootstrap instructions, README, architecture notes and
  current historical handoff notes identify PR-03C as next. Baseline **v11** and
  reference SQL include all new tables/triggers; authoritative/project-root copies
  match. Historical delivery results keep their original scope/context.

## Executed checks

| Check | Result |
|---|---|
| `npm --prefix backend run test:pr03b:release` | PASS — complete sequential release gate |
| Invoice parser and integration | PASS — 22 tests including the integration parent: namespace/cardinality/security/resource guards, source precision/rounding/zero/mixed VAT, 301 lines, fresh/retained migration, rerun/recovery/tamper, UUID/number deduplication, source trees, exact verified aliases, mapping revisions, recipient/unit/price/quantity/scope guards, independent/stale review, ordered return/review cycles, contention, audit rollback, HTTP session/CSRF/idempotency and no stock/GL effects |
| Foundation / auth / accounting / products / classification | PASS — 22 / 14 / 16 / 12 / 15 tests |
| Inventory / receipts / allocations / reservations / close / corrections / purchasing | PASS — 11 / 13 / 13 / 14 / 14 / 11 / 15 tests |
| Journal editor | PASS — 7 tests |
| Frontend lint/build and OpenAPI | PASS — 2,173 modules, lazy-loaded purchasing bundle, all 147 paths validated |
| Full isolated browser workflow | PASS — prior workflows plus XML file intake, recipient identity, bulk/manual mapping, VAT/free sample, unit exception, saved revisions, independent review and return cycle, original XML download, duplicate source, order cancellation guard, query return/reload/back, entity isolation, read-only access and phone layouts |
| Local backup / migration / rerun | PASS — private SQL backup; m013 applied once, thirteen migrations verify on rerun |
| Local before/after comparison | PASS — prior rows/columns/history and source hashes preserved; all six invoice tables empty |
| Local app and invoice checks | PASS — existing company/admin, four scoped invoice permissions, initially empty source/configuration reads; later current DEK source/three lines and blocking exceptions preserved, form guards, mobile/sidebar layout, clean runtime and logout; no business writes by these checks |
| Local general smoke, screenshots, baseline copies and diff checks | PASS |
| Backend dependency audit | PASS — zero known vulnerabilities |

The first browser passes exposed two test/UX details: protected login dropped
query parameters (fixed in RequireAuth), and broad READY/source-unit text locators
needed to wait for the retained detail instead of matching list options. Price
source precision and source-net rounding were refined from the supplied examples,
then tested with synthetic equivalents. Review return was added before local
migration so stale/rejected matching does not trap an immutable invoice source.
No development migration recovery or source-history rewrite was required.

The existing PR-02 capacity benchmark was not repeated because this step does
not change stock services/triggers. It remains available separately. Disposable
test schemas and accounts were removed by their harnesses.

After the final screen review, Purchasing tabs were adjusted to keep the selected
tab fully visible on a phone, including a direct Invoice imports URL. Lint/build,
local screen checks and the full isolated browser workflow were rerun afterwards.

The migration/initial local checks found all six invoice tables empty. During
final verification, DEK…0223 appeared in the development app as one STAGED source
with three lines, matching the supplied source hash. That record was preserved;
checks were adapted to read its retained exceptions without changing it. It was
not imported by the implementation/test scripts. Current recipient configuration
and mapping/decision tables remain empty at this check.

## Running locally and next step

Open **http://localhost:5173/purchasing?view=invoices**. Repository MySQL, API 3000
and UI 5173 are running. Company **abc A.Ş.**, administrator **admin@gmail.com**
and the existing password are retained. No real receiving tax ID or additional
independent reviewer was seeded; those must be supplied through the authorized
company/identity setup before real review.

Ignored backup, state hashes, sample-analysis records, screenshots, runtime logs
and verification remain local. Full extracted PDF reference text and temporary
setup/inspection tools were removed. No actual document import, commit, remote
pull request, supplier response or deployment was performed by this work. The
subsequently staged DEK development record described above is retained.

PR-03C must revalidate READY matching at posting, define discount/discrepancy
resolution and TRY valuation/account/tax policy, and commit source-linked receipt,
physical/pool stock and balanced goods/VAT/payable journal together. Preserve all
source identities, mapping/decision cycles, original stock events and retained
close versions. Outgoing export invoice work follows in the PR-04 family.
