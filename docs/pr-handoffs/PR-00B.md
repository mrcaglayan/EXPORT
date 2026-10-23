# PR-00B handoff — Identity, authentication and scoped permissions

**Current status — 23 October 2026:** PR-02D is implemented; see the
[PR-02D handoff](PR-02D.md). PR-02E is next. Its newly authorized design baseline resolves the
earlier absent-input prerequisite. Journals now have no fixed line-count ceiling.
The dated implementation/check results below are historical.

Historical handoff. PR-00C is now implemented; see the
[PR-00C handoff](PR-00C.md) for current status and the PR-01A design prerequisite.
The results and next-step statements below describe completion of PR-00B.

Implemented and verified on **20 October 2026 (Europe/Istanbul)** by extending
the existing local application. The development database and prior foundation
migration were preserved. No legacy users or real business records were imported.

## Result

- Registered `m002_auth_roles_scopes` adds nine identity/session/permission tables.
  Composite foreign keys prevent cross-tenant assignments and working contexts.
- Explicit environment-based administrator setup and a repository-only local
  setup helper. Generated secrets remain in ignored local files.
- Workspace/email/password login, bcrypt, HttpOnly JWT cookies, database-backed
  session revocation, expiry, persistent login limits and deny-by-default access.
- Signed session-bound CSRF tokens, required allowed Origin/JSON, and explicit
  CORS POST/PATCH/X-CSRF-Token support.
- Consistent `/api/v1/auth/*`, `/api/v1/me` and `/api/v1/organizations` routes.
- Protected frontend routes, permissions, a login screen, sidebar entity/account
  controls, logout and scoped company-name editing in Settings.
- Existing sidebar-only layout and mobile drawer preserved. No top bar or
  separate “Your workspace / page name / subtitle” introduction.
- All active plans now point to PR-00C. Missing PR-01/02 design inputs remain
  explicitly pending and were not replaced or fabricated.

## Main files

```text
backend/
  package.json, package-lock.json, .env.example, openapi.yaml
  src/
    app.js
    config/auth.js
    migrations/index.js, m002_auth_roles_scopes.js
    middleware/auth.js
    validators/auth.validators.js
    routes/auth.routes.js, organizations.routes.js
    services/identity.service.js, session-security.js, bootstrap-identity.service.js
  scripts/setup-admin.js, setup-local-auth.js, test-pr00.js, test-auth-browser.js
  tests/auth-fixtures.js, auth.integration.js, db.integration.js
frontend/
  src/
    App.jsx, api/client.js, lib/navigation.js, layouts/AppLayout.jsx
    auth/AuthProvider.jsx, auth-context.js, RequireAuth.jsx, RequirePermission.jsx
    auth/LoginPage.jsx, SidebarAccount.jsx
    pages/settings/EntitySettings.jsx, SettingsPage.jsx
  scripts/smoke.mjs
docs/
  architecture/identity.md, migrations.md, bootstrap.md
  pr-handoffs/PR-00B.md, PR-00A.md, PR-00AA.md
```

README and the three parent Markdown planning files were also updated.
Runtime additions: **bcrypt 6.0.0**, **jsonwebtoken 9.0.3** and
**cookie-parser 1.4.7**, recorded in the backend lockfile.
No frontend dependencies were added.

## Actual verification

