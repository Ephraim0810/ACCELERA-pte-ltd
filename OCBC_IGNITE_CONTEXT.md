# OCBC IGNITE — Working Context

Last updated: 2026-10-23

## Current direction

**OCBC SafeReplay** — AI-powered, verified payment exception recovery.

Tagline: **Fix only what failed. Prove nothing else was affected.**

Build a focused synthetic workflow for partially rejected corporate payment/GIRO batches. A sample batch has 30 instructions: 12 accepted for processing and 18 rejected. These figures are illustrative only. “Accepted for processing” does not mean settled. The system must never blindly retry the full batch.

## Product journey

1. Detect rejected and unresolved instructions.
2. Use AI to interpret messy or unfamiliar error evidence and propose a structured diagnosis and correction.
3. A deterministic policy engine checks eligibility, exact affected instruction IDs, state freshness, permissions, duplicate risk and approval requirements.
4. Simulate the proposed recovery against a test processor before action; show the before/after impact and rules passed/failed.
5. Require an authorised human approval where policy says so. AI cannot grant itself permission or alter customer-submitted instructions without authority.
6. Execute only eligible synthetic rejected instructions in a mock processor.
7. Independently read processor state. If acknowledgement says “success” but state did not change as expected, leave the case unresolved and record the discrepancy.

First-demo repair scope: one synthetic correction class only—invalid beneficiary bank code, proposed only when processor evidence confirms that rejection reason and a synthetic bank directory contains exactly one active exact match for the beneficiary bank alias. The AI classifies unfamiliar wording; deterministic code selects the directory value. Every recovery plan requires a separate SafeReplay reviewer. A bank-code change additionally requires synthetic customer maker-authoriser evidence. Ambiguous matches and unsupported errors are blocked/escalated.

Signature demo: block “retry all 30”; prepare a safe recovery only for verified eligible rejects; inject a false success acknowledgement; prove SafeReplay refuses to close the case without state read-back.

## Non-negotiable boundaries

- No live OCBC connection, credentials, APIs or production money movement.
- Synthetic data and mock processor only; never imply actual OCBC loss, duplicate incidents, exception volumes or measured benefits.
- An accepted-for-processing instruction is excluded from recovery unless an authoritative synthetic state check proves it is safe and policy explicitly permits the action.
- Customer maker-authoriser controls remain in place. Recovery preparation is not authority to change or submit customer instructions.
- AI diagnoses and explains; deterministic code authorises, simulates, checks exact scope, executes bounded mock actions and verifies outcomes.
- Keep frontend, branding and copy untouched. Backend and technical documentation only.
- Do not expand the product with FirstFix or other ideas; treat them only as possible future extensions outside current scope.

## Backend objective

Build a persistent relational SQL backend and a mock processor to support the full SafeReplay workflow. Expose separate documented REST endpoints to create synthetic payment batches and instructions for testing. Also support evidence ingestion, AI diagnosis proposal capture, deterministic preflight simulation, maker/checker approval, sandbox execution, independent state read-back, unresolved discrepancy handling, and append-only audit history. API docs and repeatable synthetic seed/test cases are required. Scrum stories and acceptance criteria should be documented.

Do not implement until the SafeReplay backend design document is reviewed and approved. Existing draft is `docs/superpowers/specs/2026-10-23-resolvepay-backend-design.md`; it must be replaced with a SafeReplay design after checking source compatibility.

## Evidence and claims

- OCBC's public Velocity help page documents “Partially Rejected”: some GIRO items are invalid and rejected while valid items will be paid out. This supports the mixed-status scenario. It does not establish settlement timing for each accepted item or OCBC's internal recovery workflow. The claimed “file repair” feature could not be confirmed in official guides checked; do not repeat that claim without a primary source.
- Public evidence does not establish OCBC's internal recovery workflow, workload, duplicate-payment incidents, or exception frequency. Describe gaps and duplicate prevention as design objectives/hypotheses.
- MAS AI governance/Safr alignment should be described as design alignment, not MAS approval or certification. Verify current primary source and exact requirements.
- AI payment repair/investigation is commercial prior art. Verify Finastra OperatorAssist and Pega references; do not pitch AI diagnosis alone as novel. Distinction to demonstrate: test-before-action, human approval, exact instruction scope and independent state verification.
- Verified official source URLs: OCBC GIRO status definitions (Partially Rejected says valid items will be paid out): https://www.ocbc.com/business-banking/help-and-support/business-internet-banking/general ; MAS SAFR page (3 Jul 2026): https://www.mas.gov.sg/publications/monographs-or-information-paper/2026/safeguards-for-agentic-finance-at-runtime ; MAS parliamentary reply calls SAFR a potential approach (5 Aug 2026): https://www.mas.gov.sg/news/parliamentary-replies/2026/written-reply-to-parliamentary-question-on-agentic-ai-in-financial-services ; Finastra OperatorAssist launch (5 Mar 2026): https://www.finastra.com/press-media/finastra-launches-ai-based-operatorassist-transform-how-banks-address-payments-handling ; Finastra repair recommendations (29 Sep 2026): https://www.finastra.com/press-media/finastra-launches-ai-powered-repair-recommendations-modern-payments-processing ; Pega agentic payment investigations (16 Sep 2025): https://www.pega.com/about/news/press-releases/pega-launches-first-payment-exceptions-and-investigations-solution-native.
- Open background research and citations: `OCBC_IGNITE_Problem2_Research_and_Ideas.md`.
- IGNITE brief: `OCBC_Four_Problem_Statements_IGNITE_SP.pdf`; Problem 2 is Intelligent Operations, from automation to autonomous resolution, with human oversight, synthetic data and auditability emphasized.

## Project files and current state

- `OCBC_IGNITE_CONTEXT.md`: this compact source of project context. Read it before reopening larger research/brief files unless new materials arrive or an explicit detail is missing.
- `OCBC_IGNITE_Problem2_Research_and_Ideas.md`: previous broader research; superseded as product direction by SafeReplay.
- `docs/superpowers/specs/2026-10-23-resolvepay-backend-design.md`: older broad ResolvePay backend draft; not approved and not implementation authority.
- Prototype source ZIP is in the persistent project materials as `resolvepay---ai-payment-exception-handling (1).zip`; it is not present in the local project folder yet. Inspect it before defining API compatibility. The current environment's managed file transfer failed, so do not infer its internals.

## Prior OCBC operating context

From the earlier verified research notes: OCBC's 2025 Annual Report describes AI in operations, including document processing and workflow optimisation; its Source of Wealth Assistant extracts and structures documents, identifies gaps and prompts follow-up, while staff retain judgment/final approval. These are relevant operating signals, not proof OCBC uses AI for payment batch recovery. The earlier notes and URLs remain in `OCBC_IGNITE_Problem2_Research_and_Ideas.md`.

## Current next step

Review the backend design options and write a SafeReplay-specific design for approval. After approval, create an implementation plan, then build with tests first. Keep the work on backend, database, API, mock processor, security/audit and Scrum documentation.
