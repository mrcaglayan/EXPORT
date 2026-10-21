# PR-00AA architecture and SaaP reference review

This is the historical bootstrap architecture. PR-00A has since added migrations,
transactions, readiness, security/error middleware and a Settings connection
panel; see [current foundation operations](migrations.md). PR-00B has added
[identity and scoped access](identity.md). The details below describe the
original bootstrap only. PR-00C [accounting](accounting.md) is now implemented;
PR-01A [products](products.md) is now implemented from the new user-authorized design baseline; PR-01B classification is also implemented; PR-01C is next.

Reference inspected read-only on 20 October 2026:
`C:\Users\ucaglayan\Downloads\SaaP-main\SaaP-main.zip`.
The archive became available after the initial npm skeletons were created and
before application implementation. Only selected source/manifests were read.
SaaP was neither executed nor edited; no `.env`, credentials, databases or
business records were copied.

## Inspected files and retained conventions

| Reference file | Observed convention | Implementation |
|---|---|---|
| `backend/package.json` | ESM, Express 5.2.1 range, mysql2 3.17.1 range, dotenv/cors, nodemon dev command | Separate private backend npm project; same runtime family |
| `frontend/package.json` | React 19, Vite 7, Tailwind 4, Radix, Geist, Axios, Router 7, Lucide, clsx/CVA/tailwind-merge | Separate JSX project, selected dependencies only |
| `frontend/vite.config.js` | React and Tailwind plugins; `@` source alias | Same plugins/alias; explicit localhost port and API proxy |
| `backend/src/db.js` | `mysql2/promise`, pool, `dateStrings: ['DATE']`, query/transaction helpers | Lazy pool, environment-only credentials, DATE preservation |
| `backend/src/migrationRunner.js` | `schema_migrations`, ordered migration registration, `up(connection)` | Reviewed; deferred to PR-00A |
| `backend/src/migrations/index.js` | Explicit imported JavaScript migration registry | Tracked empty migrations directory; no SaaP migrations copied |

## Boundaries

```text
Browser :5173
  React Router -> layout + seven placeholder pages
  Axios /api/v1 -> Vite /api proxy -> Express :3000
                                      /health (process only)
                                      no business endpoints

db:check -> validated env -> lazy mysql2 pool -> dedicated MySQL 8
                                               SELECT 1 only
```

`app.js` is importable without listening; `index.js` owns the HTTP server.
Configuration validation is deferred for database use, so liveness and UI work
without a database. DB settings have no fallback credentials. The application
never initializes schemas. The separate opt-in local helper owns only a new data
directory under ignored `.local/mysql` and checks its identity before SQL writes.

Frontend folders are ready for future auth/contexts/hooks; no empty providers,
Zustand store, session handling or permission rules were invented. Shared
primitives are Button (Radix Slot/CVA), Badge and Card; Radix Dialog provides the
mobile navigation focus/keyboard behavior. Styling is newly written using the
reference's font/library choices.

**Standing layout decision (20 October 2026):** sidebar-only navigation, with no
global top navigation/header or breadcrumb bar. The desktop sidebar stays visible;
a standalone floating Menu button opens the mobile drawer. Content starts directly
at the top of the main area. Future account/legal-entity controls belong in the
sidebar or relevant page. Pages start directly with their main content; omit
separate “Your workspace”/page-name/subtitle introductions. Meaningful headings
and actions remain within content panels.
This applies to every later PR, including the PR-00B identity layout.

## Deliberate deviations

- `src/config/env.js` and `src/db/pool.js` separate concerns previously combined
  in SaaP's `src/db.js`. Transaction helpers come in PR-00A.
- No default root account/password, database auto-create, drop/reset commands,
  full ERP modules or copied migrations.
- Explicit `/api` dev proxy to IPv4 localhost avoids localhost IPv6 ambiguity.
  The reference Vite config did not declare this proxy.
- ESLint 10 replaces the deprecated reference 9 series; compatible React lint
  plugins are installed. Node 24 is the shared project baseline.
- React Compiler, shadcn CLI, Zustand, Redis, JWT/bcrypt, YAML/OpenAPI tooling and
  bulk UI components are deferred. JavaScript only; no TypeScript toolchain.
- No root npm workspace/package: backend and frontend stay independent.
- `playwright-core` matches the reference's browser-testing approach and uses
  an installed browser; it does not ship a second browser.
- Bootstrap's specific exclusions take precedence over the broader roadmap's
  generic per-PR migration/auth/OpenAPI checklist and stale “start PR-00A” note.

Technical references:
[Vite server proxy](https://vite.dev/config/server-options),
[Tailwind Vite installation](https://tailwindcss.com/docs/installation/using-vite),
[mysql2 promise pools](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-pool).
