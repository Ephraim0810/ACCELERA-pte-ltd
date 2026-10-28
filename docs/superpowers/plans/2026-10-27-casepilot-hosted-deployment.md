# CasePilot Hosted Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing CasePilot pages on Netlify, the Node API on Render, and persistent SQLite-compatible data on Turso while preserving the local workflow.

**Architecture:** Use `@libsql/client` for both local `file:` SQLite and hosted Turso so the project has one SQL implementation. Convert database operations and their API call sites to async. Netlify builds the existing `public/` files and writes a `/api/*` proxy rule to the configured Render origin, keeping browser API requests same-origin and leaving the product UI unchanged.

**Tech Stack:** Node.js >=22.5, built-in `node:test`, `@libsql/client`, Render Web Service, Netlify static hosting and rewrites, Turso SQLite-compatible database.

**Spec:** `docs/superpowers/specs/2026-10-27-casepilot-render-netlify-turso-design.md`

## Global Constraints

- No real OCBC integration, payment rails, or outbound SMS.
- Local development continues to use a file-backed SQLite database.
- Hosted database credentials and AI/admin secrets remain server-only.
- Render free service local filesystem is not used for durable database data.
- No secrets are committed or embedded in public frontend files.
- No paid hosting resources or claims of a live deployment without verified provider configuration and URL.
- Seed records remain fictional and are inserted idempotently.

## Review Focus

1. Missing Turso credentials must leave local SQLite mode working; test both config branches.
2. Duplicate payment references must remain rejected; pin with the existing duplicate-reference API test.
3. Repeated or concurrent initialization must not duplicate the 120 synthetic seed records; test database initialization and seeding twice.
4. A restarted hosted service must retain payment, message, decision, and audit history; exercise create/read/update/reopen with Turso credentials when available.
5. Invalid provider configuration or a failed database request must return a bounded error without exposing auth tokens; add config and API error tests.

---

## File Map

- `src/db.mjs`: Replace direct synchronous `node:sqlite` access with an async database interface using libSQL; retain local file mode and existing schema/data behavior.
- `src/server.mjs`: Await all DB operations, select hosted/local DB settings, bind Render's `PORT` on the public interface, and keep `/api/health` useful for provider health checks.
- `public/`: Leave product pages and their relative `/api/...` calls unchanged; Netlify serves these static files.
- `scripts/build-netlify.mjs`: Validate `RENDER_API_URL` and generate a same-origin `/api/*` proxy rule in the publish directory.
- `netlify.toml`: Define Netlify build/publish settings, proxy-related security headers, and static site settings.
- `render.yaml`: Define a free Node web service, start/build commands, and `/api/health` health check without embedding secrets.
- `package.json` / `package-lock.json`: Add `@libsql/client` and deployment build scripts.
- `.env.example` / `.gitignore` / `README.md`: Document local-vs-hosted database environment, generated redirect behavior, provider setup, and required server secrets; ignore generated redirects.
- `tests/seed-db.test.mjs`, `tests/api.test.mjs`, `tests/ui-environment.test.mjs`: Update DB setup for async and cover regression behavior.
- `tests/deployment-config.test.mjs`: Add deployment config validation tests.

## Task 1: Async libSQL database layer

**Files:** `package.json`, `package-lock.json`, `src/db.mjs`, `tests/seed-db.test.mjs`

**Interfaces:**
- Produces `async createDatabase({ env = process.env, path = "data/casepilot.sqlite" } = {}) -> Promise<DatabaseStore>`.
- `DatabaseStore` methods preserve current names and payloads, but return promises: `seedCases`, `insertCase`, `createPayment`, `getPayment`, `listPayments`, `saveMessage`, `decidePayment`, `verifyPayment`, `listCases`, `countCases`, `metrics`, `saveAnalysis`, `saveDraft`, `reviewCase`, `updateRecommendation`, and `close`.
- With `env.DATABASE_URL` and `env.TURSO_AUTH_TOKEN`, select Turso; otherwise use a local `file:` URL from `path`.

- [ ] **Step 1: Add failing async adapter tests** for local file selection, schema creation, seed idempotence, payment round trip, message/decision/audit persistence, duplicate references, and close/reopen persistence.
- [ ] **Step 2: Run** `node --test tests/seed-db.test.mjs`; confirm failures describe the async factory/interface and missing hosted/local selection.
- [ ] **Step 3: Add `@libsql/client`** and refactor `src/db.mjs` so local `file:` and Turso share the same async SQL API, schema, returned data mapping, and transaction boundaries. Preserve existing method names and response fields. Use libSQL transactions for multi-row case/payment writes.
- [ ] **Step 4: Run** `node --test tests/seed-db.test.mjs`; require all persistence and idempotence tests to pass.
- [ ] **Step 5: Run** `npm test`; record any callers that still assume synchronous DB results for Task 2.

