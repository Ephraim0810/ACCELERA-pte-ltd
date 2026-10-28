# Accelera upgrade — implementation contract

User supplied a complete upgrade brief and requested direct implementation, preserving the current application. Existing autonomous execution preference remains. No approval round, rebuild, new framework or deployment. Update the same GitHub repository after verification using connector tools; no clone.

## Preserved
Node HTTP server, libSQL/SQLite storage, existing pages/routes and deployment settings, public validated payment intake, login compatibility, all original scenarios, protected instruction snapshots, exact allocation approval, transactional execution, idempotence and read-back closure.

## New core
1. Persistent Smart Recovery requests and responses, addressed to the synthetic processor desk. A hashed, expiring, request-scoped capability authorises the recipient portal; it grants no operations access. Portal response must match stored processor evidence and payment binding. Invalid, expired, contradictory or replayed responses cannot authorise updates. Valid receipt invalidates old proposals, persists evidence and resumes through Challenger/SafeReplay.
2. Programmatic Evidence Challenger over typed claims and inspectable DB evidence IDs. Free prose remains advisory. Unsupported/contradictory/stale factual claims block actions. ClearMatch distinguishes exact bindings from related-record candidates.
3. Stored synthetic risk-monitor restrictions block automated recovery and cannot be cleared by LLM or ordinary approval. Authorised reviewer decisions are recorded.
4. SafeReplay previews before/after, checks current evidence/authority/duplicates/policy and revalidates before execution; changed-status fixture demonstrates stale-plan refusal.
5. Backend accounts and permission rules: agent, reviewer with configurable currency/amount limit, administrator, process owner. Existing admin login retained. UI displays authenticated authority rather than pretending a role dropdown grants permissions.
6. Resolution Passport assembles original exception, findings, evidence, requests/responses, claim verification, simulation, approvals, execution/verification and chronological audit; export JSON and inspect sources.
7. Reproducible benchmark measures server processing and actual operation counts for a scripted manual sequence versus controlled sequence on identical synthetic fixtures. Explicitly not human handling time or bank savings.

## UI
Extend existing navigation with case tabs for investigation, recovery, evidence/risk, SafeReplay and Passport; human queue within current filters. Red/ivory/charcoal editorial design, visible recovery progress, evidence states, risk callouts, measured charts, helpful loading/error/empty states, keyboard and tablet support. Retain the original guide and ordinary intake semantics.

## Tests and delivery
Add regression tests first for portal authorisation/binding/replay/expiry, malformed responses, risk restrictions, contradictory/unsupported claims, stale plans, actual role denials/limits, original feature compatibility, Passport persistence and measured benchmark honesty. Run full suite, syntax, local browser end-to-end scenarios and independent final code review. Freeze source before any final security artifact. Provide updated runnable ZIP, verified commit and accurate remaining limitations.
