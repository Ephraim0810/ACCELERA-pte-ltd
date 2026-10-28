# Accelera
**From a payment exception to a verified operational outcome.**

A guided student prototype for OCBC IGNITE Problem Statement 2, by The 4th Dimension. Accelera investigates saved evidence, recovers missing information, checks what action is permitted, performs a defined internal update and verifies the saved result.

All organisations, payment instructions, confirmations, mandates, risk indicators and invoices are fictional. No money moves, live bank is connected or external message is sent.

## Open the prototype
1. Install Node.js **22.5 or newer**.
2. On Windows, double-click **START_ACCELERA.bat**. It installs the existing dependencies when needed, starts the local app and opens the browser.
3. Choose **Open workspace**. The local demonstration account is **admin / casepilot**. The original local password is retained for compatibility; the product is Accelera.

Or run from this folder:

~~~sh
npm ci
npm test
npm start
~~~

Open **http://127.0.0.1:4174**. The in-app guide explains the workflow. The launcher recognises workflow version 5; an older server must be stopped before this upgrade can use the same port.

## Start with the four core journeys
- **Smart Recovery:** run the missing-confirmation case until it waits. In Smart Recovery, create a saved processor information request. Open its scoped recipient portal. Fill from the assigned fictional receipt; deliberately change the amount to see a rejected reply. Fill the correct values and submit. The server validates against stored evidence, runs the Evidence Challenger and SafeReplay checks, resumes the permitted enquiry update and reads back the result. Refresh the operations case to inspect both replies and the final Passport.
- **Risk restriction:** investigate the saved synthetic risk-monitor record. An unresolved restriction blocks automatic recovery. A reviewer may request information, reject or escalate with a recorded reason; these decisions do not clear the restriction. It is a risk flag, not a finding of fraud.
- **Conflicting evidence:** the labelled failure-test proposal treats the outcome as failed while another stored record indicates possible completion. The independent Evidence Challenger identifies the contradiction and prevents a failed-only assumption from authorising action.
- **Changed payment status:** choose Investigate & prepare a plan. In SafeReplay, inspect the preview, then use the labelled status-change simulator. Attempt the previous update. Current-state and proposal checks must block it. No payment is resubmitted.

Also explore **existing authorised allocation** (the original SGD 2,000 + SGD 500 split, exact mandate, balances, authority and reviewer approval) and **normal recording** (basic validation passes; no exception investigation or model call runs). Recording is not proof of settlement.

Eight advanced fixtures preserve the original status-resolution, waiting, conflicting-record, false-acknowledgement, missing-mandate, already-applied, mismatched-confirmation and in-flight journeys.

## What each module does
- **ClearMatch:** checks exact reference, amount, currency and beneficiary binding. Similar records are search candidates, never automatic identity matches.
- **Grounded investigation:** structured claims cite inspectable source records. Facts, hypotheses, missing evidence and live/offline mode remain visible. Unsupported claims cannot authorise execution.
- **Smart Recovery Loop:** saved request, scoped recipient capability, saved replies, field validation, evidence acceptance and controlled continuation. Identical accepted replies are idempotent. Interrupted ready/executed phases can resume; unresolved or blocked states remain open for operations.
- **Evidence Challenger:** programmatic source and consistency checks independent of the model response. A second model agreeing is not verification.
- **SafeReplay:** stored before/after preview, current-state, authority, evidence, policy and duplicate checks. Execution repeats checks against current saved records. Only defined internal fields can change.
- **Resolution Passport:** inspectable sources, claims, requests, replies, simulation, exact approvals, execution attempts, read-back result and chronological audit. Export JSON or print. Its content checksum is not a digital signature.
- **Priority queue:** urgency/state ordering, oldest first within a state, search and filters; missing evidence and risk restrictions stay visible for human attention.
- **Measured comparison:** an administrator can run 1–5 paired trials. The UI uses three. It measures actual server processing for a defined six-operation scripted manual sequence and a two-operation controlled workflow, both offline and both required to reach verified closure. This is not measured human handling time or demonstrated bank savings. Results are stored; fixture cases are excluded from ordinary queue metrics.

The source and target mock records share one database. Verification reloads persisted state in a separate transaction; it is not independent external-bank confirmation.

## Authenticated roles
The signed-in account controls backend permissions. A browser role label or supplied payload cannot grant authority.

| Local account | Password | Purpose |
| --- | --- | --- |
| admin | casepilot | Demonstration administration, all workflows and labelled fixtures |
| agent | agent-demo | Investigate, request evidence, simulate, execute permitted actions and verify; cannot approve |
| reviewer | reviewer-demo | Investigate, request, simulate, approve within configured amount/currency limit, verify or record a decision; cannot execute |
| risk-reviewer | risk-demo | Review risk cases and record decisions; cannot remove a risk restriction or execute |
| owner | owner-demo | Read-only operations and measured outcomes |

These are public, local synthetic-demo accounts. The administrator can explore all roles; this is not production separation of duties. System detection and recovery continuation run server-side. Sessions expire after eight hours. Restarting the server ends sessions.

Recipient links carry a random, request-specific capability in the URL fragment; only a hash is stored. They expire after 15 minutes by default and can be reissued while unanswered, invalidating the previous link. The capability cannot access operations records or another request. Treat links as access credentials: only open them as the intended mock recipient. No real email or SMS delivery is implemented.

## Optional AI
The app works without a key using a clearly labelled deterministic investigation. For advisory live investigation, copy .env.example to .env and configure GROQ_API_KEY on the server. Never put a key in browser code or commit it.

The fixed model destination is Groq's HTTPS chat-completions endpoint. Unusable responses fall back to deterministic evidence checks. The UI identifies fallback; no fabricated confidence score is shown. Model facts must cite stored evidence. AI cannot create authority, clear a risk restriction, move money or declare an unverified action successful. Synthetic data only, including when live AI is configured.

## Configuration and deployment
Ordinary startup uses data/casepilot.sqlite. This internal filename and createCasePilotServer compatibility export are preserved. Runtime databases, private .env and installed dependencies are excluded from the release ZIP.

PORT defaults to 4174; local HOST defaults to 127.0.0.1. An occupied port is reported clearly. Stop only the server belonging to this project.

Existing Render and Netlify scaffolding is preserved. Hosted startup requires NODE_ENV=production, DATABASE_URL, TURSO_AUTH_TOKEN and explicit nondefault DEMO_ADMIN_USER / DEMO_ADMIN_PASSWORD. Other hosted roles are disabled unless their respective nondefault DEMO_AGENT_PASSWORD, DEMO_REVIEWER_PASSWORD, DEMO_RISK_PASSWORD or DEMO_OWNER_PASSWORD is configured. Matching _USER variables override usernames. Configure DEMO_REVIEWER_LIMIT_MINOR (positive integer; default 1000000) and DEMO_REVIEWER_CURRENCY (default SGD) for reviewer approval authority. Invalid limits deny approval. RECOVERY_TTL_MS changes the recipient capability lifetime. See .env.example.

Starting this app locally does not deploy it. Hosted database, credentials, HTTPS, monitoring and operational access management remain deployment responsibilities.

## Verification and boundaries
Run npm test for workflow, evidence validation, permissions, malformed input, recovery, duplicate prevention, interrupted continuation, database persistence, HTTP boundaries, frontend case-switching and deployment compatibility regressions. Browser checks exercise the visible journey, failed evidence and responsive layouts.

This is a synthetic competition prototype. It does not claim production readiness, zero risk, OCBC workflow validation, bank savings or a guaranteed competition outcome.
