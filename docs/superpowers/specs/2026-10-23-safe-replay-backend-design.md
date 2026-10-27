# OCBC SafeReplay Backend Design

**Status:** Draft for approval  
**Scope:** Backend, relational database, mock payment processor, API contract, test data and Scrum backlog. Frontend, branding and product copy are out of scope.

## Intent

Build a working synthetic backend for a narrowly scoped payment-batch recovery workflow. SafeReplay investigates partially rejected GIRO-style batches, proposes a correction from messy evidence, proves the exact impact in a preflight simulation, waits for required authorization, performs only eligible synthetic recovery actions and verifies the mock processor's resulting state.

The defining safety promise is: **Fix only what failed. Prove nothing else was affected.** The user has selected SafeReplay as the product direction and asked to focus on proving this concept rather than expanding the idea list.

## Evidence and wording boundaries

OCBC's public Velocity help page documents a `Partially Rejected` GIRO status: some items are invalid and rejected while valid items will be paid out. It separately describes `Partially Successful` as a post-processing state where some items fail. This is a sound basis for the synthetic mixed-status case, but it does not establish OCBC's internal handling workflow, a duplicate-payment incident, the status of any individual real payment, or an internal workload gap. The illustrative 30/12/18 count must always be labelled synthetic.

The claimed OCBC file-repair feature was not confirmed in the official guides checked and is excluded from product claims until a primary source confirms it.

The workflow is conceptually aligned with MAS's SAFR framework around agent action authorisation, human oversight and decision records. SAFR is an industry-developed proposed framework, not a SafeReplay certification or a claim of mandatory approval.

AI payment repair and agentic payment investigation are commercial prior art. SafeReplay's competition demonstration must centre on exact-scope preflight simulation, deterministic controls, approval binding and independent state read-back; AI interpretation alone is not novel.

## Goals

- Persist batches, individual payment instructions, supporting evidence, AI diagnoses, recovery plans, approvals, mock executions, read-back verifications and append-only activity in SQL.
- Demonstrate the unsafe “retry all 30” action being blocked when accepted or otherwise unresolved instructions are included.
- Demonstrate genuine AI interpretation of unfamiliar synthetic error text. Store diagnosis as a proposal; deterministic policy validates every ID, state and correction before an action can proceed.
- Simulate the proposed action before execution, show the exact instruction IDs and fields that would change, and save a reproducible preflight result.
- Require a distinct authorized reviewer for each recovery plan. Require synthetic customer maker-authoriser evidence before any material correction to a customer instruction is resubmitted. An AI diagnosis never grants authority.
- Execute in a mock processor only, then read actual mock processor state through a separate adapter/query path. A positive acknowledgement without the expected persisted state must leave the case unresolved.
- Provide authenticated, versioned REST endpoints, OpenAPI docs, migrations, repeatable synthetic seed data, integration tests and API examples.
- Retain separate API test endpoints to create payment batches, transfers/instructions and payment-related complaints.
- Document the backlog, sprint goals, stories and acceptance criteria so the team can run reviews and show working increments.

## Non-goals and anti-goals

- No connection to OCBC production systems, payments, customer accounts, credentials or external banking APIs.
- No real personal, customer or payment data. Demo content, identifiers and amounts are synthetic, even when status terminology is modelled on public OCBC documentation.
- No autonomous high-risk decision, customer-instruction alteration or resubmission without the required synthetic customer authorization.
- No retry of accepted-for-processing, processing, processed, settled, unknown, stale or previously recovered instructions. Accepted-for-processing must never be represented as settled without authoritative state evidence.
- No broad complaints platform, customer-facing product, FirstFix extension or frontend changes.
- No claim that OCBC suffers duplicate payments in this scenario, that current OCBC staff perform a specific undocumented workflow, or that demo performance predicts bank savings.

## Approaches considered

