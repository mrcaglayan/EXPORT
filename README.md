# Export Accounting

PR-00AA established the standalone project for a Turkish trading exporter.
PR-00A adds database transactions/migrations, API errors and request IDs, readiness,
security headers, an OpenAPI baseline and a Settings connection panel.
PR-00B adds tenants/legal entities, cookie JWT login/logout with revocable
sessions, CSRF protection, scoped permissions and sidebar account controls.
PR-00C adds the Accounting page: base currency, chart of accounts, fiscal years
and periods, balanced journals, posting requests, audit and idempotency.
PR-01A adds product families, stockable SKUs, units of measure and product audit.
PR-01B adds typed specifications, dated GTİP review with broker evidence, minimal
supplier references and exact verified alias mappings with retained revisions.
Dashboard, Inventory, Exports and VAT remain navigation placeholders.
No inventory, purchasing or VAT calculations are implemented.

The application uses sidebar-only navigation. There is no top navigation/header
or breadcrumb bar. On mobile, the floating Menu button opens the sidebar drawer.
Future PRs must keep this layout, placing account/legal-entity controls in the
sidebar or relevant page. Pages start directly with their main content, without
separate “Your workspace”/page-name/subtitle introductions. Meaningful headings
and actions stay within content panels.

**Next: PR-01C — product UX polish and the combined product release gate.**
The user-authorized [new design baseline](docs/design/PR01_PR02_database_specification.md)
and [SQL reference](docs/design/PR01_PR02_schema.sql) were written on 21 October
2026; the originally referenced files were not supplied.

## Prerequisites

- Node.js **24+** and npm. Tested here with Node 24.20.0 and npm 11.19.0.
  `.nvmrc` selects Node 24. The selected Vite 7 requires Node `^20.19.0 || >=22.12.0`;
  this project's Node 24 floor also satisfies ESLint 10.
- Git; tested with 2.55.0.windows.5.
- **MySQL Server 8**, separately installed. Tested with MySQL Community Server
  8.0.44. The `mysql2` npm package is a JavaScript driver; it does not install or
  start a database server.
- Optional browser smoke check: an installed Microsoft Edge, or Chrome with
  `BROWSER_CHANNEL=chrome`. `playwright-core` does not download a browser.

Check your machine:

```text
node --version
npm --version
git --version
mysql --version
mysqld --version
```

On a fresh Windows machine, install Node 24 and Git with:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Git.Git --exact
```

Check the Node version after installation. For MySQL 8, use the official
[Windows ZIP distribution instructions](https://dev.mysql.com/doc/refman/8.0/en/windows-install-archive.html):
download the MySQL 8.0 Community Server Windows x64 ZIP, extract it to a new local
directory, and add its `bin` directory to this terminal's PATH or set `MYSQLD_PATH`
to the full `mysqld.exe` path. Do not replace an existing MySQL installation.
The optional helper below initializes its own data directory.

## Install — Windows PowerShell

From this repository:

```powershell
Set-Location C:\Users\ucaglayan\Desktop\Export\export-accounting
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
if (!(Test-Path frontend\.env)) { Copy-Item frontend\.env.example frontend\.env }
```

`npm.cmd` works without changing PowerShell execution policy. Separate
`backend/package-lock.json` and `frontend/package-lock.json` pin the dependency
trees. Use `npm ci` for a fresh checkout; use `npm install` within the appropriate
project when intentionally changing dependencies.

Choose **one** database setup:

1. **New isolated local instance, port 3306 free:** do not create `backend/.env`
   first. With MySQL Server 8 available, run:

   ```powershell
   node scripts/local-mysql.mjs init
   npm.cmd --prefix backend run db:check
   ```

   The helper creates `.local/mysql/data`, the dedicated `export_accounting_dev`
   database and a database-scoped `export_app` user. It generates passwords and
   writes the app configuration to ignored `backend/.env`; its instance admin
   credential stays in ignored `.local/mysql/admin.json`. It starts a loopback-only
   server in the background. It never prints passwords. It refuses existing
   `.local/mysql`, existing `backend/.env`, or an occupied port.
   This is an opt-in development helper, not a production provisioning tool.

2. **Your own approved local development server:** copy the example and edit it:

   ```powershell
   if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
   notepad backend\.env
   ```

   Set your dedicated database credentials. Have the server owner approve and run
   the optional [setup SQL](scripts/local-setup.example.sql). Do not apply it to
   SaaP, a shared server or production without the owner's permission.

## Install — cross-platform terminal

```sh
cd export-accounting
npm --prefix backend ci
npm --prefix frontend ci
test -f frontend/.env || cp frontend/.env.example frontend/.env

