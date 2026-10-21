# Identity, sessions and legal-entity access — PR-00B

The existing Express/MySQL and React application is extended in place.
PR-01A now uses the new user-authorized design baseline; identity does not depend on future inventory tables.
Navigation stays in the sidebar, including the account and legal-entity selector.
No top bar, breadcrumb bar or separate page-introduction banner is introduced.

## Data and scope

`m002_auth_roles_scopes` adds tenants, legal entities, users, roles, permissions,
role permissions, user role assignments, auth sessions and login rate-limit
buckets. It seeds only permission definitions; it does not create users or
business records. Composite foreign keys bind users, roles, assignments and
session contexts to the same tenant. Applied migrations remain immutable.

A user belongs to one tenant. Login uses workspace code + normalized email +
password. The same email may exist independently in another tenant.
Email is normalized to lowercase and compared exactly at login; MySQL's
accent-insensitive default must not create alternate login/rate-limit identities.
Each role assignment specifies one legal entity. There are no implicit global
administrator privileges or nullable wildcard entity scopes. The initial
administrator receives all currently defined permissions for the initial entity
only. Creating future entities does not automatically grant access.

`workspace.read` makes an assigned entity available as a working context.
Permissions are recomputed from the database; they are not trusted from JWT
claims, query parameters or frontend state. Organization reads require
`organizations.read`; name updates require `organizations.update` independently
in the route and service. SQL always includes the authenticated tenant.
The organization list is paginated in SQL. The identity response contains the
user's assigned active entities for the selector, never the full tenant directory.

The current context is stored per session. Switching context validates the
target assignment, persists it and replaces frontend context/content. Revoked
access produces no active entity and no permissions; it does not grant a fallback
role. The Accounting page is implemented in PR-00C; other business module pages
remain permission-gated placeholders except Products, implemented in PR-01A. See [accounting](accounting.md) for its
five additional permissions and explicit ADMIN-role migration grants.
User/role administration screens, invitations, password recovery and MFA are
outside this PR. Provisioning uses the explicit local/administrator CLI only.

## Authentication and request protection

- Passwords use bcrypt cost 12. Setup requires at least 15 characters and at
  most 72 UTF-8 bytes; longer bcrypt inputs are rejected instead of truncated.
  Passwords, hashes, session tokens and signing secrets are never logged.
- JWTs use HS256 with a fixed issuer/audience, subject, tenant and session ID.
  Verification restricts the algorithm and checks expiry. A matching active
  database session and active user/tenant are required for every protected request.
- Sessions default to eight hours, configurable from five minutes to 24 hours.
  There is no refresh token. Sign-in replaces the presented session; logout
  revokes the database session and clears cookies. Replaying its cookie fails.
- Cookies are HttpOnly, SameSite=Strict, Path=/, without Domain. Production
  requires HTTPS and uses Secure `__Host-export_session` / `__Host-export_csrf`.
  Local HTTP uses `export_session` / `export_csrf`.
- CSRF tokens use an HMAC with a session binding, random nonce and one-hour
  expiry. Anonymous login tokens are replaced with session-bound tokens after
  sign-in. The token is returned in JSON and matched against its HttpOnly cookie
  and `X-CSRF-Token` header. Copying both values from another session fails.
- Every write also requires application/json, an exact allowed Origin, and no
  cross-site Fetch Metadata flag. Non-browser clients follow the same protocol.
  The frontend obtains a fresh/current token before each write and never
  automatically retries a mutation.
- CORS permits GET/HEAD/OPTIONS/POST/PATCH and the explicit CSRF header.
  Production deployment must serve UI/API on the same site and configure origins.
- Login limits persist in MySQL: 20 attempts per workspace/email and 100 per peer
  IP per 15 minutes, including successful attempts. Stored bucket keys are hashes.
  HTTP 429 includes Retry-After. Expired buckets and old sessions are cleaned in
  bounded batches. A multi-process deployment shares the same limits.
- Express does not trust forwarded IP headers. A future proxy deployment must
  explicitly review trusted proxy hops; until then the IP limit aggregates at the
  peer address. Do not enable unrestricted `trust proxy`.
- All identity responses use Cache-Control: no-store and existing request IDs.
  Unexpected DB errors use the sanitized error envelope.

## Endpoints

All application authentication endpoints use `/api/v1`.

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/auth/csrf` | Public token bootstrap; matching cookie required for writes |
| POST | `/api/v1/auth/login` | CSRF, Origin, rate limits, workspace/email/password |
| POST | `/api/v1/auth/logout` | Authenticated, CSRF; revokes the current session |
| POST | `/api/v1/auth/context` | Authenticated, CSRF, workspace.read on requested entity |
| GET | `/api/v1/me` | Authenticated profile and current entity permissions |
| GET | `/api/v1/organizations` | Assigned readable entities; offset/limit, maximum 100 |
| GET | `/api/v1/organizations/:id` | Scoped organizations.read |
| PATCH | `/api/v1/organizations/:id` | Scoped organizations.update, CSRF; name only |

The existing `/health` and `/api/v1/ready` remain public infrastructure probes.
The OpenAPI file documents request/response bodies and error codes.

## Setup

From the repository root, after configuring the dedicated local database:

```text
npm --prefix backend run db:migrate
npm --prefix backend run db:migrate:status
```

`AUTH_SECRET` must contain at least 32 random bytes encoded as hex.
`AUTH_SESSION_SECONDS` defaults to 28800. Keep both in backend environment only.
The liveness endpoint remains independent of auth configuration; auth routes
return a clear 503 if the secret is missing or invalid.

For the repository-owned local development instance:

```text
npm --prefix backend run setup:local-auth
```

This opt-in helper verifies the database name and MySQL data directory, adds a
generated secret to ignored `backend/.env` if absent, and writes a generated
password to ignored `.local/auth/initial-account.json`. Open that file locally to
sign in. It never prints credentials, resets an existing account or changes an
existing tenant. Restart the API after first setup.

For a separately configured database, use `setup:admin` with these environment
variables supplied privately (not as command-line arguments):

```text
SETUP_TENANT_CODE
SETUP_TENANT_NAME
SETUP_ENTITY_CODE
SETUP_ENTITY_NAME
SETUP_ADMIN_EMAIL
SETUP_ADMIN_NAME
SETUP_ADMIN_PASSWORD
```

```text
npm --prefix backend run setup:admin
```

The setup transaction creates one new tenant/entity/admin and scoped role. It
refuses an existing workspace and never resets credentials. Clear the setup
password from the environment afterward. No public setup/signup endpoint exists.

## Verification

```text
npm --prefix backend run test:pr00
npm --prefix backend run test:pr00b
npm --prefix backend run test:pr00b:browser
npm --prefix backend run check:openapi
npm --prefix frontend run lint
npm --prefix frontend run build
```

The integration harness verifies the repository-owned MySQL data directory,
creates a random disposable database/account, and removes only its own resources.
The auth tests exercise upgrades, fresh schema, isolation, authorization, CSRF,
token expiry/replay, revocation, rate limits and scoped foreign keys.
The browser harness starts owned API/Vite servers against a disposable database
with synthetic users. Port 5184 must be free. It closes both servers and deletes
only its disposable database/account after the browser exits.

`npm --prefix frontend run test:smoke` instead uses the running local app and
ignored initial account file. It signs in/out, checks routes, mobile navigation
and readiness. Entity mutations and restricted-role scenarios are exercised only
when the isolated harness supplies synthetic fixtures.

References:
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[jsonwebtoken verification](https://github.com/auth0/node-jsonwebtoken),
[bcrypt input limits](https://github.com/kelektiv/node.bcrypt.js).
