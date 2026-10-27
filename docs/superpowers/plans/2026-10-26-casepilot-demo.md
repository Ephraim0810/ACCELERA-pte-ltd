# CasePilot Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build CasePilot, a runnable synthetic payment-exception triage demo with an appealing frontend, SQL persistence, optional hosted Gemini analysis, and an API for creating test cases.

**Architecture:** A dependency-free Node.js 22 server uses built-in HTTP and SQLite, serves a responsive vanilla JavaScript client, and exposes JSON APIs. A policy module derives the risk route from structured facts and hard stops; the Gemini adapter can only add investigation text/classification, never authorize actions.

**Tech Stack:** Node.js 22, built-in `node:http`, `node:sqlite`, browser HTML/CSS/ES modules, built-in `node:test`; optional Google Gemini REST API via `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-26-casepilot-demo-design.md`

## Global Constraints

- Seed 120 deterministic synthetic cases once.
- No real customer or OCBC records, external payment actions, or real customer contact.
- Backend-calculated policy route overrides model recommendations.
- Human review and risk hard stops remain visible.
- New cases can be persisted through the UI and `POST /api/cases`.
- Hosted analysis is optional; fallback must be labeled.
- Keep dependencies at zero for easy local setup.

## Review Focus

- Invalid or malicious values in case creation are rejected without database writes.
- A low numeric score cannot bypass a hard stop or become an allowed payment action.
- Gemini errors and malformed responses fall back transparently without losing deterministic policy output.
- Reinitializing or restarting the database does not duplicate the 120 seed cases.
- Customer message draft route never sends or implies it has sent a message.
- Pagination/search/filter combinations remain stable when newly posted cases are added.

---

### Task 1: Policy, seed data, and persistence

**Files:**
- Create: `src/policy.mjs`
- Create: `src/seed.mjs`
- Create: `src/db.mjs`
- Create: `tests/policy.test.mjs`
- Create: `tests/seed-db.test.mjs`
- Create: `package.json`

**Interfaces:**
- `computeTriage(facts)` returns factor scores, total, hard-stop flags, route, and action permission.
- `generateSyntheticCases(count=120)` returns deterministic synthetic case inputs and evaluation labels.
- `createDatabase(path)` returns DB methods for seeding, CRUD, analysis/audit persistence, and close.

- [x] Write failing tests for route thresholds and hard stops.
- [x] Run tests and confirm missing module failure.
- [x] Implement policy rules.
- [x] Test seed determinism and database seed idempotency.
- [x] Implement synthetic data generator and SQLite tables/repositories.
- [x] Run the focused test suite.

### Task 2: API and hosted AI adapter

**Files:**
- Create: `src/ai.mjs`
- Create: `src/server.mjs`
- Create: `tests/api.test.mjs`

**Interfaces:**
- `createCasePilotServer({dbPath, env})` returns a Node HTTP server and close function.
- Routes expose health, metrics, list/detail/create cases, analyze, draft customer message, and reviewer decision.
- Analysis returns deterministic route plus provider label and model investigation.
- Customer draft endpoint persists a draft only.

- [x] Write failing integration tests for POST persistence, invalid data, analysis fallback, and non-delivery of customer drafts.
- [x] Run tests and confirm expected failures.
- [x] Implement Gemini adapter and transparent fallback.
- [x] Implement request validation, API routes, audit persistence, and deterministic risk gate.
- [x] Run all API tests.

### Task 3: Frontend, docs, and final verification

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `README.md`
- Modify: `package.json`

- [x] Build responsive synthetic-case dashboard and investigation view.
- [x] Add case creation form, analysis, review action, and customer draft interactions.
- [x] Add API docs, run instructions, Gemini setup, and demo steps.
- [x] Run complete automated tests.
- [x] Start server and smoke-test health, dashboard, seeded case count, and POST case creation.