1. **Separate FastAPI + PostgreSQL backend (recommended and used as the design default):** typed Python REST service, SQLAlchemy/Alembic, PostgreSQL, Docker Compose and generated OpenAPI. It provides a clean frontend boundary, straightforward schema migrations and convenient integration tests for transaction/state invariants. The existing prototype archive is not available in the local workspace, so its language cannot be confirmed. This stack choice is a builder call, not a confirmed team preference.
2. **Node/Express + PostgreSQL:** would be a good choice if the prototype already has a Node backend or the team strongly prefers one language. It may make shared types easier, but the source cannot currently be inspected and the database/control requirements remain the same.
3. **SQLite for the first prototype:** simple local setup, but weaker fit for a team-shared SQL service, concurrent approvals and realistic multi-transaction tests. It is not selected for the requested persistent backend.

## User roles and trust boundaries

- `operator`: creates synthetic test records, attaches evidence, requests diagnosis and prepares a preflight plan.
- `reviewer`: reviews and approves/rejects/escalates a plan. The operator who prepared a plan cannot approve that same plan.
- `customer_maker` and `customer_authoriser`: synthetic actors whose authorization evidence is required before a material change to a customer instruction may be resubmitted. Their separation is a demo policy choice, not a claim about all OCBC packages; OCBC public help notes that in its Standard package the maker and authoriser may be the same person.
- `admin`: manages synthetic reference data and test scenarios; cannot bypass immutable audit or processor verification.
- `system` and `mock_processor`: non-human audit actors for diagnosis, policy evaluation and processor actions.

Local users are synthetic. Write endpoints require bearer authentication and role checks. Secrets are supplied through an untracked `.env`; no default production-style credentials are committed.

## Data model

All monetary values use fixed-precision decimal and an explicit currency. Public names/statuses ground test semantics only; all records are synthetic.

- **PaymentBatch:** unique synthetic client reference; channel/payment type; submitted time; declared counts/total; aggregate status; monotonic state version; creation metadata.
- **PaymentInstruction (transfer):** batch FK; unique client instruction reference per batch; synthetic beneficiary alias; amount/currency; original customer instruction JSON; current simulated processor status; rejection code/text; state version; recovery marker. Original instruction is immutable. A corrected instruction is a separate version/derived payload linked to its source.
- **Complaint:** optional synthetic payment-related complaint linked to a batch and optionally an instruction. Stores category, channel, narrative, status and timestamps; it does not create a separate general-purpose complaint-resolution product.
- **Evidence:** synthetic source, source reference, capture time, content/summary, content hash and exactly one batch or instruction parent. Evidence cannot silently change after a diagnosis uses it; additions create new versions/events.
- **Diagnosis:** structured proposal from a configurable AI provider; model/provider and prompt/schema versions; evidence IDs/content hashes used; diagnosis text/category; proposed rejected instruction IDs and corrections; confidence; missing evidence; escalation reason; creation time. It is never the authority for state or eligibility.
- **RecoveryPlan:** immutable proposed action with unique plan ID, exact eligible instruction IDs, each expected status and state version, separate corrected payloads, policy checks, before/after simulation, excluded instruction IDs/reasons, approval requirement, canonical plan hash, creation/expiry timestamps.
- **Approval:** reviewer ID/role, decision, reason, exact recovery-plan hash, timestamp. Customer authorization evidence is separately stored and linked to the corrected instruction version; approval cannot be transferred to a changed plan hash.
- **ExecutionAttempt:** immutable attempt ID, unique idempotency key, plan hash, per-instruction requested action/result, mock processor acknowledgement and times, retry count. Idempotent replay with the same key/body returns the original attempt; a changed body under the same key returns `409`.
- **Mock processor tables/schema:** own instruction state and event rows accessed only through a `ProcessorPort` adapter. The recovery service records a command and acknowledgement separately from processor state. This permits an injected false-success acknowledgement without updating processor state.
- **Verification:** execution ID, processor read-back time, observed per-instruction statuses/versions, expected-vs-actual comparison and outcome. Mismatch/unavailable state leaves the case unresolved and never triggers automatic retry.
- **AuditEvent:** append-only event with actor, role, timestamp, entity/version, action, reason, correlation ID and relevant diagnosis/rule/plan/processor versions. No update/delete API exists for ordinary roles.
- **User:** synthetic local identity, password hash, role and active state.

