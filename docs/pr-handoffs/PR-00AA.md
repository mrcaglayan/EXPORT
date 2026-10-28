# PR-00AA handoff — Project Foundation

**Current status — 28 October 2026:** PR-05B is implemented; see the
[PR-05B handoff](PR-05B.md). PR-06A is next. Dated results below retain their
original delivery scope and historical next-step context.

Historical handoff. PR-00A, PR-00B and PR-00C have since been implemented; the
[PR-00C handoff](PR-00C.md) records current status and the PR-01A design prerequisite.

Implemented and verified on **20 October 2026 (Europe/Istanbul)**.
Standalone repository: `C:\Users\ucaglayan\Desktop\Export\export-accounting`.
Git initialized on `main`; source and both lockfiles are staged for review.
No commit, remote, GitHub pull request or hosted deployment was created.

Layout revised at the user's request on 20 October 2026: removed the global
top bar, breadcrumbs and its Preview badge. Navigation remains in the desktop
sidebar and a mobile drawer opened by a standalone floating Menu button.
Page content now starts directly at the top of the main area. This sidebar-only
layout is required for future PRs; the bootstrap brief, execution instructions,
roadmap, README and architecture notes have been updated accordingly.
The subsequent layout refinement also removes the repeated “Your workspace”,
page-name and subtitle introduction from the dashboard and all module pages.
Pages now begin with their content panels, whose headings retain semantic H1
structure. The same rule is recorded in all project plans and layout guidance.
After this layout revision, frontend lint, production build and the existing
seven-route desktop/mobile browser smoke check all passed. Updated screenshots
were inspected. The already-running development servers were reused.

## Repository tree

Generated/ignored `.git`, `.local`, `.env`, `node_modules` and `dist` are omitted.
Each reserved directory contains an actual `.gitkeep`.

```text
export-accounting/
  .gitattributes
  .gitignore
  .nvmrc
  README.md
  docs/
    architecture/bootstrap.md
    pr-handoffs/PR-00AA.md
  scripts/
    local-mysql.mjs
    local-setup.example.sql
  backend/
    .env.example
    package.json
    package-lock.json
    scripts/db-check.js
    src/
      app.js
      index.js
      config/env.js
      db/pool.js
      middleware/.gitkeep
      routes/.gitkeep
      services/.gitkeep
      validators/.gitkeep
      migrations/.gitkeep
      shared/.gitkeep
    tests/bootstrap.test.js
  frontend/
    .env.example
    package.json
    package-lock.json
    eslint.config.js
    vite.config.js
    index.html
    scripts/smoke.mjs
    src/
      main.jsx
      App.jsx
      index.css
      api/client.js
      components/ui/
        button.jsx
        badge.jsx
        card.jsx
      layouts/AppLayout.jsx
      pages/
        ModulePlaceholder.jsx
        NotFoundPage.jsx
        dashboard/DashboardPage.jsx
        products/ProductsPage.jsx
        inventory/InventoryPage.jsx
        exports/ExportsPage.jsx
        vat/VatPage.jsx
        accounting/AccountingPage.jsx
        settings/SettingsPage.jsx
      auth/.gitkeep
      contexts/.gitkeep
      hooks/.gitkeep
      lib/
        navigation.js
        utils.js
```

## Installed direct packages

Both projects have npm lockfile v3. These are installed versions from
`npm ls --depth=0`, not just manifest ranges.

| Backend runtime | Version |
|---|---|
| express | 5.3.0 |
| mysql2 | 3.24.6 |
| dotenv | 18.0.8 |
| cors | 2.8.6 |
| nodemon (development) | 3.1.14 |

| Frontend runtime | Version |
|---|---|
| react / react-dom | 19.3.1 / 19.3.1 |
| react-router-dom | 7.18.4 |
| axios | 1.20.0 |
| lucide-react | 1.60.0 |
| radix-ui | 1.8.1 |
| clsx | 2.1.1 |
| tailwind-merge | 3.7.0 |
| class-variance-authority | 0.7.1 |
| @fontsource-variable/geist | 5.3.0 |
| tw-animate-css | 1.4.0 |

| Frontend development | Version |
|---|---|
| vite | 7.3.7 |
| @vitejs/plugin-react | 5.2.0 |
| tailwindcss / @tailwindcss/vite | 4.3.3 / 4.3.3 |
| eslint / @eslint/js | 10.13.0 / 10.0.1 |
| eslint-plugin-react-hooks | 7.1.1 |
| eslint-plugin-react-refresh | 0.4.26 |
| globals | 16.5.0 |
| playwright-core | 1.64.1 |

## Configuration and startup

Backend `.env.example` keys: `NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`, `DB_CONNECTION_LIMIT`, `CORS_ORIGIN`.
Frontend `.env.example` key: `VITE_APP_NAME`.
Passwords are absent from examples and documentation. Locally generated app and
instance admin credentials exist only in ignored files.

From the repository root, after installation/configuration:

