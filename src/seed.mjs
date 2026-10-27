import { computeTriage } from "./policy.mjs";

const templates = [
  {
    exceptionType: "status_mismatch",
    paymentStatus: "confirmed",
    evidenceQuality: "complete",
    potentialImpact: "information_only",
    identityConcern: "none",
    retryRequested: false,
    authoritativeConflict: false,
    groundTruthRoute: "false_alarm",
    customerEnquiry: "The supplier cannot see the payment yet. Can you confirm the latest status?",
    evidenceSummary: "A later, authoritative synthetic processor event confirms completion. The earlier pending status is stale.",
    timeline: [
      ["Payment submitted", "Synthetic payment instruction accepted for processing.", true],
      ["Intermediary update", "Status remained pending while the transfer was in progress.", false],
      ["Final confirmation", "Authoritative mock processor record shows completed.", true],
    ],
  },
  {
    exceptionType: "missing_information",
    paymentStatus: "processing",
    evidenceQuality: "partial",
    potentialImpact: "reversible_update",
    identityConcern: "needs_check",
    retryRequested: false,
    authoritativeConflict: false,
    groundTruthRoute: "needs_review",
    customerEnquiry: "The beneficiary says they need more details to identify this incoming payment.",
    evidenceSummary: "Reference information is incomplete. The payment remains in progress; a reviewer should confirm the missing remittance detail.",
    timeline: [
      ["Payment submitted", "Synthetic instruction entered processing.", true],
      ["Information check", "Beneficiary reference is incomplete in the available evidence.", false],
    ],
  },
  {
    exceptionType: "status_timeout",
    paymentStatus: "unknown",
    evidenceQuality: "partial",
    potentialImpact: "payment_change",
    identityConcern: "none",
    retryRequested: true,
    authoritativeConflict: false,
    groundTruthRoute: "needs_review",
    customerEnquiry: "Our supplier has not received this transfer. Should we submit it again?",
    evidenceSummary: "The submission attempt timed out. Available records do not confirm whether the payment was processed; retrying could duplicate it.",
    timeline: [
      ["Payment submitted", "Synthetic processor request was sent.", true],
      ["Processor timeout", "No final acknowledgement was received.", false],
    ],
  },
  {
    exceptionType: "unauthorized_change",
    paymentStatus: "confirmed",
    evidenceQuality: "complete",
    potentialImpact: "payment_change",
    identityConcern: "suspected_unauthorized",
    retryRequested: false,
    authoritativeConflict: false,
    groundTruthRoute: "high_risk",
    customerEnquiry: "We did not request a change to the beneficiary details. Please investigate.",
    evidenceSummary: "The evidence shows a beneficiary field change without matching synthetic maker-authoriser records.",
    timeline: [
      ["Change detected", "Synthetic beneficiary details changed after case creation.", true],
      ["Authority check", "No matching maker-authoriser evidence was found.", true],
    ],
  },
  {
    exceptionType: "conflicting_records",
    paymentStatus: "processing",
    evidenceQuality: "conflicting",
    potentialImpact: "payment_change",
    identityConcern: "needs_check",
    retryRequested: false,
    authoritativeConflict: true,
    groundTruthRoute: "high_risk",
    customerEnquiry: "Two updates show different payment statuses. Which one is correct?",
    evidenceSummary: "Two authoritative synthetic records disagree about the payment state. No correction or retry should proceed until reconciled.",
    timeline: [
      ["Network status", "Synthetic network record indicates processing.", true],
      ["Ledger status", "Synthetic ledger record indicates a different state.", true],
    ],
  },
  {
    exceptionType: "duplicate_concern",
    paymentStatus: "unknown",
    evidenceQuality: "conflicting",
    potentialImpact: "payment_change",
    identityConcern: "needs_check",
    retryRequested: true,
    authoritativeConflict: false,
    groundTruthRoute: "high_risk",
    customerEnquiry: "A possible repeat instruction appeared. Can you check whether both were sent?",
    evidenceSummary: "A possible duplicate instruction is present, and neither record provides a confirmed final payment state.",
    timeline: [
      ["Instruction A", "Synthetic instruction recorded with an unresolved state.", true],
      ["Instruction B", "Second similar instruction detected; relationship is not yet confirmed.", false],
    ],
  },
  {
    exceptionType: "intermediary_delay",
    paymentStatus: "processing",
    evidenceQuality: "complete",
    potentialImpact: "information_only",
    identityConcern: "none",
    retryRequested: false,
    authoritativeConflict: false,
    groundTruthRoute: "needs_review",
    customerEnquiry: "The payment is taking longer than expected. Is there an update?",
    evidenceSummary: "Intermediary processing is still underway. The evidence does not indicate a rejection or a safe reason to resubmit.",
    timeline: [
      ["Payment submitted", "Synthetic payment is being processed.", true],
      ["Intermediary notice", "Processing delay reported; no final status available.", true],
    ],
  },
  {
    exceptionType: "reference_mismatch",
    paymentStatus: "rejected",
    evidenceQuality: "partial",
    potentialImpact: "reversible_update",
    identityConcern: "needs_check",
    retryRequested: false,
    authoritativeConflict: false,
    groundTruthRoute: "needs_review",
    customerEnquiry: "The payment was rejected. Can the reference information be checked?",
    evidenceSummary: "Processor evidence confirms a rejected item, but the customer-provided reference needs verification before any correction.",
    timeline: [
      ["Payment rejected", "Synthetic processor returned a reference mismatch.", true],
      ["Evidence review", "Supporting reference is incomplete.", false],
    ],
  },
];

