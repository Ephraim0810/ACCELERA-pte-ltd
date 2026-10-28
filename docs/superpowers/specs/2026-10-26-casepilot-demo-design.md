# CasePilot Demo Design

## Goal
Build a working full-stack student prototype that investigates synthetic payment exceptions, recommends a risk and review route, allows new cases to be posted, and drafts cautious customer communications.

## Product direction
**Name:** CasePilot  
**Tagline:** Investigate clearly. Resolve with confidence.

CasePilot is a synthetic-data demonstration. It is not affiliated with OCBC, does not connect to banking systems, and cannot move real money or contact real customers.

## User journey
1. An operations user opens a dashboard with a seeded queue of synthetic payment cases.
2. The user selects a case and reviews payment state, evidence, timeline, and customer enquiry.
3. The user runs AI-assisted analysis. A hosted Gemini model may summarize evidence and recommend a risk/review class; if no API key is configured, the app labels and uses a deterministic demo fallback.
4. Server-side policy code calculates the 0–8 risk score from four validated factors and applies hard-stop rules. The model cannot authorize payment actions.
5. The user can draft a customer update from verified facts; no message is sent.
6. The user can create and persist another synthetic exception using the UI or REST API.

## Triage policy
Four factors each contribute 0, 1, or 2 points: payment status, evidence quality, potential impact, and policy/identity concern. Scores 0–2 route to routine handling, 3–5 require human review, and 6–8 escalate. Regardless of score, unresolved payment state before retry, suspected unauthorized changes, and authoritative contradictory records block payment-changing actions and require review/escalation.

The AI may recommend a category and explain evidence, but the backend recalculates the score, applies hard stops, and supplies the final route. It must distinguish confirmed facts from hypotheses.

## Data and persistence
- SQLite relational database, initialized automatically at startup.
- Seed exactly 120 deterministic synthetic cases once, with balanced exception types and route labels; include both false alarms and genuinely uncertain/high-risk cases.
- Persist cases, evidence/event timeline, analysis runs, simulated customer drafts, and audit events.
- Each synthetic case contains payment reference, amount/currency, rail, status, exception type, customer enquiry, evidence summary, event history, four 0–2 risk factors, hard-stop flags, final route, and optional ground-truth route for evaluation.
- Clearly label all names/references as fictional synthetic records.

## API
- GET /api/health
- GET /api/cases with filters and pagination
- GET /api/cases/{case_id}
- POST /api/cases to validate and persist a new case
- POST /api/cases/{case_id}/analyze for hosted AI (or transparent fallback) investigation and deterministic routing
- POST /api/cases/{case_id}/customer-draft to generate a draft only
- GET /api/metrics for queue/routing counts
- GET /api/docs for OpenAPI JSON endpoint reference

The POST route accepts new case facts and optional evidence/events, not model-decided risk scores or final dispositions. The server computes policy risk.

## Frontend
A responsive, self-contained web interface served by the built-in Node HTTP server: case queue, queue metrics, searchable/filterable records, focused investigation view, risk breakdown, evidence timeline, AI summary, human review status, customer-message draft, and create-case form. Use a restrained banking-operations visual style with accessible contrast, keyboard-friendly controls, and clear synthetic-data labels.

## AI integration
- Use Gemini through a small backend adapter controlled by GEMINI_API_KEY and GEMINI_MODEL environment variables.
- Request schema-bound JSON for concise investigation, facts, uncertainty, likely cause, recommendation, risk class, and customer draft.
- Do not include secrets or unnecessary customer identifiers in prompts; all seeded data is synthetic.
- If no key is configured or provider call fails, use deterministic text/factor-based analysis and visibly identify it as demo fallback; do not claim the hosted model ran.
- Keep business authorization, score calculation, hard stops, and route selection deterministic and independent of model output.

## Out of scope
Live OCBC connectivity, production payment actions, real customer messaging, real personal/banking data, model training/DQN, and claims of measured real-bank performance.

## Acceptance criteria
1. A clean start creates the SQLite schema and 120 cases exactly once; a restart does not duplicate them.
2. A user can inspect cases, run analysis, see deterministic score/route and evidence-backed explanation, create a new case, and draft a customer update.
3. POST /api/cases returns a persisted record; GET can retrieve it. Invalid factor values are rejected.
4. A hard-stop case cannot be classified as routine or action-authorized, even when its numeric score is low or model suggests proceeding.
5. The fallback path works without network credentials and is clearly disclosed; configured Gemini uses the same deterministic policy gate.
6. Automated tests cover seed idempotency, input validation, hard stops, routes, POST persistence, analysis fallback, and customer draft non-delivery.
7. The README explains setup, optional Gemini key, endpoints, synthetic-data boundaries, and demo walkthrough.