# Only for a NEW isolated instance, with mysqld 8 on PATH and port 3306 free:
node scripts/local-mysql.mjs init
npm --prefix backend run db:check
```

After configuring your database, check the migration status:

```text
npm --prefix backend run db:migrate:status
```

For the repository-owned local MySQL instance, apply migrations with:

```text
npm --prefix backend run db:migrate:local
```

This helper verifies the instance's data directory and uses its ignored local
admin credential for DDL only. PR-00C introduces integrity triggers; this local
server's binary-logging policy requires privileged migration credentials.
The API continues using `export_app`; no global server setting or runtime grant
is changed. For another approved server, use `db:migrate` with the server owner's
DDL credentials supplied as `MIGRATION_DB_USER` and `MIGRATION_DB_PASSWORD` in
the migration process environment only. Do not persist these in the API environment.

These commands apply foundation metadata, identity/permissions and accounting
structure. They do not configure accounting or create accounts or balances.
No app route runs migrations automatically. See the
[migration and recovery guide](docs/architecture/migrations.md) before retrying
a failed or interrupted migration.

Configure identity after migrating. For the repository-owned local instance:

```text
npm --prefix backend run setup:local-auth
```

The helper generates an auth secret and an initial account, keeping credentials
in ignored files. Open `.local/auth/initial-account.json` locally to obtain the
workspace code, administrator email and generated password. It never prints
passwords or resets an existing account. Restart the API after first setup.
For another approved database, use the environment-based `setup:admin` command in
the [identity setup guide](docs/architecture/identity.md).

For an already approved local development server, use
`test -f backend/.env || cp backend/.env.example backend/.env`, then edit
`backend/.env` instead of running `init`. The local helper was exercised on
Windows; the application commands work across platforms.

## Run in two terminals

If you used the helper, `init` already started MySQL. On later sessions, start it
once from the repository root with `node scripts/local-mysql.mjs start`.
Use `node scripts/local-mysql.mjs stop` to stop only that instance. Do not repeat
`init`; it deliberately refuses to overwrite data. No Windows service or global
configuration is installed.

**Terminal 1 — API (PowerShell):**

```powershell
Set-Location C:\Users\ucaglayan\Desktop\Export\export-accounting
npm.cmd --prefix backend run dev
```

**Terminal 2 — UI (PowerShell):**

```powershell
Set-Location C:\Users\ucaglayan\Desktop\Export\export-accounting
npm.cmd --prefix frontend run dev
```

Cross-platform terminals, from the repository root:

```sh
# Terminal 1
npm --prefix backend run dev
```

```sh
# Terminal 2
npm --prefix frontend run dev
```

Open **http://localhost:5173**. The API listens on loopback port **3000**.
Vite uses strict port 5173, and fails if it is occupied.
Stop either development app with Ctrl+C. `npm --prefix backend start` runs the
API without nodemon. `npm --prefix frontend run preview` serves the production
build for static inspection; it is not the development API proxy.

## Configuration and API boundary

Backend example keys:

| Key | Example |
|---|---|
| `NODE_ENV` | `development` |
| `PORT` | `3000` |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `export_accounting_dev` |
| `DB_USER` | `export_app` |
| `DB_PASSWORD` | empty; must be supplied locally |
| `DB_CONNECTION_LIMIT` | `10` |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `AUTH_SECRET` | empty; generate at least 32 random bytes encoded as hex |
| `AUTH_SESSION_SECONDS` | `28800` |

Frontend example: `VITE_APP_NAME=Export Accounting`. All `VITE_*` values are
public browser configuration. Never put database passwords, session secrets or
API tokens there.

The API loads `backend/.env` by file location, independent of the current working
directory. Process environment variables take precedence. Missing mandatory
database settings fail clearly when database functionality is requested.
The lazy pool never creates a database or supplies a default user/password.

`GET /health` returns `service`, `status: "ok"` and a `requestId`.
This reports HTTP process liveness only. `db:check` executes `SELECT 1 AS ok`,
closes its pool and exits nonzero with `BLOCKED` if configuration or the server
is unavailable. `GET /api/v1/ready` checks MySQL, registered migration history and
application identity. It returns 200 when ready, or a structured 503 error when
the DB or schema is unavailable. The Settings panel provides connection status
and retry. `CORS_ORIGIN` accepts exact comma-separated origins; it must be
explicitly configured in production.

The Axios client uses relative `/api/v1` paths, cookies (`withCredentials: true`),
a timeout and normalized errors. Vite proxies `/api` without rewriting the path
to `http://127.0.0.1:3000` (the localhost API). `/health` is intentionally not
proxied because the UI does not use it. Identity routes are under `/api/v1/auth`,
`/api/v1/me` and `/api/v1/organizations`; see the OpenAPI spec. Accounting
API routes are scoped under `/api/v1/entities/:entityId/accounting`.
Accounting writes require `Idempotency-Key` in addition to authentication, scope
and CSRF. Unimplemented routes return JSON 404 with `{ error: { code, message }, requestId }`. `X-Request-Id` is also
returned in response headers. Future deployment must provide a same-origin reverse proxy for `/api`
and SPA fallback for browser routes.

