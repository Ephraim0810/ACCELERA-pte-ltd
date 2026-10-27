# ResolvePay Backend Design

**Status:** Draft for review  
**Scope:** Backend and synthetic SQL data only. Frontend, branding and product wording are out of scope.

## Intent

Build a maintainable backend for ResolvePay that can store synthetic transfer records and complaints, support an operational exception workflow, and expose a documented REST API that the existing or future frontend can call. The user specifically wants separate endpoints to create complaints and transfers for API testing.

## Goals

- Use a relational SQL database with migrations, integrity constraints and reproducible seed data.
- Expose versioned REST endpoints for synthetic transfers, complaints, evidence and workflow actions.
- Make endpoints easy to try through generated OpenAPI documentation, Postman or curl.
- Preserve the Problem 2 control pattern: collect evidence, identify gaps, recommend or perform only bounded low-risk actions, and escalate uncertainty to a human reviewer.
- Record an append-only case activity/audit trail for status changes and decisions.
- Provide Scrum-ready scope, stories and acceptance criteria as project documentation.
- Keep backend work isolated from the frontend so frontend integration can happen later.
- Protect write operations with authentication and role-based authorization; the service will be a functional local/staging backend with persistent SQL behavior, while the banking records remain synthetic.

## Non-goals and safety boundaries

- No live OCBC connection, credentials, APIs or production banking deployment.
- No real customer, account or transaction data. All names, references and records are synthetic.
- No endpoint initiates, authorises or settles money movement. A transfer is only a simulated record in the database.
- No autonomous high-risk financial or customer outcome.
- No frontend, visual redesign, brand work or feature copy changes.

## Approaches considered

1. **FastAPI + PostgreSQL (selected recommendation):** Standalone Python REST service, SQLAlchemy models, Alembic migrations, PostgreSQL and Docker Compose. OpenAPI/Swagger is generated automatically. This provides a clean integration boundary and supports typed validation and relational case history.
2. **Node/Express + PostgreSQL:** Suitable if the source ZIP contains a Node backend worth extending. It keeps a JavaScript stack but requires more explicit API schema/documentation setup.
3. **FastAPI + MySQL:** Also viable and aligns with the user's recent MySQL/Docker coursework. PostgreSQL is preferred for this greenfield service because API stack can be independent of the frontend and PostgreSQL has strong relational constraints and JSON support for varied synthetic evidence.

The selected default is a separate FastAPI/PostgreSQL service. Before implementation, inspect the attached source ZIP if it can be made available locally; reuse compatible existing backend conventions while retaining the frontend boundary. If the ZIP establishes an incompatible existing backend or database choice, revise this design before coding.

## Data model

- **Transfer:** synthetic transfer reference, source/beneficiary aliases, amount, currency, channel, created/submitted timestamps, simulated processing status and optional exception code. No real account identifiers. Values and statuses are constrained.
- **Complaint:** complaint reference, category, description, channel, priority, status, timestamps, optional transfer foreign key, assigned queue/owner and resolution summary.
- **Evidence item:** source type, synthetic source reference, evidence content/summary, captured timestamp and related complaint or transfer. A database constraint ensures each evidence item belongs to exactly one parent.
- **Case activity:** append-only timeline event for intake, classification, evidence collection, missing-information detection, recommendation, reviewer action, resolution or escalation. Include actor ID/role, timestamp, reason and relevant rule/version identifiers.
- **Workflow rule / action record:** bounded low-risk rule outcomes and whether a proposed action was approved, rejected or escalated. Do not make raw AI output authoritative for policy decisions.
- **User:** local application identity with a hashed password, active flag and role (`operator`, `reviewer`, `admin`). Seeded users are synthetic; password values come from local environment configuration, never committed defaults.

## API contract

Base path: `/api/v1`. JSON request and response bodies. Use standard HTTP status codes, validation errors and pagination for collection routes. OpenAPI UI will be available at `/docs` in local development.

| Method and route | Purpose |
|---|---|
| `POST /api/v1/transfers` | Create a fictional transfer record for testing. It does not move funds. |
| `GET /api/v1/transfers` | List synthetic transfers with filters and pagination. |
| `GET /api/v1/transfers/{transfer_id}` | Retrieve one transfer and its linked exception summary. |
| `POST /api/v1/complaints` | Create a complaint; optionally link it to an existing synthetic transfer. |
| `GET /api/v1/complaints` | List complaints with status, category, priority and date filters. |
| `GET /api/v1/complaints/{complaint_id}` | Retrieve a complaint with evidence and activity timeline. |
| `POST /api/v1/complaints/{complaint_id}/evidence` | Add a synthetic evidence item. |
| `POST /api/v1/complaints/{complaint_id}/actions` | Submit an explicit workflow action such as request-info, recommend-resolution, approve, reject or escalate; validate allowed transitions and write an audit event. |
| `GET /api/v1/health` | Check API and database connectivity without exposing secrets. |
| `POST /api/v1/auth/token` | Exchange valid local credentials for a short-lived access token. |
| `GET /api/v1/auth/me` | Return the authenticated user ID and role. |