## Workflow and safety invariants

1. **Detect and investigate:** a batch can be loaded from synthetic seed data or API posts; operator attaches evidence and requests diagnosis. AI returns structured diagnosis referencing supplied evidence and proposes a correction. It cannot create instruction IDs or read processor state directly.
2. **Preflight:** deterministic rules fetch current instruction and processor state, then produce an immutable plan. Only an instruction currently marked rejected, not already executed/recovered, with a supported correction and fresh evidence can be eligible. Accepted-for-processing, processing, processed, settled, unknown and stale records are excluded with an explicit reason.
3. **Exact scope:** the plan contains a de-duplicated explicit list of instruction IDs and state versions. “Retry all” has no executable representation. Plan hash binds IDs, versions, corrections, policies and action scope.
4. **Correction authority:** model output cannot alter stored original instructions. Financially material fields (beneficiary/account, amount, currency, value date and payment type) may be changed in a corrected copy only when customer maker-authoriser evidence is attached. Any required synthetic reviewer approval is also bound to the plan hash.
5. **Freshness and approval:** every recovery plan requires a distinct authorized reviewer approval; there is no auto-approved or auto-executed plan in the first demo. Immediately before execution, the service rechecks state versions, eligibility, customer authorization evidence and plan expiry in a transaction. Any change invalidates the plan and approvals; operator must run preflight again. The same operator cannot approve their plan.
6. **Sandbox action:** execution makes a mock processor command only. It sends only the eligible IDs in the approved plan and uses an idempotency key. It must never call a real payment API.
7. **Independent verification:** after the mock acknowledgement, a separate read-back queries the mock processor state tables through `ProcessorPort`. Acknowledgement alone cannot close a case. All expected state must match before resolution; partial/missing/mismatched read-back leaves unresolved instructions visible and prevents automatic retry.
8. **Audit:** each input, evidence addition, AI diagnosis, exclusion, preflight, approval, execution, acknowledgement, read-back and escalation is recorded, with no secret or real customer data in logs.

## AI diagnosis requirements

- Provider is configurable by environment; API keys are never committed. The first integration should use the team's available model provider, with a provider interface so a different compatible provider can be selected without changing workflow rules.
- No hardcoded fallback diagnosis is presented as AI output. If no provider is configured, diagnosis endpoint returns a documented unavailable error and the operator may still run policy-only tests without a diagnosis.
- Use unfamiliar synthetic error messages in acceptance scenarios. Verify the model produces a schema-valid diagnosis with evidence references; test wrong/hallucinated IDs, unsupported corrections and low confidence. The policy engine rejects invalid proposals and escalates uncertainty.
- Preserve input provenance and model/prompt version for reproducibility. The model never chooses approval, execution permission, final state or closure.

## First-demo correction and approval policy

The first demo supports exactly one synthetic repair class: **an invalid beneficiary bank code**. AI interprets unfamiliar rejection wording and returns the structured category `INVALID_BENEFICIARY_BANK_CODE` plus evidence references. Deterministic policy then looks up the beneficiary bank alias in a synthetic bank directory. A correction is proposed only when there is exactly one active exact-match directory entry and the processor evidence confirms that the instruction was rejected for the invalid-bank-code reason. The policy engine supplies the canonical synthetic code; it does not use an AI-invented financial value.

