# OCBC IGNITE Problem 2 — Research & Concept Options

**Prepared:** 22 October 2026  
**Purpose:** Teacher selection / hackathon qualification pitch preparation  
**Working title:** Intelligent Operations: From Automation to Autonomous Resolution

## Executive summary

Problem 2 asks for an intelligent workflow that takes an operational exception from detection through investigation to a suitable resolution, while keeping accuracy, control and a clear audit trail. The strongest student concept is a **bounded Exception Resolution Workbench**: it uses synthetic cases to classify exceptions, gather evidence, identify missing information, recommend a policy-grounded action, automatically close only a small set of reversible low-risk cases, and send uncertain or consequential cases to a human reviewer.

This fits OCBC's public direction. OCBC reports using AI in operations for document processing and workflow optimisation. Its Source of Wealth Assistant gathers and synthesises evidence, identifies gaps and prompts follow-ups; staff retain final judgment and approval. OCBC reports preparation time falling from up to 10 days to about one hour for that specific workflow. This is a useful design precedent, not a promise that our prototype will deliver the same result.

There is no reliable public OCBC statistic for the volume of operational exceptions located in this research. The pitch should present a testable synthetic demonstration and explicitly avoid calling demo performance an OCBC baseline.

## What exactly is the problem?

A bank operations case can pass between systems and teams while staff repeat checks, search for supporting information, wait for approvals, chase missing details and record follow-ups. Automating one isolated step may speed up that step but leave the underlying case unresolved. The challenge is therefore to coordinate the **whole case journey**, not merely produce a chatbot answer or a dashboard alert.

### What a convincing solution must do

1. Detect and classify a synthetic operational exception.
2. Gather relevant evidence from sample sources.
3. Identify what is missing or inconsistent.
4. Recommend a cause and next action, grounded in evidence and rules.
5. Resolve only eligible, low-risk cases or escalate them to a human.
6. Record what happened, why, when, and who approved or overrode it.
7. Measure resolution time and manual effort.

### Required safety boundaries

- No connection to live banking systems.
- No real customer or transaction data.
- No autonomous high-risk decisions.
- Demonstrate what happens when evidence is missing, confidence is low, or the system makes a mistake.

## What OCBC appears to value in practice

Public evidence points to a pragmatic pattern: use AI to gather and organise evidence and coordinate repetitive workflow tasks, while employees keep responsibility for consequential judgment. OCBC's 2025 Annual Report describes its Source of Wealth Assistant within KYC workflows: it extracts and synthesises information, identifies gaps and prompts follow-ups. The report says work previously taking up to 10 days can take about one hour, while relationship managers and compliance teams retain judgment and final approval. OCBC separately reports AI automating document processing and optimising workflows across operations.

OCBC's 2024 Annual Report describes Group Finance citizen developers automating more than 30 processes/tasks and saving or avoiding approximately 2,800 annual man-hours. OCBC also publicly describes model governance for AI development, deployment and monitoring. Together these indicate that a credible pitch should show measurable productivity and quality gains with controls, role clarity and review—not autonomy for its own sake.

A relevant live-work example appears in an OCBC Payment Operations – Remittance job description: staff identify, investigate and resolve payment exceptions and discrepancies, while monitoring service levels. This makes payment discrepancy handling a plausible synthetic prototype workflow, but the team should describe it as a chosen illustrative case, not claim OCBC has selected or endorsed it.

## Research insight: rules and process knowledge matter

Li, Ni and Xiao's 2025 open-access *Systems* paper studies process anomaly detection in a commercial bank. Its key design insight is that frequency-based process mining can miss rare but important paths. The authors incorporate standard-operating-procedure relationships into process mining to preserve and flag deviations. The work is based on one Chinese bank's corporate account-opening logs; its measured results should not be transferred to OCBC. For our prototype, the transferable idea is modest and useful: combine event histories with explicit workflow rules rather than using an opaque anomaly score alone.

## Solution options

### Option A — Exception Resolution Workbench (recommended core)

**What it does:** A case appears in a work queue. The system classifies it. An agent gathers evidence from synthetic records, checks required fields, identifies gaps, and proposes a resolution with supporting sources. A rules engine determines whether the case qualifies for a reversible low-risk action. The reviewer can approve, edit, reject or escalate. Each step is logged.

**Why it fits:** It addresses the full challenge statement and makes the agent actually move a case forward, rather than only explaining it.

**Pros:** Direct match to all expected outcomes; excellent live-demo story; measurable; allows safe autonomy boundary; combines AI and deterministic rules.

**Cons:** Requires a tightly scoped workflow and plausible synthetic records; risks becoming a generic chat interface unless it changes case status and executes workflow transitions; recommendations depend on the quality of the rules/evidence.

