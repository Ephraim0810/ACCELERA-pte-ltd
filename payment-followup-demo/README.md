# ACCELERA

A Node.js payment follow-up prototype with business and staff views. It stores cases, messages and audit events in SQLite locally or Turso remotely. It does not connect to OCBC or execute payments. The chatbot uses rules, not an AI model. The six-digit clearing code is an illustrative example, not a universal payment rule.

## Run locally

Install Node.js 22 or newer, then run `npm install` and `npm start` in this folder. Configure `.env` from `.env.example` first. The local workspace has a preconfigured `.env`; do not commit it. Open http://localhost:4183. The initial case is EX-4821. Use the local case token and staff login provided separately by the project owner.

## Deploy on Render with Turso

1. Push this folder to a Git repository. Exclude `.env`, `node_modules`, and local database files.
2. Create a Turso database and obtain its libSQL URL and auth token from Turso.
3. Create a Render Web Service from the repository. Set the root directory to `payment-followup-demo` if the repository contains this folder at its root. Use `npm install` as the build command and `npm start` as the start command. Select Node 22 or newer.
4. In Render Environment, set `DATABASE_URL` to the Turso URL and `DATABASE_AUTH_TOKEN` to its token. Set `NODE_ENV` to `production`, `STAFF_USERNAME` to your chosen username, `STAFF_PASSWORD_HASH` to a bcrypt hash of your password, `SESSION_SECRET` to a random 32+ character secret, and `BUSINESS_TOKEN` to a random 16+ character token. Render supplies `PORT` automatically.
5. Generate a password hash locally after installing dependencies: `node -e "console.log(require('bcryptjs').hashSync('REPLACE_WITH_PASSWORD',12))"`. Generate random secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep the values private and use different values for each secret.
6. Deploy and open the Render URL. Share the business case token through a trusted channel. The seeded case is EX-4821.

## Limits

This is a single-case proof of concept with one shared business token and a single staff account. It is not ready for actual banking or customer information. It has no live AI, customer identity verification, message delivery, payment processing, or bank integration. Before use beyond a prototype it needs a security review, per-user identity and permissions, stronger session management, and validation against the bank's policies and systems. Use only synthetic data.
