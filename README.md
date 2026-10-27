# Accelera
**From an operational exception to a verified outcome.**

A guided student prototype for OCBC IGNITE Problem Statement 2, by The 4th Dimension. Accelera connects investigation, permission checks, a defined mock update and read-back verification.

All records, confirmations, mandates, invoices and organisations are fictional. No money moves, no live bank system is connected, and no customer message is sent.

## Open the prototype
1. Use Node.js **22.5 or newer**.
2. On Windows, double-click **START_ACCELERA.bat**. It installs the existing dependencies if needed, starts the local app and opens the browser.
3. Choose **Open workspace**. The local demonstration credentials are prefilled: username **admin**, password **casepilot**. The original local password is retained for compatibility; the product is Accelera.

Or run from this folder:

~~~sh
npm ci
npm test
npm start
~~~

Open **http://127.0.0.1:4174**. Use the guide inside the app whenever you need an explanation.

## Explore the complete workflow
The Overview offers six main synthetic journeys and four additional failure fixtures.

- **A payment recorded correctly:** standard field/reference validation passes; the instruction is saved. No exception investigation or model call runs. Recording does not prove settlement.
- **Stale enquiry status:** match the final mock confirmation to the original instruction, update only the internal enquiry and verify its saved result.
- **Missing confirmation:** record a specific evidence request and keep the case open. A clearly labelled simulator supplies matching evidence so the case can resume.
- **Existing authorised allocation:** recover the original SGD 2,000 + SGD 500 invoice split. Exact mandate, recovery delegation, current balances and reviewer approval are required.
- **Conflicting records:** preserve the evidence and remaining question for a person.
- **False acknowledgement:** the mock service acknowledges but the target stays unchanged. Read-back fails and prevents closure or a blind retry.

Advanced fixtures cover a missing mandate, an already-applied allocation, a mismatched confirmation and an in-flight attempt.

**Run controlled workflow** investigates and completes an eligible case automatically. It pauses at missing evidence, a model concern or required approval. **Guide me step by step** exposes each stage for explanation. After approval, apply the permitted update and read back the result.

The payment form is a recording simulator, not a bank payment page. Use fictional details only. Unknown beneficiaries are described as missing reference evidence, not as proven conflicts.

## What is implemented
- Consistent Accelera interface, contextual guides, meaningful next actions and readable evidence cards.
- Complete paginated queue loading, urgency/state ordering and oldest-first ordering within a state; search and filters.
- Separate payment recording, operational case state and read-back verification.
- Persisted structured evidence, exact action authority, proposal fingerprints, approval, attempts and outcomes.
- Transactional action checks and serialized local writes; successful repeats do not apply the target twice.
- Waiting/resume, human ownership, unsent evidence-request drafts and an explanatory event log.
- Actual guided-record outcome counts. Observed resolution durations include user clicks and waiting; no bank baseline or savings percentage is claimed.
- Five explanatory role views: System, Agent, Reviewer, Administrator and Process Owner. One demo operator session can explore all responsibilities; this is not production RBAC or separation of duties.

The source and target records are mock data in the same database. Verification reloads saved state in a separate transaction; it is not independent confirmation from an external bank or processor.

## Optional AI
The app works without any key, using a clearly labelled deterministic walkthrough. For advisory model investigation, copy .env.example to .env and configure GROQ_API_KEY on the server. Never place it in browser code or commit it.

The fixed model destination is Groq's HTTPS chat-completions endpoint. A failed or unusable response falls back to deterministic evidence checks. The UI does not claim a live AI result when fallback was used. AI cannot create authority, bypass controls or declare an unverified result successful.

## Local data and configuration
Ordinary npm startup uses a local SQLite-compatible file at data/casepilot.sqlite relative to this project folder. The internal filename and compatibility server export are retained from the original demo. Runtime files and private .env are excluded from the source package.

PORT defaults to 4174 and local HOST defaults to 127.0.0.1. Hosted database settings are used by the main server only when NODE_ENV=production. Existing Render/Netlify scaffolding is retained; it is not deployed by starting the local prototype. Production startup requires remote database configuration and explicit nondefault operator credentials.

To stop a launcher-started server, stop the Node process belonging to this project. Do not stop unrelated Node applications.

## Verification and scope
Run npm test for automated workflow, input, persistence, HTTP-boundary and compatibility regressions. Browser checks cover normal recording, controlled status resolution, evidence waiting/resume, approval and failed verification.

This is a working synthetic prototype, not a claim of production readiness, a security guarantee, demonstrated OCBC savings or guaranteed competition results.
