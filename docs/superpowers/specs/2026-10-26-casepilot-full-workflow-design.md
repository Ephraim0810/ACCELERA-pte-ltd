# CasePilot Full Workflow Design

## Intent
Build an end-to-end payment operations prototype: admin login, realistic payment instruction intake, automatic backend risk assessment, investigation, customer communication, operator decision, and outcome verification.

## User flow
1. Root page is an operations login. Separate /payment page collects payer, beneficiary name/account/country, payment reference, amount/currency, payment rail, and purpose.
2. Backend saves every submitted transaction to SQLite and links it to an investigation record. It compares ordinary beneficiary details with fictional stored beneficiary reference records; the payer cannot choose risk labels or status.
3. Matching beneficiary details route routinely. An unrecognized beneficiary routes to Human review. A known account with mismatched beneficiary name or country creates an authoritative conflict and escalates. These are prototype rules, not OCBC policy.
4. Admin workspace lists every payment with route/status/search filters. Staff can inspect payment facts, evidence, AI recommendation, policy floor, timeline, and audit history.
5. Staff can send a customer update, choose a decision, and verify the recorded outcome. Messaging is stored locally and no external SMS is connected. Only a properly closed case is reported as resolved; escalation and information requests remain open.

## AI and controls
Gemini can recommend Routine, Human review, or Escalation with rationale and confidence. Without a key the fallback derives an advisory recommendation from case evidence. Deterministic scoring/hard stops impose a route floor; AI cannot lower it or authorize payment changes. Admin route overrides require a reason and cannot bypass hard stops.

The current prototype floor scores status, evidence quality, potential impact, and authority concern (0–2 each): totals 0–2 routine, 3–5 review, 6–8 escalation. Unresolved status before retry, suspected unauthorised change, and authoritative record conflict are hard stops.

## Data and boundaries
SQLite persists payments, cases, evidence/events, analysis, customer-message records, decisions, and audit events. Existing cases are backfilled into payments idempotently. Demo login credentials are admin / casepilot; the gate is not production authentication. No live OCBC connection, payment execution, external messaging, or actual banking data. Product UI uses realistic wording; presentation explains the prototype boundary verbally.

## Pages and endpoints
- / and /login: admin login; /admin: authenticated operations workspace; /payment: payment creation.
- Public POST /api/payments validates standard instruction fields, assesses them server-side, and persists the record.
- Authenticated GET /api/payments and /api/payments/{id}; analysis, message, decision, verification actions.
- Demo session routes /api/demo/login, /api/demo/session, /api/demo/logout. Legacy case routes remain available with admin gates for reads and actions; public case creation remains for REST testing.

## Acceptance
- Existing SQLite data survives startup and all existing cases appear in the all-payments list.
- Payment intake persists routine and flagged instructions and cannot accept client-selected route/risk labels.
- Admin login gates payment and case queues/actions.
- AI recommendations cannot lower the safety floor; hard stops cannot be overridden; override reasons are audited.
- Customer updates, decisions, and verification outcomes persist; unresolved cases are never called resolved.
- UI is responsive and contains no simulation banners or labels.
