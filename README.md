# CasePilot

**Investigate clearly. Resolve with confidence.**

CasePilot is a student-built payment-operations prototype. It demonstrates payment intake, exception assessment, operations review, customer communication, and outcome tracking. For the school presentation, explain that payment records and customer updates are synthetic: the app does not connect to OCBC, move money, or send real SMS.

## Run locally

Requires Node.js 22.5 or newer. Install dependencies once, then start the app:

```powershell
npm ci
npm test
npm start
```

Open `http://127.0.0.1:4174/` for login, `/payment` for payment intake, `/transactions` for the payment queue, and `/admin` for administration. On Windows, `START_CASEPILOT.bat` starts the local server.

The first start inserts 120 fictional seed records idempotently. Local records are stored in `data/casepilot.sqlite`. If `DATABASE_URL` and `TURSO_AUTH_TOKEN` are both configured, the server instead uses the hosted libSQL/Turso database.

Copy `.env.example` to `.env` for local configuration. `GROQ_API_KEY` is optional; without it the app uses deterministic fallback analysis. Local demo login defaults to `admin` / `casepilot`; change these values before sharing the local app. `.env` is ignored by Git.

## Hosted deployment

Deployment has **not** been published yet. It needs a Git repository connected to Render and Netlify, plus your Turso account/database and server secrets. The project includes `render.yaml`, `netlify.toml`, and a build script for Netlify's same-origin `/api/*` proxy.

1. Put the project in a Git repository connected to your Render and Netlify accounts. Do not commit `.env`, database files, or tokens.
2. Create a Turso database, then obtain its URL and database token. With the Turso CLI, the relevant commands are:

   ```sh
   turso db create casepilot
   turso db show casepilot --url
   turso db tokens create casepilot
   ```

   Use the printed URL as Render's `DATABASE_URL` and the token as `TURSO_AUTH_TOKEN`. Keep the token private.
3. In Render, create a Blueprint from the repository's `render.yaml`. Supply the prompted secret values. Set `DEMO_ADMIN_USER` and a strong, unique `DEMO_ADMIN_PASSWORD`. Add `GROQ_API_KEY` only if you want live model analysis; rotate the previously shared Groq key before using it on a public service. After the API deploy succeeds, copy its `https://<service>.onrender.com` URL.
4. In Netlify, import the same Git repository. The checked-in `netlify.toml` runs `node scripts/build-netlify.mjs` and publishes `public/`. Add `RENDER_API_URL` as a **build-time public origin**, using the Render service origin only (for example `https://casepilot-api.onrender.com`, with no path). Trigger a deploy.
5. Visit the Netlify URL, create a synthetic payment, log in with the Render admin credentials, and check that the payment and workflow remain after the API service restarts.

Only `RENDER_API_URL` belongs in Netlify; it is public by design. Put the Turso URL/token, admin username/password, and optional Groq key in Render's server environment. Never use the local default password on a public deployment. The public prototype still does not use real bank payment rails or send customer messages.

The service may be unavailable briefly during a free-tier spin-down or restart. Check the providers' current plans and limits before choosing any paid options.

## Walkthrough

1. Create a payment at `/payment`. Try a registered beneficiary for a routine payment, an unknown account for human review, or a registered account with a mismatched name for escalation.
2. Note the generated payment reference and assessment.
3. Sign in using the admin credentials configured for the current environment.
4. Filter the payment queue, inspect the recommendation, evidence, policy route, and hard stops.
5. Record a customer update, choose a workflow decision, and verify the outcome. The message is saved as a workflow record; it is not sent to a phone.

## AI and decision controls

If `GROQ_API_KEY` is configured on the server, CasePilot sends structured investigation requests to Groq. The default model is `openai/gpt-oss-20b`; change it with `AI_MODEL`. Without a key, deterministic evidence heuristics remain available. The model can recommend a route, but deterministic policy controls the minimum required route.

The backend scores payment status, evidence quality, potential impact, and authority concern. Human review means an operations employee assesses the case. Escalation routes a serious or blocked case to a specialist or higher-authority reviewer. Both involve a person. An admin override requires a reason, and active safety hard stops cannot be overridden. These controls are prototype behavior, not OCBC's internal policy.

## Data and APIs

The app uses SQLite-compatible SQL. Locally it writes to a file; in hosted mode it connects to Turso using libSQL. Stored records include payments, linked cases, risk recommendations, events, customer-message records, decisions, and audit history.

- `POST /api/payments`: create and automatically assess a payment; public intake route.
- `GET /api/payments`: list and filter payments after admin login.
- `GET /api/payments/{id}`: retrieve payment and case history after login.
- `POST /api/payments/{id}/analyze`: rerun advisory analysis (admin).
- `POST /api/payments/{id}/message`: record a customer update (admin; no SMS sent).
- `POST /api/payments/{id}/decision`: record a review or audited override (admin).
- `POST /api/payments/{id}/verify`: verify and log workflow outcome (admin).
- Legacy case endpoints remain under `/api/cases`; API reference: `/api/docs`.
- `GET /api/health`: API/database readiness and synthetic seed counts.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Render secret | Turso/libSQL database URL. Leave unset locally to use file storage. |
| `TURSO_AUTH_TOKEN` | Render secret | Private token for the hosted database. |
| `DEMO_ADMIN_USER` | Render secret / local `.env` | Admin login name. |
| `DEMO_ADMIN_PASSWORD` | Render secret / local `.env` | Admin login password; hosted mode rejects the known demo default. |
| `GROQ_API_KEY` | Render secret / local `.env` | Optional server-only Groq key. |
| `AI_PROVIDER` | Render or local `.env` | Model provider; default `groq`. |
| `AI_MODEL` | Render or local `.env` | Model identifier; default `openai/gpt-oss-20b`. |
| `PORT` | Local `.env` / hosting platform | Server port; defaults to `4174` locally. |
| `RENDER_API_URL` | Netlify build environment | Public Render origin used to generate the `/api/*` proxy rule. |

The seeded data is fictional; it is not an OCBC dataset, a real model-training set, or evidence of measured bank performance.
