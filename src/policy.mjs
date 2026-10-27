const FACTORS = {
  paymentStatus: { confirmed: 0, processing: 1, rejected: 0, unknown: 2 },
  evidenceQuality: { complete: 0, partial: 1, conflicting: 2, missing: 2 },
  potentialImpact: { information_only: 0, reversible_update: 1, payment_change: 2 },
  identityConcern: { none: 0, needs_check: 1, suspected_unauthorized: 2 },
};

export function computeTriage(facts) {
  const scores = {};
  for (const [field, values] of Object.entries(FACTORS)) {
    const value = facts[field];
    if (!(value in values)) throw new Error(`Invalid ${field}`);
    scores[field] = values[value];
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const hardStops = [];
  if (facts.paymentStatus === "unknown") hardStops.push("unresolved_payment_status");
  if (facts.retryRequested && facts.paymentStatus !== "rejected") {
    hardStops.push("unresolved_status_before_retry");
  }
  if (facts.identityConcern === "suspected_unauthorized") hardStops.push("suspected_unauthorized_change");
  if (facts.authoritativeConflict) hardStops.push("authoritative_record_conflict");

  const severeStop = hardStops.some((stop) =>
    ["suspected_unauthorized_change", "authoritative_record_conflict"].includes(stop)
  );
  const route = severeStop || total >= 6
    ? "escalate"
    : hardStops.length > 0 || total >= 3
      ? "human_review"
      : "routine";

  return {
    factorScores: scores,
    total,
    maxScore: 8,
    hardStops,
    route,
    routeLabel: { routine: "Routine", human_review: "Human review", escalate: "Escalate" }[route],
    requiresHumanReview: route !== "routine",
    paymentActionAllowed: false,
    policyVersion: "casepilot-risk-v1",
  };
}

export const allowedValues = Object.fromEntries(
  Object.entries(FACTORS).map(([field, values]) => [field, Object.keys(values)])
);

const ROUTE_RANK = { routine: 0, human_review: 1, escalate: 2 };
const MODEL_ROUTE = { low: "routine", uncertain: "human_review", high: "escalate" };

export function recommendRoute(record, analysis) {
  const triage = record.triage || computeTriage(record);
  const aiRoute = MODEL_ROUTE[analysis?.riskRecommendation] || triage.route;
  const route = ROUTE_RANK[aiRoute] < ROUTE_RANK[triage.route] ? triage.route : aiRoute;
  return {
    route,
    aiRoute,
    confidence: Number.isFinite(analysis?.confidence) ? Math.max(0, Math.min(1, analysis.confidence)) : 0.55,
    rationale: String(analysis?.summary || "Recommendation is based on the available payment evidence.").slice(0, 1200),
    provider: analysis?.provider || "policy_fallback",
    policyFloor: triage.route,
    hardStops: triage.hardStops,
  };
}
