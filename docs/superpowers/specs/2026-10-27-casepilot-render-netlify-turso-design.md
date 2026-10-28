# CasePilot Render + Netlify + Turso Deployment Design

## Intent
Prepare CasePilot for a shareable hosted prototype while preserving local development. Netlify serves the existing static pages, Render runs the Node API, and Turso stores hosted SQL data.

## Goals and boundaries
- Use the existing pages and payment workflow without product UI or branding changes.
- Use a local file-backed SQL database during development and Turso/libSQL in hosted mode.
- Keep database, admin, and optional AI credentials server-side.
- Do not connect to OCBC, real payment rails, or outbound SMS; do not present this prototype as production banking software.
- Do not commit secrets or enable paid resources without an explicit user choice.

## Architecture
- Netlify publishes the existing `public/` directory. At build time, `scripts/build-netlify.mjs` validates public `RENDER_API_URL` and writes `public/_redirects`, proxying same-origin `/api/*` requests to the Render service's matching `/api/*` route.
- Render runs the Node HTTP API, binds to `0.0.0.0` and platform `PORT`, and checks `/api/health`.
- The API stores records via `@libsql/client`, using a local `file:` URL if hosted credentials are absent, or `DATABASE_URL` plus `TURSO_AUTH_TOKEN` for Turso.
- Optional Groq requests are made from the API using server-only `GROQ_API_KEY`.

## Startup and data
- Local startup uses `data/casepilot.sqlite`; run `npm ci`, then `npm start`. `PORT` defaults to 4174.
- Seed/backfill of 120 fictional records is idempotent. Existing local SQLite data is not automatically imported to Turso; a hosted deployment begins with the synthetic seed data unless a separate import flow is built.
- In `NODE_ENV=production`, startup requires `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DEMO_ADMIN_USER`, and a nondefault `DEMO_ADMIN_PASSWORD`.
- `/api/health` reports whether the service/database is ready and returns a bounded response on database failure. It does not return DB connection information.

## Secrets and public configuration
- Render secrets: `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DEMO_ADMIN_USER`, `DEMO_ADMIN_PASSWORD`; optional `GROQ_API_KEY`.
- Netlify build configuration: only public `RENDER_API_URL` (an HTTPS `*.onrender.com` origin without path/query). The generated redirect output must not include any secret or private database URL.
- Replace local demo credentials before public deployment. Groq key previously shared by the user should be rotated before adding it to a public service.
- Admin sessions remain in process memory and reset when Render restarts; this is acceptable for the student prototype but not a production authentication design.

## Verification and remaining steps
- Automated tests cover the async DB layer, API contracts, local/hosted configuration checks, health failures, deployment URL validation, generated proxy output, and persistence after reopen.
- Local startup and API workflow can be verified without any provider account. Live Turso connectivity, Render deployment, and Netlify deployment require the user's repository and provider-account access and remain unverified until actually run.
- Deployment requires a Git repository connected to both providers, Turso database credentials entered in Render, a successful Render URL, and that URL added as Netlify's `RENDER_API_URL`.
- Free-tier availability, limits, and spin-down behavior depend on current provider terms; confirm them in provider dashboards before enabling any paid resource.