## Verification

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix backend run db:check
npm.cmd --prefix backend run db:migrate:status
npm.cmd --prefix backend run check:openapi
npm.cmd --prefix backend run test:pr00
npm.cmd --prefix backend run test:pr00b
npm.cmd --prefix backend run test:pr00c
npm.cmd --prefix backend run test:pr00c:browser
Invoke-RestMethod http://localhost:3000/health
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:journal
# Both development servers must be running; uses installed Edge:
npm.cmd --prefix frontend run test:smoke
```

Cross-platform equivalents:

```sh
npm --prefix backend test
npm --prefix backend run db:check
npm --prefix backend run db:migrate:status
npm --prefix backend run check:openapi
npm --prefix backend run test:pr00
npm --prefix backend run test:pr00b
npm --prefix backend run test:pr00c
npm --prefix backend run test:pr00c:browser
curl --fail http://localhost:3000/health
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:journal
# For installed Chrome; or set BROWSER_PATH to your browser executable:
BROWSER_CHANNEL=chrome npm --prefix frontend run test:smoke
```

The browser check covers login/logout, protected routing, all seven routes, navigation, mobile dialog behavior,
overflow, the missing-page screen, API error/request IDs, and Settings connection
loading/error/retry/live states. The `test:pr00` integration harness creates and
removes its own random test schema on the repository-local MySQL instance; it
does not reset the development database. It requires that instance to be running.
Screenshots go to ignored `.local/screenshots`.
The isolated browser harness (`test:pr00b:browser` and `test:pr00c:browser` are
aliases; run either once) also checks entity switching, scoped company editing,
restricted-user access and the complete accounting setup/post/retry/close flow
against synthetic data. It requires free port 5184.
The normal frontend `test:smoke` does not create accounting records.

## Accounting setup

Open **http://localhost:5173/accounting** and sign in. Select the intended company
in the sidebar, choose its base currency, add approved accounts, then create a
fiscal year and its accounting periods. The currency choice is fixed after
setup. New companies start with no accounting configuration or balances; the
migration does not seed financial records.
The journal form supports two or more lines with no fixed line-count ceiling.
It pages 25 editable rows, with an account, description,
debit and credit per line. Use Add line for goods, input VAT, payable or additional
item entries. The same account may appear on several rows with different item
descriptions. Exact totals and the remaining difference are shown; posting and
queueing require valid, balanced lines. Enter 50000.00 for fifty thousand, using
a dot for decimals and no thousands separators. VAT is entered manually here.
Totals cover every page. Writes are batched inside one atomic transaction;
the 1 MiB request guard remains. Local tests cover 300 and 1,000 lines plus
concurrent submissions; capacity is still bounded by payload and server resources.
You can post the journal or queue it for explicit processing. Failed requests
show their cause and can be retried after correction.
Pending/failed requests prevent closing their period. Closed periods reject new
postings; reopening and journal reversals are not implemented in this foundation.
See the [accounting contract](docs/architecture/accounting.md) for API limits,
permissions, decimal handling and the future inventory integration boundary.

Keep `.env`, `.env.*` (except `.env.example`), `.local`, MySQL data, passwords,
private keys, tokens, generated builds and `node_modules` local. They are ignored.
There is no remote repository or commit created by this bootstrap.

See the [architecture and reference review](docs/architecture/bootstrap.md) and
the [PR-00AA handoff](docs/pr-handoffs/PR-00AA.md) for the original scaffold.
The [PR-01B handoff](docs/pr-handoffs/PR-01B.md) records the current changes,
executed checks, package addition and known limitations.

## Product catalogue

Open **http://localhost:5173/products**. In the selected company, create units
(for example EA / Adet / ad / 0 decimal places), then product families, then
SKUs with a family and base unit. The catalogue starts empty. Use Edit to rename
or deactivate a record; referenced active records are protected. Codes, base
units and precision are fixed after creation. Searches, filters, paged lists
and an administrator audit trail are available. Refresh the browser after a
permission upgrade. No stock quantities or balances are created by PR-01A.

```text
npm --prefix backend run test:pr01a
npm --prefix backend run test:pr01a:browser
npm --prefix backend run test:journal:performance
npm --prefix backend run test:journal:browser
```

These gates use disposable test databases on the verified local MySQL instance.
Only one browser gate can occupy port 5184 at a time. See the
[product contract](docs/architecture/products.md) for permissions and lifecycle.

## Specifications, GTİP and supplier mappings

In Products, create Specification definitions, then use a SKU's **Details** to
set values and propose dated GTİP entries. Stock-defining values are fixed once
saved. GTİP proposals require review and broker evidence before verification.
Use **Set end date** when a valid code changes from a later date; **Retire**
withdraws an erroneous entry for all dates while keeping history.

Create a catalogue Supplier reference, then propose its original item code and
description under Supplier aliases. Review → Verify enables exact matching.
Reject/retire a mapping before proposing a replacement revision. The original
wording and earlier candidates remain recorded. These references do not yet
create payable accounts or purchasing records. Refresh the page after migration
to load the new review permission. See the
[classification contract](docs/architecture/product-classification.md).

```text
npm --prefix backend run test:pr01b
npm --prefix backend run test:pr01b:browser
```

The browser command includes product, classification, accounting and identity
flows in a disposable database. No real supplier, tariff or invoice data is seeded.
