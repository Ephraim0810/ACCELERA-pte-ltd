import test from "node:test";
import assert from "node:assert/strict";
import { computeTriage } from "../src/policy.mjs";

const facts = (overrides = {}) => ({
  paymentStatus: "confirmed",
  evidenceQuality: "complete",
  potentialImpact: "information_only",
  identityConcern: "none",
  retryRequested: false,
  authoritativeConflict: false,
  ...overrides,
});

test("routes low, review, and escalated scores using backend policy", () => {
  assert.equal(computeTriage(facts()).route, "routine");
  assert.equal(computeTriage(facts({ potentialImpact: "payment_change", evidenceQuality: "partial" })).route, "human_review");
  assert.equal(computeTriage(facts({ paymentStatus: "unknown", evidenceQuality: "conflicting", potentialImpact: "payment_change", identityConcern: "needs_check" })).route, "escalate");
});

test("an unresolved payment retry is blocked from routine handling even at low total score", () => {
  const result = computeTriage(facts({ paymentStatus: "unknown", retryRequested: true }));
  assert.equal(result.total, 2);
  assert.equal(result.route, "human_review");
  assert.equal(result.paymentActionAllowed, false);
  assert.ok(result.hardStops.includes("unresolved_status_before_retry"));
});

test("suspected unauthorized changes always escalate", () => {
  const result = computeTriage(facts({ identityConcern: "suspected_unauthorized" }));
  assert.equal(result.route, "escalate");
  assert.equal(result.paymentActionAllowed, false);
});

test("authoritative record conflict is a hard stop", () => {
  const result = computeTriage(facts({ authoritativeConflict: true }));
  assert.equal(result.route, "escalate");
  assert.ok(result.hardStops.includes("authoritative_record_conflict"));
});

test("invalid risk evidence values are rejected", () => {
  assert.throws(() => computeTriage(facts({ evidenceQuality: "trust_the_model" })), /evidenceQuality/);
});

test("AI route recommendation cannot lower the policy floor", async () => {
  const { recommendRoute } = await import("../src/policy.mjs");
  const record = { paymentStatus: "unknown", evidenceQuality: "complete", potentialImpact: "information_only", identityConcern: "none", retryRequested: false, authoritativeConflict: false };
  const result = recommendRoute(record, { riskRecommendation: "low", summary: "Looks fine", confidence: 0.9 });
  assert.equal(result.aiRoute, "routine");
  assert.equal(result.route, "human_review");
  assert.equal(result.policyFloor, "human_review");
});
