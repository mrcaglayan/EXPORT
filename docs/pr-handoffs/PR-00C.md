# PR-00C handoff — Accounting foundation

**Current status — 21 October 2026:** PR-01B is implemented; see the
[PR-01B handoff](PR-01B.md). Its newly authorized design baseline resolves the
earlier absent-input prerequisite. Journals now have no fixed line-count ceiling.
The dated implementation/check results below are historical.

Implemented and verified on **20 October 2026 (Europe/Istanbul)**, extending the
existing application. PR-00AA/00A/00B remain intact. The local app is running at
**http://localhost:5173/accounting**.

**Resume check — 21 October 2026:** the saved implementation was unchanged.
Restarted the stopped repository-owned MySQL, API and Vite processes. Readiness
returned 200 with database up/schema current; migration status retained all
three applied migrations at attempt 1. The local frontend browser smoke check
passed again. No schema or accounting data reset was performed.

**Journal correction — 21 October 2026:** replaced the two-account form with a
2–200-line editor. Each row has account, description, debit and credit; repeated
accounts support separate item descriptions. Added exact BigInt totals and
difference, row add/remove, validation and preserved values on rejected posts.
Journal/request details display line descriptions. No migration, backend API
change or dependency addition was needed, and local accounting records were
not changed. VAT calculation and detailed SKU invoice lines remain later work.
The plans now explicitly require multiple SKUs and VAT treatments per invoice.

## Result

- Nine scoped accounting tables, registered as `m003_accounting_foundation`.
  The development schema now has 20 tables. All three migrations are applied
  at attempt 1; m001/m002 source and history are unchanged.
- Base currency, chart of accounts, fiscal years and accounting periods.
- Exact decimal-string money handling with **decimal.js 10.6.0**.
- Balanced, immutable journal headers/lines with separate document/posting dates.
- Atomic audit and idempotency, plus source deduplication across different keys.
- PENDING/FAILED/POSTED posting requests with explicit processing and retry.
  POSTED requires a linked, balanced journal committed in the same transaction.
- Closed-period enforcement and closing blocked by unposted requests.
- Authenticated, entity-scoped API and explicit accounting permissions; CSRF,
  Origin and Idempotency-Key checks on all writes. OpenAPI covers 21 total paths.
- Accounting UI for setup, accounts, calendar, journals, requests and audit,
  including read-only access, error references, pagination and mobile scrolling.
  Sidebar-only navigation is preserved; no global top bar or separate page
  introduction was added.
- Separate migration DDL credentials and a repository-instance verification
  helper. The API's scoped database grants and server settings were preserved.

## Main files

```text
backend/
  package.json, package-lock.json, .env.example, openapi.yaml
  src/migrations/m003_accounting_foundation.js, index.js
  src/db/pool.js, query.js
  src/migrationRunner.js, app.js
  src/shared/money.js, idempotency.js
  src/validators/accounting.validators.js
  src/services/accounting-context.js, accounting-setup.service.js
  src/services/journal.service.js, posting-requests.service.js
  src/routes/accounting.routes.js
  scripts/migrate-local.js, test-pr00.js
  tests/accounting.integration.js, money.test.js, auth-fixtures.js, db.integration.js
frontend/
  src/pages/accounting/AccountingPage.jsx, AccountsPanel.jsx, CalendarPanel.jsx
  src/pages/accounting/JournalsPanel.jsx, RequestsPanel.jsx, AuditPanel.jsx
  src/pages/accounting/JournalEntryForm.jsx, journal-entry.js
  src/pages/accounting/accounting-ui.jsx, useAccounting.js
  scripts/accounting-smoke.mjs, smoke.mjs, journal-entry.test.mjs
docs/
  architecture/accounting.md, migrations.md, identity.md, bootstrap.md
  pr-handoffs/PR-00C.md and historical handoff status notes
```

README and the three parent Markdown plans now mark PR-00C complete and identify
PR-01A with its design-review prerequisite. No frontend dependency was added.

## Actual verification

