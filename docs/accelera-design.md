# Accelera guided prototype

User direction: improve the full existing demo independently; the three-minute presentation is later. Keep the ZIP unchanged. Update Ephraim0810/OCBC-IGNITE via GitHub tools after testing, without cloning.

Approach: retain Node, libSQL/SQLite, vanilla browser code and the optional Groq investigator. A reskin leaves false closure intact; a framework rewrite adds setup risk. Build a consistent Accelera workspace with overview, payments, exception cases and audit/outcomes. Every screen explains what happened, why and the next action. Five PS2 role views are explained, not claimed as production RBAC.

Routine recording runs basic validation, saves an instruction and does not invoke exception investigation. Receipt never claims settlement. Structured mock scenarios demonstrate internal enquiry-status reconciliation and recovery of an existing authorised invoice split. Missing confirmation waits and can resume. Conflicting evidence, missing mandates, duplicates, in-flight attempts, mismatches and false acknowledgements remain controlled. No resubmission or original payment modification.

A payment-linked workflow table persists structured source evidence, target records, protected instruction snapshot, proposal, approvals, attempts and verification. Mutations are transactional. Authority, exact reference/customer/currency/amount match, current balances, permitted fields and duplicate checks are enforced independently of AI. Allocation requires existing mandate/recovery delegation and human approval. Evidence changes invalidate old proposals. Approval cannot invent missing authority. Execution and verification are separate: verification rereads persisted target and original instruction before closure. A repeated successful action is a no-op; unknown outcomes block blind retries. Messages are unsent drafts.

The UI is warm off-white, ink, white and burgundy, with readable type, restrained semantic states, responsive layout, keyboard access and reduced-motion support. Contextual guidance stays visible but collapsible. Evidence cards, before/after changes, human handoff and an explanatory activity log make cases understandable without a presenter. No imitation bank login or production claims.

Optional live AI is labelled accurately; without a key it is an offline deterministic walkthrough, with no invented confidence. Rules and structured evidence govern actions. Metrics count actual stored prototype events and durations, never fabricated bank savings.

Acceptance: correct intake bypasses AI; both permitted actions change saved records and survive restart; no closure without read-back; waiting/resume works; missing authority and unsafe cases cannot be forced through; repeats do not duplicate allocation; false acknowledgements stay open; drafts never claim sent. Complete regression tests and browser walkthrough, then provide runnable ZIP, Windows launcher, guide and verified GitHub commit. Private environment and runtime database are excluded.

Builder discretion: preserve compatible legacy APIs unless they conflict with correctness. No deployment. Existing dependency versions and stack stay. User has delegated routine design/implementation choices; proceed without another approval round.