The corrected instruction is a separate immutable version. Any beneficiary bank-code change requires synthetic customer maker and authoriser evidence before execution. Every plan also requires a separate SafeReplay reviewer, including this narrow repair. No amount, currency, account number, beneficiary name, value date or payment type can be altered in this demo. Ambiguous directory matches, missing customer authorization, unsupported rejection codes or low-confidence diagnoses remain blocked/escalated. This policy is a prototype safeguard and does not claim to reproduce OCBC's internal procedures.

## API contract

Base path `/api/v1`, JSON bodies, pagination for list endpoints, field validation, stable error format and OpenAPI docs at `/docs` in local development.

| Method and path | Purpose |
|---|---|
| `GET /health` | API/database health without secrets |
| `POST /auth/token`, `GET /auth/me` | Local synthetic bearer authentication |
| `POST /batches` | Create synthetic batch, optionally with initial instructions for test convenience |
| `GET /batches`, `GET /batches/{batch_id}` | List/retrieve batch and status summary |
| `POST /batches/{batch_id}/instructions` | Add synthetic instructions for API testing |
| `POST /transfers` | Separate API test endpoint to create one payment instruction in an existing batch |
| `GET /transfers`, `GET /transfers/{transfer_id}` | List/retrieve an instruction with batch and processor status |
| `POST /complaints` | Separate test endpoint for a synthetic payment-related complaint linked to a batch and optionally an instruction |
| `GET /complaints/{complaint_id}` | Retrieve submitted synthetic complaint and linked payment exception |
| `POST /batches/{batch_id}/evidence` | Attach synthetic batch evidence |
| `POST /instructions/{instruction_id}/evidence` | Attach synthetic instruction evidence |
| `POST /batches/{batch_id}/diagnoses` | Run configurable AI diagnosis against supplied synthetic evidence |
| `POST /batches/{batch_id}/recovery-plans/preflight` | Simulate the requested exact instruction scope; returns eligible/excluded records and deterministic checks |
| `GET /recovery-plans/{plan_id}` | Retrieve immutable preflight plan and impact report |
| `POST /recovery-plans/{plan_id}/approvals` | Reviewer approve/reject/escalate bound plan |
| `POST /recovery-plans/{plan_id}/execute` | Execute approved plan in mock processor with required `Idempotency-Key` |
| `POST /executions/{execution_id}/verify` | Trigger/retrieve actual mock state read-back; mismatch remains unresolved |
| `GET /batches/{batch_id}/timeline` | Read batch/instruction activities, evidence and decisions |
| `GET /audit-events` | Paginated audit view for authorized reviewers/admins |
| `POST /test-scenarios/{scenario}/inject` | Local/test-only fault injection for false acknowledgement or delayed/missing processor state; disabled outside local/test configuration |

Creation endpoints are for synthetic testing and never move real money. Duplicate client references return `409`; malformed fields return `422`; missing records return `404`; stale plans/invalid transitions return `409`; unauthorized writes return `401/403`. All writes and their audit records commit atomically where they share a database transaction. Mock processor commands and read-back are individually correlated and auditable.

## Persistence and local operations

- FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL + Docker Compose.
- PostgreSQL uses an application schema and isolated mock-processor schema; the app accesses processor state only through `ProcessorPort`, not direct use of its own execution rows as truth.
- Migrations are explicit; application startup does not drop/recreate tables.
- `.env.example` contains variable names and safe placeholders only. `.env`, keys and real transaction data are excluded from version control.
- Seed/reset commands are local-only and explicit. The seed dataset is deterministic and clearly fictional; it includes accepted/rejected mixed status, stale-plan, duplicate, low-confidence and false-ack cases.
- CORS can be configured later for the existing frontend. It remains restricted to configured origins; no frontend modifications are part of this work.
- README documents setup, migrations, seed command, authentication, REST examples for batch/transfer/complaint creation, preflight, approval, execute, verify and fault injection.

## Scrum delivery plan

Maintain a small product backlog with epic, story, priority, estimate, sprint, owner, status, acceptance criteria and blocker. Each sprint ends with a runnable API/database increment and review evidence.

