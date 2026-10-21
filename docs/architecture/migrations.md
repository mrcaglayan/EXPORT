# Database foundation and migration operations

PR-00A extends the existing PR-00AA project. It does not rebuild the scaffold.
Application routes never create a database, run migrations or use an admin
account. Configure the dedicated Export Accounting database in `backend/.env`.

## Normal workflow

From the repository root:

```text
npm --prefix backend run db:check
npm --prefix backend run db:migrate:status
npm --prefix backend run db:migrate:local
npm --prefix backend run db:migrate:status
npm --prefix backend run check:openapi
npm --prefix backend run test:pr00
```

Use `npm.cmd` instead of `npm` in PowerShell if script execution is restricted.
`db:migrate:status` is read-only even before the first migration. Pending entries
are reported with exit 0; failed/interrupted/unknown/drifted history exits 1.
`db:migrate` acquires a database-specific MySQL named lock on one connection,
creates the tracking table if absent, and applies pending migrations in order.
Repeated successful runs verify applied migrations and do not reapply them.
The CLI waits up to 10 seconds for the lock before failing.

### DDL credentials

PR-00C creates integrity triggers. With this local MySQL server's binary logging
configuration, the database-scoped application user cannot create them.
`db:migrate:local` verifies the development database, loopback address, port and
actual `@@datadir` against this repository, then uses the ignored local instance
admin credential for migration DDL. It does not alter server settings or grants.

For other approved servers, run `db:migrate` with both `MIGRATION_DB_USER` and
`MIGRATION_DB_PASSWORD` supplied only to the migration process. The migration
pool inherits the same host/database configuration. Without that pair, the
runner uses the ordinary database user. `db:migrate:status`, readiness and all
HTTP services always use the application pool. After applying the schema,
`db:migrate` can verify it using the scoped app user without re-creating triggers.