**Wildcard:** A replay mode shows the same case handled manually versus with the workbench, comparing time, clicks/manual steps, completeness and errors.

**Benefits:**
- **Customer/user:** Faster handling and fewer repeated requests for the same information.
- **OCBC employee:** Less searching and copy-pasting; clearer evidence packet; reviewer time spent on judgment rather than routine checks.
- **OCBC:** Potentially shorter cycle time, lower rework, more consistent treatment, stronger auditability and process metrics.

**Main risks/controls:** Wrong recommendation → cite evidence and require reviewer for uncertainty; mistaken auto-close → restrict to reversibility and explicit rules; data exposure → synthetic dataset only; stale precedent → show source date and rule version.

### Option B — SLA- and Impact-Aware Exception Queue

**What it does:** Prioritises cases using transparent factors such as time remaining to SLA, customer/process impact, number of handoffs, missing evidence and confidence. It explains each rank and allows staff to override it.

**Why it fits:** Even when cases cannot be auto-resolved, the right case can be worked first. It addresses operational delays and handoffs.

**Pros:** Simple, visual, feasible; clear employee benefit; easy to test against FIFO; pairs naturally with Option A.

**Cons:** Ranking can disadvantage cases whose impact is not represented in data; a priority score alone does not investigate or resolve a case; depends on believable synthetic SLA/impact assumptions.

**Wildcard:** Show a “what if” simulator for workload spikes and compare overdue cases under FIFO vs transparent prioritisation.

**Benefits:** Customer gets urgent cases surfaced sooner; employees see why work is prioritised; OCBC gets better SLA visibility and workload balancing.

**Controls:** Show contributing factors, avoid hidden customer-value proxies, include aging/fairness checks, allow override, monitor missed high-impact cases.

### Option C — Evidence-First Similar-Case Finder

**What it does:** Finds similar resolved synthetic cases and approved sample playbooks. It displays what matches, what differs, evidence links and the resolution previously used. It proposes—but does not blindly copy—a next step.

**Why it fits:** Routine cases often require staff to search prior records and guidance. Reusing relevant knowledge can reduce search time and inconsistent handling.

**Pros:** Strong explainability and knowledge-transfer story; feasible with a small curated sample set; supports new staff.

**Cons:** Similarity can be misleading; historical cases may encode outdated or incorrect practice; retrieval alone does not resolve the case.

**Wildcard:** “Counterexample” panel shows a similar case that should not be followed and why (e.g., amount/status differs or required evidence missing).

**Benefits:** Customer may receive a more consistent resolution; employee gains precedent and reasoning; OCBC preserves operational knowledge and reduces dependence on individual memory.

**Controls:** Approved playbooks only; show exact match fields and differences; date/version metadata; no recommendation when evidence is insufficient.

### Option D — First-Time-Right Intake and Missing-Information Loop

**What it does:** Validates a submitted operational request against a checklist, detects missing/invalid fields, and generates a targeted follow-up request. Once complete, it routes the case to the right queue.

**Why it fits:** Preventing incomplete cases can avoid unnecessary handoffs and repeated follow-ups.

**Pros:** Easy to demonstrate; visibly customer-centred; may reduce preventable rework; rules are testable.

**Cons:** May shift the burden to customers if prompts are too strict; not all exceptions arise from incomplete intake; needs careful language and accessible recovery.

**Wildcard:** An “explain what is needed and why” view with plain-language, multilingual sample prompts, while preserving the official checklist.

**Benefits:** Customer knows exactly what is missing; employees spend less time chasing; OCBC may reduce incomplete submissions and back-and-forth.

**Controls:** Ask only for necessary fields; do not expose internal risk logic; provide a human-help route; test false missing-field flags.

### Option E — Early-Warning Process Radar (wildcard/future extension)

**What it does:** Reviews synthetic event logs to spot recurring loops, handoff bottlenecks or process steps associated with later exceptions. It suggests a process change or a targeted control.

**Why it fits:** Shifts from handling exceptions one by one to preventing repeat causes.

**Pros:** More distinctive; helps process owners; uses event logs and analytics well; could reveal systemic workflow issues.

**Cons:** Harder to establish causality; greater data needs; less immediate to users; risk of producing an interesting chart without resolving any case.

**Wildcard:** A process-replay visualisation reveals where cases loop or wait, with a simulation of a proposed process change.

**Benefits:** Customers may see fewer recurring delays; staff see fewer avoidable repeat cases; OCBC learns where process redesign could improve quality and cost.

**Controls:** Label correlations as hypotheses; show sample size and uncertainty; require human process-owner validation before changing procedures.

### Option F — Customer Status and Self-Service Repair (optional extension)

**What it does:** Gives a plain-language status for an exception and, when appropriate, securely guides a user through providing missing information. Complex cases move to staff.

