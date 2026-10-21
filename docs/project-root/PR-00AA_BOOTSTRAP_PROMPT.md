# PR-00AA — Export Accounting Project Bootstrap (Coding-Agent Prompt)

**Status:** completed. This is the original bootstrap brief. PR-00A infrastructure
and PR-00B identity and PR-00C accounting are also implemented; follow
`PR_BUILD_INSTRUCTIONS.md` for the current sequence (PR-01C follows completed
PR-01A/PR-01B and the newly authorized design baseline). Do not recreate the existing project. Deliverables and next-step wording
below describe the original bootstrap only.

## Context

You are a coding agent. Build the **initial repository, project structure, and dependency installation** for a brand-new, standalone application named `export-accounting`. Use the uploaded `SaaP-main.zip` as a **read-only technical reference** for architecture, naming conventions, dependency choices, and development scripts. **Do not copy SaaP's complete ERP implementation, business modules, production database, credentials, `.env`, or internal data.** Do not edit SaaP itself.

This app is a Turkish trading-exporter inventory and accounting system. Later modules will include product families/SKUs, e-invoices, virtual country stock pools, immutable inventory, customs, and VAT attribution/refunds. **PR-00AA is only bootstrap**: do not implement those business features now.

### Stack (align with the reference)

- Backend: Node.js, JavaScript ESM (`"type": "module"`), Express 5, `mysql2/promise`, MySQL 8, dotenv, cors.
- Frontend: React 19 (JavaScript + JSX, **not TypeScript**), Vite 7, Tailwind CSS 4, `@tailwindcss/vite`, React Router 7, Axios, Lucide React, Radix/shadcn-compatible components, `clsx`, `tailwind-merge`, `class-variance-authority`. Add Zustand only if helpful for the future structure; do not use it unnecessarily in this PR.
- Developer tooling: nodemon, ESLint, Git, npm lockfiles. OpenAPI parser/test runner and advanced UI components can be wired in PR-00A if not required for bootstrap.
- Keep `backend/` and `frontend/` as **separate npm projects**, matching SaaP. Use current versions compatible with the reference majors and your installed Node.js version; preserve `package-lock.json`.

### Tasks — carry them out in order

**1. Check prerequisites**
- Inspect `SaaP-main.zip` package manifests, `frontend/vite.config.js`, and backend database/migration conventions before writing code.
- Check `node --version`, `npm --version`, `git --version`, and whether MySQL 8 client/server is available.
- Verify Node.js satisfies the selected Vite version's engine requirement. If missing prerequisites can be installed safely in the environment, install them; otherwise give exact platform-specific installation instructions. Do not pretend MySQL is installed because `mysql2` exists.
- Do **not** uninstall or change existing global software or reuse the SaaP database.

**2. Create the standalone repository**
- Create `export-accounting/` with `backend/`, `frontend/`, `docs/`, and `scripts/`.
- Add a root `README.md`, `.gitignore`, and optional root `package.json` only if it simplifies dev commands. Initialize Git if not already inside an intended repository; never overwrite another repo's Git history.
- Add separate `backend/.env.example` and `frontend/.env.example`. Never commit real `.env` files, access tokens, passwords, or SaaP credentials.

**3. Initialize backend and install packages**
- Run `npm init -y` inside `backend/`, set `type=module`, and install:
  - Runtime: `express@^5 mysql2@^3 dotenv cors`
  - Development: `nodemon`
- Create scripts `dev`, `start`, and `test` (the last may run a basic Node smoke test).
- Create minimal ESM modules for config loading, Express app bootstrap, MySQL pool creation, and HTTP server startup. The pool must take credentials exclusively from environment variables; **no hardcoded password or implicit root credential**.
- Configure API dev port **3000**. Separate `app.js` (testable without binding a port) from `index.js` (server startup).
- Add `/health` returning a simple JSON service status. A **separate** database readiness endpoint can be introduced in PR-00A; never report a successful DB connection unless tested.
- Add a clear error if mandatory settings are absent when DB functionality is attempted.