### Sprint 1 — Data foundation and test API

- Create service scaffold, Compose/PostgreSQL, migrations, health and authentication/roles.
- Implement batches, instructions, synthetic complaints, evidence, separate `POST /transfers` and `POST /complaints` test paths, retrieval and audit events.
- Seed the illustrative 30-item batch and verify no real data is present.
- **Sprint review:** create a batch, add/retrieve instructions and complaint, show persisted SQL state and OpenAPI schemas.

### Sprint 2 — Diagnosis and deterministic preflight

- Implement provider adapter and structured diagnosis storage.
- Implement policy engine and immutable recovery plan with exact IDs, state versions, exclusions, correction rules and simulation output.
- Add tests for unfamiliar text, hallucinated IDs, unsupported corrections, low confidence, accepted/unknown/stale statuses and unsafe full-batch retry.
- **Sprint review:** show AI diagnosis proposal and deterministic block/eligible plan for synthetic batch.

### Sprint 3 — Approval, mock execution and verified outcome

- Implement maker/customer authorization evidence, reviewer approval, plan hash, expiry/freshness checks, idempotent execution and isolated processor state adapter.
- Implement independent read-back and fault injection for false acknowledgement/no state update; persist discrepancies without closing the case.
- Complete audit timeline, operator README/API examples and end-to-end tests.
- **Sprint review:** demo blocked unsafe retry, safe approved recovery, false success acknowledgement, actual read-back mismatch and unresolved final state.

## Acceptance criteria

- Fresh checkout can start API and PostgreSQL from documented local steps; migrations and deterministic seed work without manually creating tables.
- `POST /batches`, `POST /transfers` and `POST /complaints` are separate documented and usable routes; transfer/complaint records are synthetic and persisted.
- 30-instruction fixture yields 12 accepted-for-processing and 18 rejected records. A full-batch retry plan is blocked; only currently rejected and otherwise eligible IDs can be prepared.
- Accepted-for-processing is never shown as settled. Unknown, processing, stale, previously recovered and status-mismatched instructions cannot execute.
- AI diagnosis runs through a real configured provider in the demo and handles an unfamiliar synthetic error. Unconfigured provider returns an explicit unavailable result; no canned recommendation masquerades as AI.
- AI-proposed nonexistent IDs, unsupported corrections and missing evidence fail deterministic checks or escalate; AI alone cannot authorize any action.
- Changing a plan after approval invalidates approval; self-approval is rejected; execution requires valid reviewer authorization and customer authorization for any material instruction change.
- Repeating the same execution idempotency key and payload does not repeat actions; a changed payload under the same key conflicts.
- Mock processor acknowledgement with no matching persisted state fails verification, keeps the case unresolved and does not automatically retry any instruction.
- Audit history includes evidence, diagnosis versions, policy results, exclusions, approvals, attempted actions and read-back outcomes; ordinary users cannot edit/delete it.
- Automated tests cover persistence, role controls, validation, duplicate references, atomic audit, state transitions, idempotency, partial results and the false-ack scenario.
- No route connects to OCBC or initiates real money movement; frontend files remain unchanged.

## Open implementation calls

- **AI provider:** use the team's configured provider and secrets; provider is pluggable. This design does not assume access to Google AI Studio project credentials.
- **Prototype integration:** the ZIP source is currently not present locally, so route compatibility cannot be checked yet. The versioned REST API is designed as an independent backend; later integration may add an adapter without changing frontend in this task.
- **Repair policy:** the first demo's only correction class is an invalid beneficiary bank code resolved through one exact synthetic bank-directory match. Every plan requires independent reviewer approval; every bank-code change also requires synthetic customer maker-authoriser evidence. Ambiguous mappings are blocked.
- **Complaint endpoint:** retained only as a payment-related intake/test record linked to SafeReplay, not a broad complaint resolution feature.