## Task 2: Async API and Render runtime

**Files:** `src/server.mjs`, `tests/api.test.mjs`, `tests/ui-environment.test.mjs`

**Interfaces:**
- Consumes the promise-returning `DatabaseStore` from Task 1.
- Produces an async dispatcher that resolves each route to the same HTTP status and JSON shape as before.
- Hosted config is selected from `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PORT`, and normal server secret environment variables.

- [ ] **Step 1: Add failing API tests** for async startup, create/read/update flows, legacy case actions, database rejection without leaking connection details, and hosted-mode credential validation.
- [ ] **Step 2: Run** `node --test tests/api.test.mjs tests/ui-environment.test.mjs`; confirm the new async/runtime assertions fail before implementation.
- [ ] **Step 3: Await DB operations** throughout `createApiDispatcher`, request handling, seed startup, logging, and shutdown. Ensure transaction writes remain atomic and `close()` is awaited.
- [ ] **Step 4: Bind the Render server** to `0.0.0.0` using `process.env.PORT` with local fallback `4174`; keep the local UI static routes and existing login flow functional.
- [ ] **Step 5: Make hosted health checks** report service/database readiness without returning credentials; reject missing hosted Turso/admin config at startup with a safe message.
- [ ] **Step 6: Run** `node --test tests/api.test.mjs tests/ui-environment.test.mjs`; require the new tests to pass.

## Task 3: Netlify proxy and deployment configuration

**Files:** `scripts/build-netlify.mjs`, `netlify.toml`, `render.yaml`, `.gitignore`, `.env.example`, `tests/deployment-config.test.mjs`

**Interfaces:**
- `renderNetlifyRedirects(apiUrl: string) -> string` validates an HTTPS Render origin and returns the proxy rule for `/api/*` preserving the suffix.
- Netlify runs `node scripts/build-netlify.mjs`, publishes `public/`, and reads public `RENDER_API_URL` at build time.
- Render serves `npm start` and health-checks `/api/health`.

- [ ] **Step 1: Add failing deployment config tests** for valid URL normalization, rejection of non-HTTPS/malformed URLs, exact `/api/*` rewrite output, and absence of secret variables from generated public config.
- [ ] **Step 2: Run** `node --test tests/deployment-config.test.mjs`; confirm the generator is missing and tests fail.
- [ ] **Step 3: Implement** the build script, `netlify.toml`, Render blueprint, and environment templates. Keep redirects generated at build so no Render URL is guessed or committed. Ignore the generated `public/_redirects` file.
- [ ] **Step 4: Run** `node --test tests/deployment-config.test.mjs`; require all generator/config checks to pass.
- [ ] **Step 5: Run a local Netlify build** with a non-secret placeholder HTTPS Render URL; confirm only static app files and the `/api/*` proxy rule are published.

## Task 4: Setup documentation and full verification

**Files:** `README.md`, `CASEPILOT_CONTEXT.md`, all changed source/config/test files

**Interfaces:** Uses the completed local/hosted configuration, setup keys, and provider files from Tasks 1–3.

- [ ] **Step 1: Update setup docs** with Turso account/database/token creation, Render blueprint deployment, Netlify publish/build settings, the public Render URL variable, and server-only secrets. Include local commands and the default seed behavior; warn the known demo password must be replaced before a public deploy.
- [ ] **Step 2: Add a focused full-flow test** that creates a payment, records a message and decision, verifies the workflow, closes/reopens the DB, and confirms the persisted state.
- [ ] **Step 3: Run** `npm test`; require all API, policy, seed, UI, and deployment tests to pass.
- [ ] **Step 4: Run** `npm start` in local mode and verify `/`, `/payment`, `/api/health`, payment creation, admin login, and list/detail reads against local SQLite.
- [ ] **Step 5: Verify secrets/config hygiene**: `.env` remains ignored, generated Netlify output contains only the public Render URL, and no credential value appears in logs or generated files.
- [ ] **Step 6: Update `CASEPILOT_CONTEXT.md`** with actual routes, environment variables, deployment status, and any remaining provider-dashboard steps.

## Deployment boundary

Code/configuration preparation can be completed in this workspace. Publishing requires the project to be connected to the user's Render and Netlify accounts and a Turso database/token. The repository currently has no `.git` directory in the workspace, so the actual Git-connected provider deploy cannot be completed until the source is connected or pushed. The previously shared Groq key should be rotated before it is placed in a public deployment's server environment; never echo it or commit it.