Trigger definers retain their execution role. Review the intended migration
account and its lifetime when provisioning another server. Do not delete it
without planning for dependent triggers. This development helper is not a
production credential provisioning tool. See the
[MySQL stored-program logging requirements](https://dev.mysql.com/doc/refman/8.0/en/stored-programs-logging.html).

## Tables introduced

| Table | Purpose |
|---|---|
| `schema_migrations` | Migration key, description, SHA-256 source checksum, status, attempts, timestamps and a safe error code |
| `application_metadata` | A single technical identity record: `application = export-accounting` |

The table above describes `m001_foundation`. PR-00B adds the registered
`m002_auth_roles_scopes` migration for identity, scoped permissions, sessions and
login limits. It seeds permission definitions only; an explicit setup command
creates the initial tenant/entity/admin. See [identity](identity.md).
PR-00C adds `m003_accounting_foundation`: nine tables for accounting settings,
accounts, fiscal years, accounting periods, journal headers/lines, posting
requests, audit events and idempotency records. It verifies columns, indexes,
foreign keys, checks, trigger definitions and permission grants. Existing ADMIN
roles receive the five explicit accounting write/audit permissions within their
existing entity assignments. Other roles are unchanged.
No currency configuration, accounts, journal, product, inventory or VAT records
are created. See [accounting](accounting.md).

## Adding migrations

Add an ordered, uniquely named JavaScript module such as `m002_example.js` and
register it in `backend/src/migrations/index.js` with a SHA-256 checksum of its
source. Keep migration logic self-contained so the source checksum covers its
behavior. Preserve LF line endings (enforced by `.gitattributes`).

Each migration supplies:

- `key` and `description`;
- `up(connection)` to perform forward-only changes;
- `verify(connection)` to check the resulting schema/data using read-only queries;
- `checksum` calculated by the registry.

Freeze applied migration files. Changes to an applied or failed source are
reported as drift; add a later migration for new schema changes. Do not insert a
new migration before an already-applied one. A different application/version's
unregistered history is also rejected.

The first migration is resumable: it checks any existing table's structure,
preserves the identity record and verifies the postcondition. `IF NOT EXISTS`
alone is not proof that an existing table is compatible.

## Failure and explicit recovery

MySQL DDL can commit implicitly. The runner deliberately does not promise
transactional rollback for a sequence of schema changes. It persists `running`
before executing `up()` and records `applied` only after verification succeeds.
An exception records `failed`; a lost connection or interrupted process can leave
`running`. Either state blocks normal reruns.

Recovery:

1. Run `db:migrate:status` and identify the failed/interrupted key.
2. Inspect that migration's unchanged source and the actual partial schema.
   Determine which operations committed. Fix the environmental cause or perform
   a reviewed schema repair using the database owner's approved process.
3. Confirm that rerunning `up()` is safe for the inspected state and that
   `verify()` will check the intended result. Never treat an error as success.
4. Explicitly retry only the reviewed migration:

   ```text
   npm --prefix backend run db:migrate -- --retry m001_foundation
   ```

   For the repository-owned instance and privileged DDL, use
   `db:migrate:local -- --retry <migration-key>` instead.

5. Run status, readiness and the relevant tests again.

The retry acquires the same lock, requires the original checksum, increments
`attempts` and verifies success. Unknown retry keys and attempts to retry an
already-applied migration are rejected. There is no automatic reset, destructive
rollback, “mark applied” bypass or automatic retry after uncertain commits.
If a source is defective, restore the matching source and plan a reviewed repair;
do not erase tracking history or silently change stored checksums.

## Transaction helper

`backend/src/db/query.js` exposes parameterized `query(sql, parameters)` returning
`{ rows }`, and `withTransaction(async tx => ...)` using one pooled connection.
The helper commits on success, rolls back on failure and always releases or
destroys the connection. Failed rollback preserves both errors and discards the
connection. It never retries automatically. Use it for DML, not migration DDL.
PR-00C adds `tx.withSavepoint(async tx => ...)`. It uses internal generated
savepoint names and the connection's text protocol because SAVEPOINT statements
are not supported through this server's prepared-statement protocol. Parameters
for ordinary queries still use `execute`. Savepoint rollback failure propagates
both errors and triggers a full transaction rollback.
See [accounting](accounting.md) for atomic audit, idempotency and posting.

## Readiness and API contract

- `GET /health`: HTTP liveness, independent of MySQL.
- `GET /api/v1/ready`: read-only database check, expected migration checksums and
  statuses, and application identity. Acquiring a connection and checking
  readiness are bounded by a 2-second deadline.
- Unavailable DB/configuration returns HTTP 503 with `DATABASE_UNAVAILABLE`;
  incomplete, failed, unknown or drifted schema history returns HTTP 503 with
  `SCHEMA_NOT_READY`. Readiness checks migration history/identity; it is not a
  full audit of every database object.
- Every response gets `X-Request-Id`; JSON success/error responses carry
  `requestId`. Safe caller identifiers are accepted, invalid ones are replaced.
- Errors are `{ error: { code, message }, requestId }`. SQL, credentials, stack
  traces and raw database messages are not exposed in HTTP responses or error logs.
- Helmet supplies security headers. `CORS_ORIGIN` is a comma-separated list of
  exact browser origins; wildcards, URL paths and embedded credentials are invalid.
  Production requires explicit configuration. Requests without an Origin header
  are permitted. CORS is not authentication.
- PR-00A introduced read-only endpoints. PR-00B extends CORS to GET/HEAD/OPTIONS/
  POST/PATCH and X-CSRF-Token, with Origin, JSON and signed session-bound CSRF
  checks on every identity write. See [identity](identity.md).
- PR-00C also permits `Idempotency-Key` and applies the same CSRF controls to
  every accounting write.

`backend/openapi.yaml` defines the baseline. The Settings content panel displays
checking, available, unavailable and retry states through the shared Axios client.
It does not introduce a top bar or a separate page-introduction banner.

## Isolated integration tests

`npm run test:pr00` uses only the repository-local MySQL instance created by
`scripts/local-mysql.mjs`. It reads the ignored instance admin credential and
verifies `@@datadir` matches this repository before provisioning anything.
It creates a uniquely named `export_accounting_test_<random>` database and
temporary database-scoped account. Application operations in the tests use that
scoped account. Only migrations and explicit integrity-failure test triggers use
the separate admin migration pool.
The harness removes only the schema/account it successfully created in that run.
It never resets `export_accounting_dev`, SaaP or another existing database.

The harness exits nonzero with `BLOCKED` if the local instance/credential is
unavailable; there is no silent fallback to a developer or production schema.
After forcefully interrupting a harness, inspect any leftover test schema/account
before manual cleanup. The harness intentionally does not delete old schemas
from previous runs.

References:
[MySQL named locks](https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html),
[MySQL implicit commits](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html),
[Express error handling](https://expressjs.com/en/guide/error-handling/).

## PR-01A extension

m004_product_foundation adds unit_of_measure, product_families and product_skus
(23 total tables). It verifies columns, engine/collation, scoped keys/FKs,
precision CHECK and new permission definitions. Existing ADMIN roles receive
products.manage and products.audit.read within their existing assignments.
No product or accounting data is seeded. Applied m001–m003 remain unchanged.
The tracked design reference is in ../design; use the registered migration, not
the reference SQL, for schema updates.

## PR-01B extension

m005_product_classification adds six tables: product_suppliers,
product_attribute_definitions, product_sku_attributes, product_gtip_history,
product_alias_sources and product_aliases (29 total). It seeds products.review
and grants it to existing ADMIN roles within their existing assignments.
Original alias source plus versioned candidates retain review history; a nullable
current-source key and CHECK enforce one active proposal per source. GTİP windows
are guarded transactionally in the service under the shared entity lock.
Applied m001–m004 sources/history are unchanged. No catalogue data is seeded.
