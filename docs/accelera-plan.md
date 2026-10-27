# Accelera guided prototype implementation plan

Goal: make the full prototype clear, polished and faithful to PS2.
Architecture: preserve Node/libSQL; add a structured transactional workflow engine and cohesive vanilla browser workspace.
Spec: docs/accelera-design.md. User delegated implementation; execute inline.
Isolation: extracted directory, no Git clone. Publish via GitHub tools with a branch-head lease after verification.

Review focus: normal intake must not invoke AI; unknown/false acknowledgements cannot close; approval cannot replace mandate; concurrent actions cannot apply twice; confirmation and original instructions must match.

1. Write regression tests for intake bypass, honest drafts and actual verification. Add workflow tests for status update, waiting/resume, allocation, missing authority, duplicate/no-op, stale evidence, in-flight and false acknowledgements.
2. Implement src/workflow.mjs pure guards/transitions. Extend src/db.mjs with workflow table and transactional persistence; src/server.mjs with labelled scenarios, endpoints, truthful analysis and protected actions.
3. Rebuild public pages/styles: overview, guided payment/receipt, searchable prioritised queue, evidence/action/verification workspace, audit/outcomes, help and sign-in. Explicit synthetic fixtures and offline/live modes.
4. Run full suite, syntax checks and actual browser flows. Check responsive, empty/error states. Independently review code/security, fix defects and rerun relevant tests.
5. Deliver source ZIP, launcher and guide. Confirm remote branch unchanged, create one tree/commit and update existing branch without force; verify committed files. No separate deployment.

Validation: node --test; node --check src/server.mjs; node --check public/workspace.js; actual loopback browser walkthrough.