const names = [
  "Northstar Orchard Ltd",
  "Luma Components Pte Ltd",
  "Meridian Foods Pte Ltd",
  "Harbourlight Trading Ltd",
  "Evergreen Parts Pte Ltd",
  "Blue Fern Supplies Ltd",
  "Cedar & Finch Pte Ltd",
  "Solace Industrial Ltd",
  "Silver Kite Merchants Pte Ltd",
  "Redwood Logistics Ltd",
];

const currencies = ["SGD", "USD", "EUR", "GBP", "AUD"];
const rails = ["SWIFT", "GIRO", "FAST", "MEPS"];

export function generateSyntheticCases(count = 120) {
  return Array.from({ length: count }, (_, index) => {
    const template = templates[(index * 5 + Math.floor(index / 7)) % templates.length];
    const caseNumber = index + 1;
    return {
      id: `syn-${String(caseNumber).padStart(4, "0")}`,
      customerName: `SYNTHETIC · ${names[index % names.length]}`,
      paymentReference: `SYN-26-${String(caseNumber).padStart(6, "0")}`,
      amount: Number((185 + ((index * 791.37) % 92750)).toFixed(2)),
      currency: currencies[index % currencies.length],
      rail: rails[index % rails.length],
      paymentStatus: template.paymentStatus,
      exceptionType: template.exceptionType,
      customerEnquiry: template.customerEnquiry,
      evidenceSummary: template.evidenceSummary,
      evidenceQuality: template.evidenceQuality,
      potentialImpact: template.potentialImpact,
      identityConcern: template.identityConcern,
      retryRequested: template.retryRequested,
      authoritativeConflict: template.authoritativeConflict,
      groundTruthRoute: template.groundTruthRoute,
      events: template.timeline.map(([title, detail, verified], eventIndex) => ({
        title,
        detail,
        verified,
        occurredAt: new Date(Date.UTC(2026, 9, 1 + ((caseNumber + eventIndex) % 25), 9 + eventIndex, 15)).toISOString(),
      })),
      synthetic: true,
    };
  });
}

export const exceptionTypes = [...new Set([...templates.map(({ exceptionType }) => exceptionType), "routine_payment", "beneficiary_not_recognized", "beneficiary_name_mismatch"])];