Creation endpoint behaviour:

- `POST /transfers` validates amount > 0, supported currency/channel/status, and unique transfer reference; generated ID and timestamps are returned. It creates an audit record.
- `POST /complaints` validates category, description and channel; if transfer ID is supplied, it must refer to an existing transfer. It creates an initial activity event and places the complaint in the appropriate synthetic queue.
- Transfer creation is record-only: it does not debit, credit, submit, recall or settle funds. If the caller sets a synthetic starting status for a test scenario, it must be from the documented enum and that initial state is written to activity history.
- Duplicate business references return a conflict response rather than silently creating duplicates. Idempotency keys are optional and may be deferred if they delay the first sprint.
- Invalid input returns field-level `422`; missing records return `404`; duplicate references or invalid state transitions return `409`.
- All write routes require a valid token. Operators can create cases and evidence; reviewers can approve/reject/escalate; admins can manage synthetic reference data. Each workflow action checks the role and state transition inside one database transaction.

Exact request fields and allowed enumerations will be finalized after source ZIP inspection and captured as examples in the README/OpenAPI schema.

## Synthetic data sourcing

Use OCBC public information only to ground workflow categories, not to reproduce internal processes or claim bank-specific rates. Possible simulated cases include a payment exception/discrepancy, incomplete request, missing evidence, duplicate submission, status mismatch, manual review required, and low-confidence case. All identifiers, amounts, narratives, timestamps and outcomes are fictional and clearly labelled as synthetic. Seed data should include normal cases and failure scenarios, with a documented deterministic seed command.

## Service design

- FastAPI routes → request/response schemas → service layer for validation and allowed transitions → SQLAlchemy repositories/models → PostgreSQL.
- Alembic manages schema changes; startup does not silently overwrite data or run unsafe schema recreation.
- Docker Compose runs API and database with a health check and persistent local volume; credentials live in an untracked `.env` file with a safe `.env.example`.
- Passwords use a standard adaptive hash; bearer tokens have a short expiry and signing secret from environment configuration. Seed credentials must be set explicitly by the developer; no universal default password is shipped.
- Environment-specific configuration; CORS is restricted to configured frontend origins when integration begins.
- Pydantic settings, structured logs, parameterized SQL/ORM queries and no sensitive values in logs.
- Seed/reset commands are explicit and local-only; reset must not be available as a production API route.

## Scrum delivery plan

**Epic 1 — Database foundation:** project scaffold, Compose, schema, migrations, seed data, health check.  
**Epic 2 — REST resources:** complaint/transfer create and read endpoints, validation, filtering, pagination, OpenAPI examples.  
**Epic 3 — Resolution workflow:** evidence and activity timeline, allowed state transitions, reviewer approval/override/escalation.  
**Epic 4 — Quality and handoff:** integration tests, error cases, README, API client examples, demo dataset verification, frontend integration contract.

Suggested increments:

- **Sprint 1:** database/service foundation, migrations, authentication/roles, synthetic dataset, health endpoint, `POST/GET` transfers and complaints.
- **Sprint 2:** evidence, activity history, workflow action endpoint, transition/risk rules and reviewer flow.
- **Sprint 3:** metrics endpoints if needed by the current app, reliability/security checks, documentation and integration readiness.

Each story will have acceptance criteria and be moved through a visible backlog with owner, estimate, sprint, status and blocker. The working database/API should be runnable at each sprint review. Scope is backend-only; a frontend owner can consume the OpenAPI contract later.

## Acceptance criteria

- A fresh local checkout can start API and PostgreSQL using documented commands.
- A migration creates the schema; seed command loads clearly fictional, repeatable records.
- API docs expose the separate complaint and transfer `POST` routes with usable example bodies.
- A user can create a transfer, create a complaint linked to that transfer, retrieve both, and see the audit/activity events persisted in SQL.
- Unauthenticated write requests are rejected; a role without reviewer permission cannot approve or resolve a case.
- Repeating a unique business reference, linking a nonexistent transfer, malformed fields and illegal state changes return documented errors and do not create partial records.
- Automated API tests verify persistence, relationship integrity, validation and audit logging.
- No route performs real money movement or connects to OCBC production services.

## Open implementation details

- Need inspect the attached app source to confirm current frontend request shapes, existing service conventions and required endpoints.
- Choose exact exception categories/status enumerations after mapping the current app flow and public evidence.
- Confirm target runtime/deployment only if the project moves beyond local hackathon testing.