```text
node scripts/local-mysql.mjs start
npm --prefix backend run db:check
```

Then run in separate terminals:

```text
npm --prefix backend run dev
npm --prefix frontend run dev
```

Open http://localhost:5173. API health: http://localhost:3000/health.
PowerShell may use `npm.cmd` for all npm commands. See the root README for fresh
checkout instructions, manual SQL setup, and cross-platform commands.

## Actual verification

| Command/check | Actual result |
|---|---|
| `node --version`, `npm --version`, `git --version` | PASS — 24.20.0, 11.19.0, 2.55.0.windows.5 |
| `mysql --version`, `mysqld --version` | PASS — independently installed MySQL 8.0.44 client and server |
| Reference archive inspection | PASS — manifests, Vite config, DB and migration conventions read; no reference code executed |
| `npm init -y` in backend; `npm create vite@7 frontend -- --template react` | PASS — JavaScript skeletons |
| `npm install` in backend and frontend | PASS — separate dependency trees and lockfiles, no peer resolution failures |
| `npm ls --depth=0` in both projects | PASS — installed versions above |
| `npm test` in backend | PASS — 3 tests: HTTP behavior, missing credentials, invalid config |
| `npm run dev` in backend | PASS — nodemon launches API on port 3000 |
| `curl --fail-with-body -i http://localhost:3000/health` | PASS — HTTP 200, JSON service status |
| `npm run db:check` before configuration | BLOCKED — missing DB settings, exit 1 as required |
| Local MySQL initial setup attempt | FAIL, resolved — hostname-resolution option prevented initial account access; helper corrected and fresh local setup repeated |
| `node scripts/local-mysql.mjs init` after correction | PASS — dedicated new instance, database and scoped user |
| `npm run db:check` with configured local instance | PASS — actual `SELECT 1 AS ok`, exit 0 |
| Read-only DB identity/table inspection | PASS — `export_accounting_dev`, `export_app`, zero schema/business tables |
| `node scripts/local-mysql.mjs stop` / `start` | PASS — owned-instance lifecycle |
| `npm run db:check` while deliberately stopped | BLOCKED — `ECONNREFUSED`, exit 1 as required |
| `/health` while MySQL deliberately stopped | PASS — liveness still HTTP 200, no DB readiness claim |
| `npm run db:check` after restart | PASS — actual successful reconnection |
| `npm run dev` in frontend | PASS — Vite starts at http://localhost:5173 |
| `npm run lint` in frontend | PASS |
| `npm run build` in frontend | PASS — 2,073 modules, production bundle generated |
| Initial `npm run test:smoke` | FAIL, resolved — Vite optimized a newly imported Axios dependency and reloaded the page; explicit Axios pre-bundling added |
| Final `npm run test:smoke` | PASS — installed Edge, seven routes, active navigation, links, mobile drawer/Escape, overflow, 404, API proxy and normalized client error, no uncaught browser errors |
| Desktop/mobile screenshot inspection | PASS — dashboard and module placeholder inspected |
| Backend `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| Frontend npm install audit | PASS — 0 vulnerabilities |
| Backend full `npm audit` | FAIL — 3 high findings in one development dependency chain; see below |
| Git ignore/staged-content checks | PASS — no local secrets, node_modules or builds staged |

Browser screenshots are retained locally at:
`.local/screenshots/dashboard-desktop.png`,
`.local/screenshots/dashboard-mobile.png`,
`.local/screenshots/inventory-mobile.png`.

## Limitations and remaining work

- **Development dependency audit:** nodemon 3.1.14 pulls chokidar 3/braces 3.
  npm reports [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  across braces, chokidar and nodemon. The advertised npm remedy downgrades
  nodemon to 1.14.10; no forced downgrade or incompatible transitive override was
  applied. Production dependencies audit clean. Revisit when a compatible
  upstream fix is available.
- npm 11 reports an unapproved esbuild postinstall script. The platform binary
  installed successfully and real Vite dev/build/browser checks pass. No global
  npm script approval policy was modified.
- PowerShell process launch was denied in the tool environment; implementation
  commands ran through Windows Command Prompt. PowerShell instructions are
  documented, but that shell was not executable in this session.
- No prerequisites remain for the tested local instance. Other machines need
  Node 24+, MySQL Server 8, package installation and their own local credentials.
  The optional database lifecycle helper was verified on Windows.
- At the initial bootstrap handoff, the local database and both app servers were
  stopped. Data and local credentials remain available; use the startup commands
  above when needed.
- No business modules, auth/RBAC, migration runner, readiness endpoint, OpenAPI,
  production deployment or real workbook import exists in PR-00AA.
- See [reference alignment](../architecture/bootstrap.md) for deviations:
  split config/pool files, explicit dev proxy, Node 24/ESLint 10, selected UI
  primitives, and deliberately deferred SaaP packages/modules.

**Next PR is PR-00A: foundation behavior, migration runner, readiness checks and
OpenAPI. It is not PR-01 yet.**
