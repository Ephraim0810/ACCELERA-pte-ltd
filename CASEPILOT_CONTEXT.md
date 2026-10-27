# CasePilot Working Context

Updated: 2026-10-27

## Product
CasePilot is a student-built, synthetic payment-operations prototype. Flow: public payment intake -> backend evidence/risk assessment -> admin investigation -> recorded customer update -> human decision -> outcome verification. It does not connect to OCBC, move money, or send outbound SMS. Explain the synthetic nature during demonstrations.

## Stack and runtime
- Node.js >=22.5; ESM; API server is Node HTTP; SQL adapter uses `@libsql/client` for both local file-backed SQLite (`file:`) and hosted Turso/libSQL.
- `npm ci`, `npm test`, `npm start`; default local URL `http://127.0.0.1:4174`; Windows shortcut `START_CASEPILOT.bat`.
- Local persistent file: `data/casepilot.sqlite`. On first startup, 120 fictional records are seeded/backfilled idempotently. Set both `DATABASE_URL` and `TURSO_AUTH_TOKEN` to use remote Turso.
- Server reads optional Groq key from `GROQ_API_KEY`; default model `openai/gpt-oss-20b`; deterministic fallback runs without key. Never commit `.env` or copy its values into frontend/build assets. User's previously shared Groq key should be rotated before using any public deployment.
- Local demo login defaults to `admin` / `casepilot`. Hosted `NODE_ENV=production` requires explicit DB/token/admin configuration and rejects that default password. Admin sessions live in process memory and reset on restart.

## Pages and APIs
- `/` login, `/payment` public payment intake, `/transactions` admin payment queue, `/admin` admin workspace.
- `/api/payments` public creation; admin-gated list/details/actions: `/api/payments/{id}`, `/analyze`, `/message`, `/decision`, `/verify`.
- `/api/demo/login`, `/api/demo/session`, `/api/demo/logout`; legacy case API under `/api/cases`; docs `/api/docs`; health `/api/health` checks database readiness and returns no connection details.
- Message action writes a message record to the database; it does not send SMS. Decision/verification actions change synthetic workflow state only.

## Workflow and policy
- Payment inputs include payer/payee/account/bank/reference/amount/rail/purpose. Backend compares beneficiary details against fictional stored records: match can be routine; unknown account routes to human review; known account plus conflicting name or other hard stop escalates.
- AI recommends low/uncertain/high -> routine/human_review/escalate; deterministic policy floors and hard stops cannot be lowered by the model.
- Risk factors: payment status, evidence quality, potential impact, authority concern; each scored 0-2. Thresholds: 0-2 routine, 3-5 human review, 6-8 escalate; hard stops can force review/escalation.
- Human review = operations assessment. Escalation = specialist/higher-authority handling. Both involve a human.
- Admin overrides require reason; active safety stops cannot be overridden. Payments cannot be modified/transferred. Only a closed case can pass outcome verification; escalation and information requests stay open.

## Hosted deployment setup (not deployed yet)
- Architecture: Netlify hosts existing `public/` assets. Its build generates a same-origin `/api/*` proxy to the Render API using the public `RENDER_API_URL` origin. Render runs the Node API and stores state in Turso via libSQL. Groq is optional and called server-side only.
- Files: `render.yaml`, `netlify.toml`, `scripts/build-netlify.mjs`; the latter validates HTTPS `*.onrender.com` origin and creates ignored `public/_redirects`. Public output includes only the Render API origin/proxy rule, never DB/admin/Groq secrets.
- Render hosted variables: `NODE_ENV=production`, `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DEMO_ADMIN_USER`, strong unique `DEMO_ADMIN_PASSWORD`; optional `GROQ_API_KEY`, `AI_PROVIDER`, `AI_MODEL`. Service health path `/api/health`; binds `0.0.0.0` on platform `PORT`.
- Netlify variable: `RENDER_API_URL` at build time, exact service origin, e.g. `https://casepilot-api.onrender.com`, no path/query. Build command and publish directory are in `netlify.toml` (`public/`).
- Turso CLI basics: `turso db create casepilot`; `turso db show casepilot --url`; `turso db tokens create casepilot`. Store returned DB URL and token only in Render env settings.
- Deployment status: not published. Environment shows no `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, Render key, Turso URL/token; workspace has no Git remote. GitHub search found no installed CasePilot repository. Provider account connection, repo link, and secrets remain user steps. No live deploy URL is known.
- After deploy, verify Netlify payment intake, Render `/api/health`, admin login, workflow message/decision/verify, and persistence after a Render restart. Local SQL mode and tests were exercised; live Turso not yet verified.
- Free service behavior/quotas can change; check current provider plan. No billable resource should be enabled without explicit choice.

## Key files
- `src/server.mjs`, `src/db.mjs`, `src/policy.mjs`, `src/ai.mjs`.
- `public/payment.html` + JS, `login.html` + JS, `transactions.html` + admin JS, `admin.html` + management JS, `styles.css`.
- `tests/api.test.mjs`, `policy.test.mjs`, `seed-db.test.mjs`, `ui-environment.test.mjs`, `deployment-config.test.mjs`.
- Full workflow design: `docs/superpowers/specs/2026-10-26-casepilot-full-workflow-design.md`.
- Hosting design and plan: `docs/superpowers/specs/2026-10-27-casepilot-render-netlify-turso-design.md`, `docs/superpowers/plans/2026-10-27-casepilot-hosted-deployment.md`.
