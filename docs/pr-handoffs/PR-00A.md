# PR-00A handoff — Foundation behavior and migrations

**Current status — 23 October 2026:** PR-02D is implemented; see the
[PR-02D handoff](PR-02D.md). PR-02E is next. Its newly authorized design baseline resolves the
earlier absent-input prerequisite. Journals now have no fixed line-count ceiling.
The dated implementation/check results below are historical.

Historical handoff. PR-00B and PR-00C have since been implemented; see the
[PR-00C handoff](PR-00C.md) for current status and the PR-01A design prerequisite.

Implemented and verified on **20 October 2026 (Europe/Istanbul)** by extending
the existing `export-accounting` project. No scaffold or existing database was
recreated. Git changes are staged; no commit, remote, hosted deployment or
GitHub pull request was created.

## Result

- Parameterized query helper and transactions with commit/rollback/cleanup.
- Registered migrations, read-only status, source checksums, database-level
  locking, failure/interruption tracking and explicit reviewed retry.
- `m001_foundation` applied once to `export_accounting_dev`, creating only
  application identity metadata alongside the migration tracking table.
- Request IDs, safe structured errors, Helmet headers and exact-origin CORS.
- Separate `/health` and `/api/v1/ready`, with bounded readiness checks and
  explicit 503 responses when DB/configuration/schema are unavailable.
- Validated OpenAPI baseline.
- Settings connection panel with loading, ready, unavailable and retry states.
  Sidebar-only navigation is preserved; no top bar or separate page introduction
  was restored.
- Isolated MySQL integration tests and updated browser checks.

## Main files

```text
backend/
  openapi.yaml
  package.json, package-lock.json, .env.example
  src/
    app.js, index.js
    config/env.js
    db/query.js
    migrate.js, migrationRunner.js
    migrations/index.js, m001_foundation.js
    middleware/requestId.js, errorHandler.js
    routes/system.routes.js
    services/readiness.js
    shared/AppError.js
  scripts/check-openapi.js, test-pr00.js
  tests/bootstrap.test.js, foundation.test.js, db.integration.js
frontend/
  src/hooks/useReadiness.js
  src/pages/settings/SettingsPage.jsx
  scripts/smoke.mjs
docs/
  architecture/migrations.md
  pr-handoffs/PR-00A.md
```

The bootstrap README, historical architecture/handoff and all three parent
planning documents were updated for scope, current progress and deferred inputs.
Package additions: **helmet 8.3.0** (runtime) and
**@apidevtools/swagger-parser 13.1.0** (development), recorded in the backend
lockfile. No frontend dependencies changed.

## Commands actually executed

Commands below run inside `backend/` or `frontend/` as indicated.

| Command/check | Result |
|---|---|
| Backend dependency additions via `npm install helmet` and `npm install -D @apidevtools/swagger-parser` | PASS; lockfile updated |
| `npm run db:check` before starting MySQL | BLOCKED, expected — local server was stopped |
| Root `node scripts/local-mysql.mjs start` | PASS — existing repository-local instance started |
| Backend `npm test` | PASS — 12 unit/HTTP tests |
| Backend `npm run test:pr00` | PASS — 22 total tests, including the integration group and 9 MySQL subtests |
| Backend `npm run check:openapi` | PASS — OpenAPI 3.0.3, two documented paths |
| Backend `npm run db:migrate:status` before migration | PASS — `m001_foundation` pending, no schema changes |
| Backend `npm run db:migrate` | PASS — `m001_foundation` applied, attempt 1 |
| Backend `npm run db:migrate` again | PASS — still applied, attempt 1; no duplicate application |
| Backend `npm run db:migrate:status` afterward | PASS — applied |
| `GET http://localhost:3000/health` | PASS — 200, request ID, no DB requirement |
| `GET http://localhost:3000/api/v1/ready` | PASS — 200, database up, schema current |
| Frontend `npm run lint` | PASS |
| Frontend `npm run build` | PASS |
| Initial expanded browser smoke check | FAIL, resolved — test interception counted requests despite React Strict Mode's repeated effect; the test now controls response phases explicitly |
| Final frontend `npm run test:smoke` | PASS — seven routes, mobile navigation, request IDs, readiness loading/error/retry and real readiness |
| Mobile Settings screenshot inspection | PASS — content panel, no top/header-introduction bar |
| Backend `npm audit --omit=dev` | PASS — no production vulnerabilities |
| Git whitespace, ignored files and staged secret checks | PASS |

The integration harness proved:

- Read-only status/readiness on a fresh schema and successful idempotent migration.
- Actual DML commit, rollback and connection reuse.
- Safe failure on rejected DB credentials.
- Exclusive migration execution through independent MySQL connections.
- Durable partial-DDL failure tracking and blocked automatic reruns.
- Successful explicit retry and interrupted-run recovery.
- Rejection of checksum drift, unknown history and duplicate registry entries.

The test harness created a random disposable schema/account on the verified
repository-local MySQL instance, and removed only those newly created resources.
No test records were added to the development database.

## Current startup and operations

The existing frontend/API development servers were reused. MySQL was started
and is running at handoff; all three services are available locally:

- UI: http://localhost:5173
- HTTP liveness: http://localhost:3000/health
- Readiness: http://localhost:3000/api/v1/ready

On a later session, start MySQL only if it is stopped:

```text
node scripts/local-mysql.mjs start
npm --prefix backend run db:migrate
```

Run the two apps in separate terminals:

```text
npm --prefix backend run dev
npm --prefix frontend run dev
```

Checks from the repository root:

```text
npm --prefix backend run db:migrate:status
npm --prefix backend run check:openapi
npm --prefix backend run test:pr00
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Use `npm.cmd` in PowerShell if needed. See the
[migration guide](../architecture/migrations.md) for explicit recovery.
No additional credentials or environment keys are required. `CORS_ORIGIN`
now supports exact comma-separated origins and is mandatory in production.

## Planning fixes and remaining items

- Removed the stale instruction to create a “fresh scaffold” in PR-00A.
- Made generic migration/auth/business acceptance rules apply to the PRs where
  those features actually exist, instead of requiring premature implementation.
- `PR01_PR02_database_specification.md` and `PR01_PR02_schema.sql` were not found
  in the workspace, Downloads or SaaP reference archive. They remain pending
  design inputs before PR-01/02 schema work. No replacement design was invented.
- The original nodemon/chokidar/braces **development-only** audit chain still
  reports three high findings. No forced nodemon downgrade or incompatible
  dependency override was applied. Production dependencies audit clean.
- The isolated integration harness currently expects the repository-local MySQL
  setup, not an arbitrary external database. It reports BLOCKED if unavailable.
- No authentication, tenant/business schemas, real Excel imports, historical
  stock balances or VAT calculations were implemented.

**Next: PR-00B — tenants, legal entities, login/logout, roles and permissions.
PR-00C accounting primitives follow before PR-01 product features.**
