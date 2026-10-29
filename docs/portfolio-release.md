# Portfolio upgrade — 29 October 2026

## Scope and approach
The canonical app is payment-followup-demo. Root start, demo and test commands target that workflow. Preserve Express/libSQL and improve the existing full-stack journey rather than introduce a risky rewrite or leave policy enforcement behind a cosmetic refresh.

## Changes
Guided onboarding, responsive visual hierarchy, queue search/counts, response check explanations, required review reasons, saved-case receipts, transactional current-version checks, revocable sessions, same-origin writes and rejection of recognised credential disclosures before storage. No payment authority is delegated to the chatbot.

## Verification plan
Run the integration suite from the repository root. Exercise the Business and Staff views, successful confirmation, required notes, escalation and saved-state receipts in the browser. Check invalid answers, duplicate submissions and changed state as failure paths.

## Limits
No claim of bank-grade security, guaranteed fraud recognition or bank-wide savings. No production identity provider, role separation, durable distributed sessions, comprehensive personal-data filter or independent settlement source. Optional model wording needs separate provider validation. No deployment or LinkedIn post is included.

## Review and remediation
Codex Security reviewed immutable upgrade d505d91 and identified seed-token derivation-key exposure and a conditional shared-ingress quota issue. Remediation requires a fresh CASE_TOKEN_SECRET, derives every case token, configures bounded proxy trust, and returns the exact verified case snapshot. A regression reproduced forged-token access before the fix (HTTP 200) and now rejects it (403) in both read and write paths. Another test simulates independent visitor quotas under a configured trusted hop. This is targeted verification, not a second full security audit of the final patch.

The clean root installation passed its integration suite. Browser walkthrough exercised business confirmation, staff sign-in, analyst review and the saved-record receipt. The optional live AI provider and real hosted ingress remain untested. The historical app was not re-audited.
