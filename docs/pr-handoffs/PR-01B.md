# PR-01B handoff — Specifications, GTİP review and supplier aliases

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **21 October 2026 (Europe/Istanbul)**. The local app remains at
**http://localhost:5173/products**. Next is **PR-01C — product UX polish and the
combined product release gate**. No hosted deployment, remote, commit or GitHub
PR was created.

## Delivered

- Typed specification definitions and SKU values: TEXT, exact DECIMAL strings
  and BOOLEAN. Stock-defining values are fixed after first assignment;
  descriptive changes retain audit history. Different goods remain separate SKUs.
- Dated GTİP proposals and review lifecycle, broker name/reference/date evidence,
  authenticated review actors and timestamps. Inclusive active windows cannot
  overlap for one SKU; multiple SKUs can share a GTİP. Format validation does
  not determine the correct classification or validate broker credentials.
- Verified date lookup and audited end-date shortening for successor codes.
  Retirement withdraws an entry for all dates, preserving its history.
- Minimal scoped catalogue supplier identities, original supplier item wording
  retained exactly, and numbered mapping revisions. Only one current proposal
  per source is allowed. Rejection/retirement allows a replacement revision
  while retaining the old candidate and evidence.
- Exact verified-only alias lookup. Similar words, GTİP, VAT or destination do
  not match or merge goods. Inactive suppliers/SKUs cannot resolve automatically.
- New `products.review` permission, scoped ADMIN upgrade, service authorization,
  CSRF/Origin checks, transactional audit and idempotency. Managers and readers
  receive no review permission automatically.
- SKU Details for specifications/GTİP, new definition/supplier/alias panels,
  review forms, evidence views and exact-match checks. Read-only roles can
  inspect history but cannot propose/review. Sidebar-only navigation remains.
- Baseline v2 with m004/m005 SQL reference and matching parent copies. Roadmap,
  build instructions, bootstrap status, README and architecture point to PR-01C.

## Design choices

m005 adds six tables: `product_suppliers`, `product_attribute_definitions`,
`product_sku_attributes`, `product_gtip_history`, `product_alias_sources` and
`product_aliases`. The supplier and source tables support scoped identity and
retained revision history; they do not implement payable/purchasing masters.
Future purchasing must extend or explicitly link these supplier references.

Reviews follow PENDING → REVIEWED → VERIFIED, with REJECTED before verification
and RETIRED after it. Each transition needs a reason. An authorized administrator
may review their own proposal; separate-person approval is not claimed here.
Broker evidence is manually recorded and the app reviewer is identified separately.
Use **Set end date**, not retirement, for a valid classification changing later.

Original supplier code/description are exact-match inputs, including whitespace
and case. This conservative rule can require additional reviews for differently
worded documents. It deliberately provides no fuzzy automatic fallback.
Lookup is a point-in-time read; a future importer must revalidate the current
verified mapping inside its source-write transaction before using it.

See the [classification contract](../architecture/product-classification.md)
and [baseline v2](../design/PR01_PR02_database_specification.md). The official
[tariff FAQ](https://ticaret.gov.tr/gumruk-islemleri/sikca-sorulan-sorular/ticari/tarife)
was checked for the 12-digit GTİP format; no actual tariff assignment is seeded.

## Main files

Backend: `m005_product_classification.js`; reference, attribute, GTİP, alias and
review services; classification validators; expanded product routes; OpenAPI;
classification integration suite and migration/test registration.

Frontend: `ProductDetails`, `AttributePanel`, `GtipPanel`, `ReviewForm`,
`AliasPanel`; extended shared catalogue/form/picker; classification browser suite.

Plans/docs: specification/SQL baseline v2, classification architecture, README,
current roadmap/build instructions and historical handoff status notes.
No dependency was added or upgraded.

## Executed verification

| Command/check | Result |
|---|---|
| Backend `test:pr01b` | PASS — 15 tests including upgrade, typed values, date boundaries, review restrictions, exact matching, races, cross-scope FKs and audit rollback |
| Backend `test:pr01b:browser` | PASS — actual forms/reviews/matches, original multiline wording, overlap errors, stock-identity rejection, stale-match clearing, mobile and read-only controls; includes PR-01A/accounting/auth flows |
| Backend `test:pr01a` | PASS — 12 catalogue regression tests |
| Backend `test:pr00` | PASS — 22 foundation/fresh migration tests, 29 tables |
| Backend `test:pr00b` | PASS — 14 authentication/access tests |
| Backend `test:pr00c` | PASS — 16 accounting/decimal tests, including 600-line rollback |
| Frontend `lint` | PASS |
| Frontend `build` | PASS — 2,156 modules |
| Backend `check:openapi` | PASS — 42 documented paths |
| Backend `db:migrate:local` | PASS — m005 applied once; all five migrations at attempt 1 |
| Source/history comparison | PASS — m001–m004 sources and persisted history unchanged |
| Before/after local row comparison | PASS — all existing accounting, catalogue, audit and idempotency rows preserved |
| Frontend `test:smoke` on the actual local app | PASS — login, seven routes, readiness, mobile and sign-out; no business writes |
| Live readiness | PASS — database up/schema current, HTTP 200 |
| Desktop/mobile screenshot review | PASS — content panels, no global header or page overflow |

The initial MySQL start command found the port already in use and left it alone.
The test harness independently verified the running server's repository-owned
data directory and ran successfully; no existing service was replaced.

Review found that a previous positive match could remain displayed after Refresh.
The UI now hides results from an older catalogue revision; the browser gate
checks that behavior. Runtime source changes were built and checked afterward.

## Preserved local state and use

The company **abc A.Ş.**, administrator **admin@gmail.com** and password remain
unchanged. Credentials and verification snapshots remain ignored local files.
The before/after comparison preserved eight accounts, one journal with two lines,
one posting request and all prior audit/idempotency rows. The six new tables
are empty locally; all synthetic suppliers, codes and review evidence were
created only in disposable test databases. Total schema: 29 tables.

Refresh the browser to load the new permission. In Products, create definitions
and suppliers as needed. Open a SKU's Details to set specifications and propose
GTİP history. Under Supplier aliases, propose the exact original item wording,
review it and record verification before automatic matching can succeed.

PR-01C is next. Inventory quantities, invoices, tax calculations, actual tariff
classification, supplier financial details and historical imports remain outside
this release. The previously recorded development-only nodemon/chokidar/braces
findings remain; no dependency changes or forced downgrade were made. Local
checks do not establish production rollout or throughput guarantees.
