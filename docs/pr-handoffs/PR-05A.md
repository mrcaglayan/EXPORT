# PR-05A handoff — Original input VAT and export source attribution

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Completed **27 October 2026 (Europe/Istanbul)**. Next is **PR-05B: directly linked
charges, overhead and ATİK allocation**.

## Delivered behavior

VAT now registers selected posted purchase invoice lines with immutable original
VAT, source/base currency, dated conversion, deductible/capitalized treatment and
exact stock-layer/journal evidence. Duplicate enrollment reuses the original source.
Export attribution follows independently accepted customs quantities through the
declaration, actual issue and original purchase layer. Missing or unsupported
provenance blocks attribution; inventory cost is never substituted for source VAT.

Requests explicitly choose CANDIDATE, HOLD or EXCLUDED with evidence. Temporary,
return and taxed outgoing lines remain held/excluded pending dedicated treatment.
Pending/approved requests reserve original quantity and VAT basis. Partial
allocations round to six decimals; final depletion takes the exact residual.
Approval revalidates provenance and bounds without rerounding retained amounts.

Another authorized person reviews requests. Corrections use evidenced void requests
and independent acceptance; quantities and accepted totals remain committed while
void is pending. Every source, line, original approval and later decision is retained.
The workflow makes no additional stock/GL posting or refund-entitlement decision.

See [the architecture contract](../architecture/vat-source-attribution.md) for
amounts, state transitions, permissions, official references and future dependencies.

## Files and limits

- m017 adds four scoped tables, four ADMIN permissions and a scoped journal-line
  unique index. Applied m001–m016 remain unchanged. Total: 94 tables / 17 migrations.
- Source, lineage, exact-money and attribution services use existing entity locking,
  idempotency and audit. Routes use `/api/v1/entities/:entityId/vat` with session,
  permissions, Origin and CSRF. Original invoices, stock and journal entries stay intact.
- VAT replaces its placeholder with paged registration, exact-source preview,
  independent review/void, retained details/history and an authorized audit view.
  Sidebar-only layout and mobile navigation remain unchanged.
- OpenAPI **0.18.0**, **246 paths**; roadmap **v1.19**, design baseline **v15**.
- No fixed business line ceiling: 1 MiB JSON, 250-row atomic inserts, read pages
  up to 100 and 25-row UI tables. Synthetic 301-line source attribution is covered.
- No dependencies, new local accounts, real invoice import/enrollment, historical
  workbook migration, stock/GL postings, commit, push or deployment were introduced.

## Verification

All constituent release checks pass. The release script ran every stage; after
correcting the browser history assertion and deterministic decision ordering, the
affected lint/build, VAT and complete browser checks were rerun successfully.
The initial log and final verification log are retained separately.

| Check | Result |
|---|---|
| Full release checks from `test:pr05a:release`, plus affected checks rerun | PASS: OpenAPI, frontend lint/build, journal editor, foundation/auth/accounting/catalogue, all inventory stages, purchasing, invoice/receipt, export/customs, VAT and complete browser regressions |
| `npm --prefix backend run test:pr05a` | PASS: 15 checks; exact original VAT, partial/residual/large amounts, FX, capitalized/free/zero sources, missing/unsupported provenance, explicit transaction treatment, independent approval/void, ordered retained decisions, overlap races, rollback, immutability, 301-line split sources, scope/CSRF/idempotency and migration recovery |
| Frontend lint/build | PASS: 2,192 modules; VAT loaded separately |
| OpenAPI validation | PASS: version 0.18.0 / 246 paths |
| Complete isolated browser rerun | PASS: enrollment, original evidence, taxed-candidate guard, held attribution, independent approval/void, retained ordered history, reader controls, reload, mobile and all earlier workflows |
| Local migration / verification rerun | PASS: m017 applied once; 17 applied migrations / 94 tables |
| Retained data/history/source fingerprints | PASS: old business rows and m001–m016 history/checksums preserved; only expected permissions/role-permissions/migration-history additions |
| Saved-account local smoke | PASS: desktop/mobile/reload, empty VAT sources/attributions, two STAGED invoices/six original lines, no runtime errors; own session logged out |

All write tests use disposable schemas and synthetic sources/accounts. The browser
purchase fixture uses its own warehouse so downstream FIFO dispatch resolves to the
posted purchase instead of older inventory-only fixtures. Whole-unit source
precision remains enforced; fractional quantities are covered by decimal-unit
backend fixtures. Tests do not substitute another purchase for unsupported layers.

## Local upgrade and runtime

Verified backup: `.local/backups/pr05a-before.sql`, **1,172,011 bytes**, with raw
SHA-256 and completion metadata in `.local/pr05a-backup.json`. Before/after
fingerprints and `.local/pr05a-verification.json` retain upgrade evidence. Four
new VAT tables remain empty. Both existing purchase invoices remain STAGED with
their six original lines; no real registration, attribution, stock or journal was
created. Company, administrator and password are unchanged.

Only the saved project Node processes were restarted, after verifying their process
identity and listening-port ownership. API readiness passes on **3000**; the app is
available at **http://localhost:5173/vat**. Ownership/log metadata is retained in
`.local/runtime-pr05a.json`. Final source/SQL/copy/link/backup checks are recorded
in `.local/pr05a-final-audit.json`. Applied m017 is now frozen with m001–m016.

Ignored evidence retains release logs/results, backup/state verification, runtime
logs and desktop/mobile screenshots. Temporary PR-05A helpers are removed at
completion; secrets remain only in ignored local setup files.

## Next stage

PR-05B must add separately documented charges, overhead and special ATİK allocation
with explicit bases, independent approval and duplicate-consumption guards. Preserve
m001–m017 and the original source/line/review/correction evidence. Keep these analytical
candidates separate from PR-06 deduction-period reconciliation and final claimability.
PR-06 must add claim dependency guards before allowing corrections of claimed amounts.