**4. Initialize frontend and install packages**
- Scaffold the React **JavaScript** template using Vite 7 (e.g. `npm create vite@7 frontend -- --template react`, adapted if the directory already exists).
- Install runtime dependencies: `react@^19 react-dom@^19 react-router-dom@^7 axios lucide-react radix-ui clsx tailwind-merge class-variance-authority`.
- Install developer dependencies: `vite@^7 @vitejs/plugin-react @tailwindcss/vite tailwindcss eslint @eslint/js eslint-plugin-react-hooks eslint-plugin-react-refresh globals`.
- If reusing SaaP visual styling, add `@fontsource-variable/geist` and `tw-animate-css`. Use `@import "tailwindcss";` in frontend styles and register the Tailwind Vite plugin.
- Configure a Vite dev server at **http://localhost:5173** and proxy `/api` to **http://localhost:3000**. Also proxy `/health` only if intentionally used from the frontend. Set `@` alias to `frontend/src`.
- Create a minimal responsive layout with **sidebar-only navigation** and pages: Dashboard, Products, Inventory, Exports, VAT, Accounting, Settings. Do not add a top navigation bar, app header or breadcrumb bar. On mobile, use a standalone menu button to open the sidebar drawer. Start pages directly with their main content; omit separate page-introduction blocks such as “Your workspace”, the page name and a subtitle. Keep meaningful headings inside content panels. They are **navigation placeholders only**, not operational modules. Use React Router 7.
- Configure the Axios client to use relative `/api/v1` paths, `withCredentials: true`, and consistent error handling. Avoid hardcoded production URLs.
- Prepare a `components/ui/` directory, and add only a few working shared UI primitives. Do not bulk copy SaaP UI code or install all unused dependencies.

**5. Prepare folders for future PRs (without implementing modules)**

```text
export-accounting/
  README.md
  .gitignore
  docs/
    architecture/
    pr-handoffs/
  scripts/
  backend/
    package.json
    package-lock.json
    .env.example
    src/
      app.js
      index.js
      config/
        env.js
      db/
        pool.js
      middleware/
      routes/
      services/
      validators/
      migrations/
      shared/
    tests/
  frontend/
    package.json
    package-lock.json
    .env.example
    vite.config.js
    index.html
    src/
      main.jsx
      App.jsx
      index.css
      api/
        client.js
      components/
        ui/
      layouts/
        AppLayout.jsx
      pages/
        dashboard/
        products/
        inventory/
        exports/
        vat/
        accounting/
        settings/
      auth/
      contexts/
      hooks/
      lib/
```

Include actual placeholder/tracked files where needed because Git does not track empty directories. Naming may differ slightly to comply with established SaaP conventions, but explain deviations.

**6. Prepare MySQL connectivity safely**
- `mysql2` is a Node.js driver; install/provision **MySQL Server 8 separately** if needed and possible.
- Use a dedicated local **development database** `export_accounting_dev`, not `SaaP` or production data. Do not run DROP/RESET commands against any existing database.
- Suggested backend `.env.example`: `NODE_ENV=development`, `PORT=3000`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=export_accounting_dev`, `DB_USER=export_app`, `DB_PASSWORD=`, `DB_CONNECTION_LIMIT=10`, `CORS_ORIGIN=http://localhost:5173`.
- Provide an optional, clearly labelled local setup SQL snippet for the dev database/user and utf8mb4. **Ask for credentials or permission before changing a live server**. Do not store the password in generated documentation.
- Create a basic `npm run db:check` script that executes `SELECT 1 AS ok` and exits with an error if the server/config is unavailable. Do not automatically create any production database. PR-00A will implement and test the full migration runner.

**7. Documentation and quality checks**
- Root README must give exact commands for Windows PowerShell and cross-platform terminals to install, configure and run backend/frontend, including two development terminals.
- Document which packages were installed, how the Vite proxy works, why MySQL Server is different from `mysql2`, and which secrets must remain local.
- Provide a safe `.gitignore` covering `node_modules`, `.env`, `.env.*` except `.env.example`, build output, logs, coverage, and operating-system junk.
- Validate the following (perform commands when environment supports them):
  - `npm install` in backend and frontend
  - Backend `npm run dev` boots and `GET http://localhost:3000/health` returns HTTP 200
  - `npm run db:check` succeeds **only if local MySQL was properly configured**; otherwise report `BLOCKED`, not PASS
  - Frontend `npm run dev` starts at port 5173 and routes render
  - Frontend `npm run lint` and `npm run build` succeed
  - Git status contains no secrets, `node_modules`, or compiled build output
- Avoid npm dependency conflicts by verifying selected package compatibility. Do not fake test results.

### Explicit exclusions for PR-00AA

Do **not** implement tenant authentication, RBAC, accounting GL, purchasing, warehouse receipts, inventory postings, country pool balances, export cards, customs or VAT refund calculations in this PR. Do **not** run any real Excel migration, parse `Ortak Malzeme.xlsx` into the database, reconstruct historical opening balances, or create synthetic refund entitlements.

### Required final handoff

Return a concise report with:
1. Actual repository tree created.
2. Packages and versions installed, with lockfiles.
3. `.env.example` keys (no real credentials).
4. Commands to start both apps and test DB connectivity.
5. Commands executed and their **actual** PASS/FAIL/BLOCKED status.
6. Remaining prerequisites and any deviations from SaaP.
7. Clear instruction: **next PR is PR-00A (foundation, migration runner, readiness checks and OpenAPI), not PR-01 yet**.

**Definition of done:** A clean, reproducible, documented repository where both development apps run, packages are installed, the UI navigation shell renders, the backend health route works, and MySQL connectivity can be verified without touching SaaP or any production data.