**Why it fits:** Reduces uncertainty and potentially avoids status-chasing contact.

**Pros:** Strong customer experience; visible end-user journey; can close the loop from operations to customer.

**Cons:** Adds privacy, authentication and disclosure questions; a wrong explanation can damage trust; expands scope beyond the internal workflow.

**Wildcard:** Demonstrate a “safe handoff” that transfers the customer from self-service to a human with the existing case context attached.

**Benefits:** Customer gains clarity and an easier repair route; employee gets fewer status-only enquiries; OCBC may improve service experience and reduce avoidable contacts.

**Controls:** Use synthetic identity/case data; disclose only approved status text; require authentication in a simulated journey; route ambiguity to staff.

## Recommended concept for the teacher pitch

Pitch **Option A as the product**, with the transparent queue from Option B and evidence retrieval from Option C as small supporting features. Keep D, E and F as roadmap/wildcards rather than promising all of them in the first build.

**One-sentence concept:** “We are building a controlled operations workbench that turns a synthetic exception into an evidence-backed next action—resolving only rule-approved, reversible cases and escalating everything uncertain with a complete audit trail.”

### Suggested demonstration case

Use a synthetic reconciliation mismatch or incomplete operational request. Show:
1. A case enters the queue and receives a clear exception category.
2. The agent retrieves synthetic event records and a sample procedure.
3. The system identifies a missing field or mismatch and explains the evidence.
4. A deterministic policy rule either permits a low-risk action or blocks it.
5. The reviewer approves, edits, overrides or escalates.
6. The audit timeline records evidence, policy/rule version, action, reason, actor and timestamp.
7. A process dashboard compares the assisted journey with the synthetic manual baseline.

### Metrics for a credible proof of concept

Measure on the same labelled synthetic cases, against a manual/FIFO baseline:
- Median time to resolution (simulated or measured in the demo).
- Number of manual steps / handoffs.
- Correct classification and routing rate.
- First-pass completeness rate.
- False auto-resolution rate (most important safety measure).
- Escalation rate and reviewer override rate.
- Audit completeness (required evidence and decision fields present).

Report actual prototype results only after running the demo/test cases. Do not extrapolate to OCBC scale or savings without validated operational data.

## Risks, unknowns and how to handle them

- **No OCBC baseline:** Public research located no dependable count of exception cases, average resolution time or current cost. Ask OCBC staff later if access is granted; until then use synthetic baselines and label them clearly.
- **Workflow selection is unvalidated:** Payment reconciliation is a plausible illustration, but the teacher/OCBC may prefer another routine process. Keep the underlying engine configurable.
- **Synthetic-data realism:** Document assumptions and include normal, incomplete, conflicting, duplicate, low-confidence and high-risk cases.
- **AI hallucination:** The model should not invent evidence or policy. Recommendations must cite retrieved sample records; policy eligibility is decided by explicit rules.
- **Automation bias:** Reviewer can see evidence and uncertainty, edit or reject actions, and escalate.
- **Scope creep:** Deliver one end-to-end case journey before adding many agents, channels or dashboards.
- **Cyber/security posture:** Synthetic data only, role-specific demo screens, minimal secrets, no production connectors.

## Source notes

1. OCBC, *Annual Report 2025 — Driving Customer Centricity Through AI, Digital and Data*: https://www.ocbc.com/group/investors/annual-reports/2025-annual-report/driving-customer-centricity-through-ai-digital-and-data.page
2. OCBC, *Annual Report 2025 — Operations and Technology*: https://www.ocbc.com/group/investors/annual-reports/2025-annual-report/year-in-review/operations-and-technology.page
3. OCBC, *Annual Report 2024 — Chin Yee / Group Finance*: https://www.ocbc.com/group/investors/annual-reports/2024-annual-report/leaders-insight/chin-yee.page
4. OCBC, *Conducting our business responsibly* (model governance): https://www.ocbc.com/group/sustainability/responsible-business
5. OCBC, Payment Operations – Remittance role description: https://ocbc.wd102.myworkdayjobs.com/en-US/External/job/Payment-Operations---Remittance_JR00005363
6. Li, Y., Ni, Z. & Xiao, B. (2025). “Domain Knowledge-Enhanced Process Mining for Anomaly Detection in Commercial Bank Business Processes.” *Systems*, 13(7), 545. https://doi.org/10.3390/systems13070545 (open access)
7. OCBC, GIRO API media release (sandbox and anonymised test data): https://www.ocbc.com/assets/pdf/media/2017/september/ocbc%20media%20release%20-%20ocbc%20bank%20is%20first%20bank%20in%20singapore%20to%20launch%20transactional%20api%20for%20giro%20set-up.pdf

**Access note:** Sci-Hub was not used. The literature source cited here is publisher-hosted open access; OCBC evidence is from OCBC's public materials.