| Command/check | Result |
|---|---|
| Backend `npm test` | PASS — 15 tests |
| Backend `npm run test:pr00` | PASS — 22 foundation/migration tests |
| Backend `npm run test:pr00b` | PASS — 14 identity/access tests |
| Backend `npm run test:pr00c` | PASS — 16 tests including decimal boundaries and accounting integration |
| Backend `npm run test:pr00c:browser` | PASS — complete accounting flow plus identity/UI regressions in a disposable database |
| Backend `npm run check:openapi` | PASS — 21 documented paths |
| Backend `npm run db:migrate:local` | PASS — m003 applied once, previous migrations preserved |
| Backend `npm run db:migrate` and `db:migrate:status` | PASS — verification with scoped runtime DB user; all applied at attempt 1 |
| Frontend `npm run lint` | PASS |
| Frontend `npm run build` | PASS — 2,146 modules after the 21 October journal correction |
| Frontend `npm run test:journal` | PASS — 7 exact-money, multi-item, invalid-input and line-limit checks |
| Frontend `npm run test:smoke` | PASS — actual local account, existing routes, readiness and login/logout |
| Desktop/mobile screenshot review | PASS — journal detail, mobile audit table and local account list |
| Backend `npm audit --omit=dev` | PASS — zero production dependency findings |
| Backend `npm audit` | Known remaining issue — three high findings in existing nodemon/chokidar/braces development chain |
| Read-only local state and source verification | PASS — original company/admin, migration history and scoped runtime grants preserved; journals balance; POSTED requests link correctly; lockfiles match manifests; generated local secrets absent from source |
| Live health, readiness and UI | PASS — HTTP 200 |

Accounting integration covers upgrade grants, tenant/entity boundaries, currency
and date overlap validation, exact decimal totals, invalid/cross-entity inputs,
concurrent same-key/source submissions, SQL immutability, rollback on audit
failure, outbox failure/retry, closed periods and concurrent post/close/enqueue.
The browser exercises setup through posting and closing, including an inactive
account causing FAILED, correction/retry to POSTED, and read-only role behavior.
The 21 October correction reran accounting integration (16 tests), frontend
lint/build and the combined browser gate. Browser coverage now includes the
50,000 + 5,000 = 55,000 three-line example and a five-line multi-item example,
repeated goods accounts, preserved line descriptions, empty-row/two-sided-line/
imbalance blocking, cleared stale success feedback and retained inputs after
closed-period rejection. Synthetic examples ran only in disposable databases.
Test-owned schemas/accounts/servers were removed after each isolated run.
`test:pr00b:browser` and `test:pr00c:browser` invoke the same combined browser gate.

Issues found and resolved:

- The local MySQL binary-logging policy rejected trigger creation by the scoped
  app user. Migration-only credentials now handle DDL; no global trust setting
  or app-user SUPER grant was introduced.
- SAVEPOINT statements were rejected through the prepared protocol. The helper
  now uses internal names through the text protocol, retaining parameterized
  prepared queries for ordinary data operations.
- OpenAPI rejected an empty `required` array; the empty-body schema was corrected.
- Browser checks exposed a select-label association issue. Fields now use
  explicit labels/IDs. Mobile tables keep a readable minimum width inside their
  scrolling container.
- A final verification initially expected empty local accounting tables.
  Records had been entered through the local app while validation was underway.
  They were preserved; the check was corrected to verify their journal balance
  and request linkage. No local records were deleted or reset.

## Local state and use

The requested company **abc A.Ş.** and administrator **admin@gmail.com** are
preserved. Credentials remain in ignored `.local/auth/initial-account.json`;
no password was changed by this PR.

The migration and automated tests did not seed local financial data. At the
read-only verification snapshot, the local app had TRY configured, eight
accounts, one fiscal year/period and one posted request with its balanced journal.
These live records were left intact. Counts may increase as the app is used.
Desktop/mobile screenshots are in ignored `.local/screenshots`.

To use accounting, select the company in the sidebar and open Accounting.
Existing configuration remains available. New companies first select currency,
then add approved accounts and fiscal dates. Journals can be posted directly or
queued; queued requests require explicit processing. Correct a FAILED request's
cause and retry. Closing requires a reason and prevents further postings.

The existing API, Vite and MySQL processes remain running. Use README startup
commands on later sessions. No remote, commit, hosted deployment or GitHub PR
was created.

## Limits and next step

- Next is **PR-01A — product families, SKUs and units of measure**.
  First review `PR01_PR02_database_specification.md` and `PR01_PR02_schema.sql`.
  They are still absent referenced inputs, not incomplete PR-00 deliverables.
  No replacement has been fabricated or claimed as previously supplied.
- This is a foundation: no FX, statutory account template, opening import,
  inventory/purchase/VAT integration, trial balance, reversal, reopening,
  background processor or production rollout.
- Accounting writes serialize per entity. Before increasing throughput, retain
  the tested lock ordering, idempotency and closed-period guarantees.
- Both UI and API journals support 2–200 lines; invoice SKU/quantity/unit-price
  detail and automatic VAT calculation are not part of the manual journal editor.
- Separate DDL credentials and trigger-definer lifecycle need server-owner
  review on any deployment beyond the verified local instance.
- The existing development dependency findings remain; the audit's proposed
  forced downgrade to nodemon 1 was not applied.

See the [accounting contract](../architecture/accounting.md) and
[migration operations](../architecture/migrations.md) for integration details.