| Command/check | Result |
|---|---|
| Backend `npm test` | PASS — 12 existing unit/HTTP checks |
| Backend `npm run test:pr00` | PASS — 22 total tests, including fresh migration, rerun, transaction, lock and recovery cases |
| Backend `npm run test:pr00b` | PASS — 14 total tests (parent group plus 13 integration cases) |
| Backend `npm run test:pr00b:browser` | PASS — isolated API/UI and synthetic users/entities |
| Backend `npm run check:openapi` | PASS — 9 documented paths |
| Backend `npm run db:migrate` | PASS — m002 applied once; m001 retained at attempt 1 |
| Backend `npm run db:migrate:status` | PASS — both applied, attempt 1 |
| Local auth setup with user-supplied company/email | PASS — one tenant, entity and administrator; generated password stored locally |
| Repeated local setup | PASS — existing account preserved, no password reset |
| Frontend `npm run lint` | PASS |
| Frontend `npm run build` | PASS — 2,137 modules |
| Frontend `npm run test:smoke` against running local app | PASS — actual configured administrator, login/logout and existing UI regressions |
| Desktop login / mobile account screenshot inspection | PASS |
| Backend `npm audit --omit=dev` | PASS — zero production vulnerabilities |
| Final local state / source checks | PASS — 87 source files contain no generated local secrets; lockfiles match manifests; one local tenant/entity/admin; both migrations applied once; live endpoints respond as expected |

Integration coverage includes tenant isolation for reads and writes; inaccessible
entity selection; users without assignments; direct service permission checks;
valid scoped updates; forged/missing/cross-session CSRF; allowed Origin and JSON;
logout token replay; expired/tampered/wrong-algorithm JWTs; database session expiry;
revoked permissions and disabled accounts; composite FK rejection; existing
workspace setup refusal; password byte limits; persistent login limiting; and
exact normalized-email matching rather than accent-insensitive authentication.

The browser gate checks bad and successful login, return to a protected route,
entity switching persisted through reload, company-name editing, restricted-role
denial, seven existing routes, readiness loading/error/retry, mobile account
controls, logout, layout/overflow and absence of browser runtime errors.
Synthetic mutation tests ran only in disposable databases. Harness-owned
servers, schemas and accounts were cleaned up.

Failures found and resolved during implementation:

- The first migration verification compared temporary-table metadata that MySQL
  reports differently. It now verifies columns, indexes, foreign keys and engine
  with read-only metadata queries. This failed only in disposable databases;
  the development migration succeeded on its first attempt.
- The shared Button defaults to `type="button"`. Login and company forms now
  explicitly declare submit buttons; the browser gate verifies both.
- The first frontend lint run identified effect scheduling; the initial auth
  load is scheduled with cleanup protection and lint now passes.
- A local MySQL start attempt reported port 3306 already occupied. Tests verified
  the existing repository-owned instance and reused it; no server was replaced.

## Local use

Open **http://localhost:5173/login**. The workspace code is **ABC** and the company
is **abc A.Ş.**, as requested. Read the administrator email and generated password
from ignored `.local/auth/initial-account.json`. Passwords are not included in
this handoff or printed to command output.

Existing API/UI/MySQL services were reused and remain running. The API's existing
nodemon watcher was triggered after generating the auth secret so it reloaded
the environment. On another session, use the startup commands in README.

Manual checks:

1. Sign in with the local account and confirm the company selector in the sidebar.
2. Open Settings and confirm Company details and Workspace connection.
3. Open the mobile drawer and sign out.
4. Visit `/inventory`; the app returns to login until authenticated.

## Remaining scope and limitations

- Next is **PR-00C — accounting periods, decimal money handling, balanced journal
  contracts, audit, idempotency and the posting/outbox boundary**.
- `PR01_PR02_database_specification.md` and `PR01_PR02_schema.sql` remain required
  before the subsequent product/inventory schema work.
- User/role administration screens, invitation/recovery flows and MFA are not
  included in this foundation PR. Additional provisioning is an explicit admin
  operation; there is no public registration or credential reset endpoint.
- Production requires HTTPS, configured same-site origins and a reviewed reverse
  proxy trust policy. No hosted deployment was performed.
- The existing nodemon/chokidar/braces development dependency chain still reports
  three high audit findings. No forced downgrade was applied; production
  dependencies audit clean. bcrypt's shipped native binary was exercised in real
  tests without changing npm's global install-script approval policy.
- The isolated browser gate requires installed Edge/Chrome and free port 5184.
- Git changes are prepared locally; no commit, remote or GitHub pull request was
  created.

See the [identity architecture and setup guide](../architecture/identity.md) for
the full API, session, scope and operational contract.
