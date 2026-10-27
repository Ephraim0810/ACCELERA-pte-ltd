# CasePilot Full Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the payment-entry, AI-assisted routing, login, full operator workflow, customer communication, and verified-outcome flow using the existing Node app and SQLite database.

**Architecture:** Keep the current built-in Node HTTP server, `node:sqlite`, and vanilla frontend. Add a persisted `payments` table linked to exception cases, an advisory AI route recommendation, deterministic safety vetoes, demo sessions, and auditable case workflow actions. Preserve existing case API behavior while introducing payment-centric routes and pages.

**Tech Stack:** Node.js >=22.5, built-in HTTP/SQLite/crypto, vanilla JS/CSS/HTML, node:test.

**Spec:** `docs/superpowers/specs/2026-10-26-casepilot-full-workflow-design.md`

## Global Constraints

- No new runtime dependencies.
- Existing SQLite data must be preserved and migrated idempotently.
- UI should appear like a realistic banking workflow, without simulation banners/labels.
- No real payment processing or external SMS integration; actions only persist local workflow state.
- AI is advisory; backend safety rules define action permissions and hard stops.
- Admin recommendation overrides require a reason and audit entry; hard stops cannot be overridden.

## Review Focus

- Existing database migration: preserve records and backfill payment rows exactly once; test migration and restart.
- Routine payment with no case: persist and list/filter correctly; test no-case creation.
- AI timeout or malformed output: safe baseline route; test provider failures.
- Unauthenticated workflow request: reject while payment submission remains public; test session gates.
- Admin override against a hard stop: reject and preserve block; test override denial and audit-reason requirement.

---

### Task 1: AI recommendation and safety policy separation

**Files:** `src/policy.mjs`, `src/ai.mjs`, `tests/policy.test.mjs`, `tests/ai.test.mjs`

**Interfaces:** `computeTriage(facts)` remains deterministic and supplies hard stops and action permissions. Add `recommendRoute(record, analysis)` returning `{route, confidence, rationale, provider}`. AI may suggest a route but policy sets a minimum route and action eligibility.

- [ ] Add tests for score boundaries, hard-stop minimum route, missing AI fallback, and AI recommendation below the policy floor.
- [ ] Run targeted tests and confirm they fail for the missing behavior.
- [ ] Implement recommendation normalization and safety floor.
- [ ] Run targeted and full tests; confirm AI cannot enable payment actions or lower the route below the floor.

### Task 2: SQLite payments, migration, and workflow history

**Files:** `src/db.mjs`, `tests/db.test.mjs`, `tests/dataset.test.mjs`

**Interfaces:** Add `createPayment(input, assessment)`, `listPayments(filters)`, `getPayment(id)`, `saveMessage(id, body, status)`, `recordDecision(id, decision, note, overrideReason)`, and `verifyOutcome(id)`. Return payment with optional linked case, events, messages, decisions, and audit.

- [ ] Test idempotent case-to-payment backfill for existing database and restart.
- [ ] Test atomic routine payment creation without a case and flagged payment creation with a linked case.
- [ ] Test filtering, message persistence, decision history, and outcome verification.
- [ ] Run targeted tests and confirm they fail.
- [ ] Add tables and idempotent backfill without deleting existing rows; implement the interfaces.
- [ ] Run targeted and full tests.

### Task 3: Demo session and payment/workflow API

**Files:** `src/server.mjs`, `tests/api.test.mjs`

**Interfaces:** `POST /api/demo/login`, `POST /api/demo/logout`, `GET /api/demo/session`; `POST /api/payments`; `GET /api/payments`; `GET /api/payments/:id`; authenticated analysis, message, decision, and verification routes. Keep `/api/cases` routes working.

- [ ] Add tests for session lifecycle, unauthorized mutation, public payment creation, filtering, input validation, safety-floor enforcement, override reason, and unoverrideable hard stop.
- [ ] Run API tests and confirm failures for missing routes.
- [ ] Implement cookie/session handling, payment validation, risk recommendation and persistence, workflow routes, and updated OpenAPI document.
- [ ] Run `npm test` and `node --check`.

### Task 4: Payment page and admin login

**Files:** create `public/payment.html`, `public/payment.js`, `public/login.html`, `public/login.js`; modify `src/server.mjs`, `public/styles.css`.

**Interfaces:** `/` and `/payment` serve payment page; `/login` serves login; `/admin` is gated. Payment form posts to `/api/payments`; login posts to `/api/demo/login` and redirects to `/admin`.

- [ ] Test public page routes and admin redirect behavior.
- [ ] Implement responsive payment form with realistic fields, selectable test outcomes through payment facts, validation, and receipt with assigned route.
- [ ] Implement login page with documented demo credentials.
- [ ] Run tests and inspect served asset references.

### Task 5: Operator workspace and end-to-end handling

**Files:** create `public/admin.html`, `public/admin.js`; modify `public/styles.css`, `src/server.mjs`.

**Interfaces:** `/admin` requires session. UI calls payment list/detail and workflow APIs, supports route/status/search filters, and displays AI recommendation separately from enforced policy route.

- [ ] Test gated admin route and route-filter query behavior.
- [ ] Implement compact sidebar, all-payment list, selected payment detail, evidence/timeline, AI recommendation/confidence, safety checks, customer message composer/history, decisions, verification, and audit trail.
- [ ] Implement accept/reject/override recommendation controls; require reason for override and do not expose hard-stop bypass.
- [ ] Ensure product UI contains no simulation banners/labels; keep explanation in README and presentation notes.
- [ ] Run full tests and inspect narrow-width CSS behavior.

### Task 6: Docs and final verification

**Files:** `README.md`, `CASEPILOT_CONTEXT.md`, `docs/SPRINT.md`, all test files.

- [ ] Document demo credentials, routes, full walkthrough, AI/policy split, distinction between human review/escalation, and local-only actions.
- [ ] Run `npm test`; all tests pass.
- [ ] Run `node --check` for modified server, frontend, AI, policy, and DB modules.
- [ ] Verify dispatcher flow for routine and flagged payment, login, filtering, message, decision, and outcome check.
- [ ] Update compact context file with resulting routes/schema/workflow.
