import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCasePilotServer } from "../src/server.mjs";

const validCase = {
  customerName: "Synthetic Orchard Pte Ltd",
  amount: 1280.5,
  currency: "SGD",
  rail: "SWIFT",
  paymentStatus: "confirmed",
  exceptionType: "status_mismatch",
  customerEnquiry: "Please confirm whether the supplier received this payment.",
  evidenceSummary: "A later authoritative record confirms completion.",
  evidenceQuality: "complete",
  potentialImpact: "information_only",
  identityConcern: "none",
  retryRequested: false,
  authoritativeConflict: false,
};

async function adminContext(dispatch) {
  const login = await dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  return { token: login.body.token };
}

async function createLegacyPayment(dispatch,input) {
  return dispatch("POST","/api/payments",input,await adminContext(dispatch));
}

async function removeTemporaryDir(dir) {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    if (process.platform !== "win32" || error.code !== "EBUSY") throw error;
  }
}
async function withApp(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-api-"));
  const app = await createCasePilotServer({ dbPath: join(dir, "api.sqlite"), env: {}, ...options });
  t.after(async () => { await app.close(); await removeTemporaryDir(dir); });
  return app.dispatch;
}

test("POST /api/cases persists a case and GET retrieves it", async (t) => {
  const dispatch = await withApp(t);
  const created = await dispatch("POST", "/api/cases", validCase);
  assert.equal(created.status, 201);
  assert.equal(created.body.synthetic, true);
  assert.equal(created.body.triage.route, "routine");
  const context = await adminContext(dispatch);
  const fetched = await dispatch("GET", "/api/cases/" + created.body.id, {}, context);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.id, created.body.id);
});

test("POST /api/cases rejects invalid facts", async (t) => {
  const dispatch = await withApp(t);
  const result = await dispatch("POST", "/api/cases", { ...validCase, evidenceQuality: "make_me_low_risk" });
  assert.equal(result.status, 422);
});

test("analysis model recommendation cannot override deterministic hard-stop route", async (t) => {
  const dispatch = await withApp(t, {
    analyzer: async () => ({ provider: "test-model", riskRecommendation: "low", summary: "Model thinks it is safe.", confirmedFacts: [], uncertainties: [], likelyCause: "Unknown", nextStep: "Retry now" }),
  });
  const created = await dispatch("POST", "/api/cases", { ...validCase, paymentStatus: "unknown", retryRequested: true });
  const context = await adminContext(dispatch);
  const result = await dispatch("POST", "/api/cases/" + created.body.id + "/analyze", {}, context);
  assert.equal(result.body.model.riskRecommendation, "low");
  assert.equal(result.body.triage.route, "human_review");
  assert.equal(result.body.triage.paymentActionAllowed, false);
});

test("customer draft endpoint persists but never sends a message", async (t) => {
  const dispatch = await withApp(t);
  const created = await dispatch("POST", "/api/cases", validCase);
  const context = await adminContext(dispatch);
  const result = await dispatch("POST", "/api/cases/" + created.body.id + "/customer-draft", {}, context);
  assert.equal(result.status, 201);
  assert.equal(result.body.sent, false);
  assert.match(result.body.message, /synthetic case/i);
});



test("POST /api/cases rejects malformed event evidence with 422", async (t) => {
  const dispatch = await withApp(t);
  const result = await dispatch("POST", "/api/cases", { ...validCase, events: [{ title: "ok", detail: "bad", verified: "yes" }] });
  assert.equal(result.status, 422);
});

test("analysis uses an explicitly labelled fallback without a configured Groq key", async (t) => {
  const dispatch = await withApp(t);
  const created = await dispatch("POST", "/api/cases", validCase);
  const context = await adminContext(dispatch);
  const analysis = await dispatch("POST", "/api/cases/" + created.body.id + "/analyze", {}, context);
  assert.equal(analysis.body.model.provider, "demo_fallback");
  assert.equal(analysis.body.triage.route, "routine");
});

test("duplicate payment references are rejected", async (t) => {
  const dispatch = await withApp(t);
  const input = { ...validCase, paymentReference: "SYN-USER-TEST-001" };
  assert.equal((await dispatch("POST", "/api/cases", input)).status, 201);
  assert.equal((await dispatch("POST", "/api/cases", input)).status, 409);
});


test("API reference documents required fields for posting a case", async (t) => {
  const dispatch = await withApp(t);
  const docs = await dispatch("GET", "/api/docs");
  assert.equal(docs.body.openapi, "3.1.0");
  const schema = docs.body.components.schemas.CaseInput;
  assert.ok(schema.required.includes("paymentStatus"));
  assert.equal(schema.properties.evidenceQuality.enum.length, 4);
  const paymentSchema=docs.body.components.schemas.PaymentSubmission;
  assert.ok(paymentSchema.required.includes("beneficiaryAccount"));
  assert.equal(paymentSchema.properties.paymentStatus, undefined);
});



test("payment intake persists and returns an automatic route; all payments include it", async (t) => {
  const dispatch = await withApp(t);
  const input = { ...validCase, paymentReference: "PAY-INTAKE-8821", payeeName: "Apex Industrial Parts Ltd" };
  const created = await createLegacyPayment(dispatch, input);
  assert.equal(created.status, 201);
  assert.equal(created.body.paymentReference, "PAY-INTAKE-8821");
  assert.equal(created.body.route, "routine");
  const login = await dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  const list = await dispatch("GET", "/api/payments?route=routine", {}, { token: login.body.token });
  assert.ok(list.body.items.some((x) => x.id === created.body.id));
  assert.ok(list.body.total >= 1);
});

test("workflow endpoints require admin session and record a simulated customer update", async (t) => {
  const dispatch = await withApp(t);
  const created = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-AUTH-7788" });
  assert.equal((await dispatch("POST", `/api/payments/${created.body.id}/message`, { message: "We are reviewing your payment." })).status, 401);
  const login = await dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  assert.equal(login.status, 200);
  const context = { token: login.body.token };
  const sent = await dispatch("POST", `/api/payments/${created.body.id}/message`, { message: "We are reviewing your payment." }, context);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.sent, false);
  const detail = await dispatch("GET", `/api/payments/${created.body.id}`, {}, context);
  assert.equal(detail.body.messages[0].sent, false);
});

test("an AI route can be overridden with a reason but hard stops cannot", async (t) => {
  const dispatch = await withApp(t);
  const flagged = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-OVR-8821", paymentStatus: "processing", evidenceQuality: "partial", potentialImpact: "information_only" });
  const login = await dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  const context = { token: login.body.token };
  const noReason = await dispatch("POST", `/api/payments/${flagged.body.id}/decision`, { decision: "override", overrideRoute: "routine" }, context);
  assert.equal(noReason.status, 422);
  assert.match(noReason.body.error, /reason/i);
  const hardStop = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-HARD-8821", paymentStatus: "unknown", retryRequested: true });
  const blocked = await dispatch("POST", `/api/payments/${hardStop.body.id}/decision`, { decision: "override", overrideRoute: "routine", overrideReason: "Checked" }, context);
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.error, /hard stops/i);
});

test("payment queue and details are restricted to the admin session", async (t) => {
  const dispatch = await withApp(t);
  assert.equal((await dispatch("GET", "/api/payments")).status, 401);
  const payment = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-SEC-001" });
  assert.equal((await dispatch("GET", `/api/payments/${payment.body.id}`)).status, 401);
});

test("AI can recommend escalation above the policy floor", async (t) => {
  const dispatch = await withApp(t, { analyzer: async () => ({ provider: "test-model", riskRecommendation: "high", confidence: 0.93, summary: "Evidence indicates a high risk." }) });
  const payment = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-AI-HIGH-001" });
  const context = await adminContext(dispatch);
  const analysis = await dispatch("POST", `/api/payments/${payment.body.id}/analyze`, {}, context);
  assert.equal(analysis.body.recommendation.aiRoute, "escalate");
  assert.equal(analysis.body.route, "escalate");
  assert.equal(analysis.body.recommendation.policyFloor, "routine");
  assert.equal(analysis.body.workflowStatus, "pending");
});

test("admin override records the selected route and verification finds the recorded outcome", async (t) => {
  const dispatch = await withApp(t);
  const payment = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "PAY-OVERRIDE-001" });
  const login = await dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  const context = { token: login.body.token };
  const result = await dispatch("POST", `/api/payments/${payment.body.id}/decision`, { decision: "override", overrideRoute: "human_review", overrideReason: "Reviewer found a supporting document not present in the initial record." }, context);
  assert.equal(result.status, 200);
  assert.equal(result.body.route, "human_review");
  const verified = await dispatch("POST", `/api/payments/${payment.body.id}/verify`, {}, context);
  assert.equal(verified.body.verified, false);
  assert.equal(verified.body.actionRecorded, true);
  assert.equal(verified.body.resolved, false);
});


test("legacy case reads and actions require the admin session", async (t) => {
  const dispatch=await withApp(t); const created=await dispatch("POST","/api/cases",validCase);
  assert.equal((await dispatch("GET","/api/cases")).status,401);
  assert.equal((await dispatch("GET",`/api/cases/${created.body.id}`)).status,401);
  assert.equal((await dispatch("POST",`/api/cases/${created.body.id}/review`,{outcome:"mark_reviewed"})).status,401);
  const context=await adminContext(dispatch); assert.equal((await dispatch("GET",`/api/cases/${created.body.id}`,{},context)).status,200);
});

test("payment assessment is derived from beneficiary records, not client-supplied risk labels", async (t) => {
  const dispatch=await withApp(t);
  const good={customerName:"Northstar Supplies Pte Ltd",payeeName:"Apex Industrial Parts Pte Ltd",beneficiaryAccount:"0123456789",bankCountry:"Singapore",paymentReference:"PMT-GOOD-001",amount:4800,currency:"SGD",rail:"GIRO",purpose:"October parts invoice"};
  const routine=await createLegacyPayment(dispatch,good);
  assert.equal(routine.status,201); assert.equal(routine.body.route,"routine");
  const unregistered=await createLegacyPayment(dispatch,{...good,paymentReference:"PMT-NEW-001",beneficiaryAccount:"8765432109",payeeName:"New Parts Supplier",identityConcern:"none",potentialImpact:"information_only",evidenceQuality:"complete",route:"routine",riskRecommendation:"low"});
  assert.equal(unregistered.status,201); assert.equal(unregistered.body.route,"human_review");
  const mismatch=await createLegacyPayment(dispatch,{...good,paymentReference:"PMT-MISMATCH-001",payeeName:"Different Company Ltd"});
  assert.equal(mismatch.status,201); assert.equal(mismatch.body.route,"escalate"); assert.ok(mismatch.body.case.triage.hardStops.length);
});

test("beneficiary country mismatch escalates from stored account evidence", async (t) => {
  const dispatch=await withApp(t);const input={customerName:"Northstar Supplies Pte Ltd",payeeName:"Apex Industrial Parts Pte Ltd",beneficiaryAccount:"0123456789",bankCountry:"Malaysia",paymentReference:"PMT-COUNTRY-001",amount:4800,currency:"SGD",rail:"SWIFT",purpose:"October invoice"};
  const created=await createLegacyPayment(dispatch,input);assert.equal(created.body.route,"escalate");assert.ok(created.body.case.triage.hardStops.length);
});


test("server initialization awaits seed before reporting persistent counts", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-init-"));
  const app = await createCasePilotServer({ dbPath: join(dir, "init.sqlite"), env: {} });
  t.after(async () => { await app.close(); await removeTemporaryDir(dir); });
  const health = await app.dispatch("GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.caseCount, 120);
  assert.equal(health.body.paymentCount, 120);
});

test("payment updates are visible on subsequent reads and list responses", async (t) => {
  const dispatch = await withApp(t);
  const created = await createLegacyPayment(dispatch, { ...validCase, paymentReference: "ASYNC-WRITE-001" });
  assert.equal(created.status, 201);
  const context = await adminContext(dispatch);
  const decided = await dispatch("POST", `/api/payments/${created.body.id}/decision`, { decision: "accept", note: "Reviewed" }, context);
  assert.equal(decided.status, 200);
  assert.equal(decided.body.workflowStatus, "reviewed");
  const fetched = await dispatch("GET", `/api/payments/${created.body.id}`, {}, context);
  assert.equal(fetched.body.workflowStatus, "reviewed");
  const listed = await dispatch("GET", "/api/payments?q=ASYNC-WRITE-001", {}, context);
  assert.equal(listed.body.items[0].workflowStatus, "reviewed");
});

test("legacy case actions return persisted records in the response", async (t) => {
  const dispatch = await withApp(t);
  const created = await dispatch("POST", "/api/cases", { ...validCase, paymentReference: "ASYNC-CASE-001" });
  const context = await adminContext(dispatch);
  const reviewed = await dispatch("POST", `/api/cases/${created.body.id}/review`, { outcome: "mark_reviewed" }, context);
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.reviewStatus, "reviewed");
  const drafted = await dispatch("POST", `/api/cases/${created.body.id}/customer-draft`, {}, context);
  assert.equal(drafted.status, 201);
  assert.equal(drafted.body.status, "draft_only");
  const fetched = await dispatch("GET", `/api/cases/${created.body.id}`, {}, context);
  assert.equal(fetched.body.reviewStatus, "reviewed");
  assert.equal(fetched.body.drafts[0].id, drafted.body.id);
});

test("database failure returns a safe health response without connection details", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-health-"));
  const app = await createCasePilotServer({ dbPath: join(dir, "health.sqlite"), env: {} });
  t.after(async () => { await new Promise((resolve) => app.server.close(resolve)); await app.close(); await removeTemporaryDir(dir); });
  app.db.countCases = async () => { throw new Error("libsql://private-db.turso.io?authToken=secret-health-token"); };
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.doesNotMatch(JSON.stringify(body), /private-db|secret-health-token|libsql:/);
});

test("hosted mode requires remote database and explicit nondefault credentials", async () => {
  const remote = { NODE_ENV: "production", DATABASE_URL: "libsql://private-db.turso.io", TURSO_AUTH_TOKEN: "secret-hosted-token" };
  const missingDb = { ...remote, DATABASE_URL: undefined, DEMO_ADMIN_USER: "reviewer", DEMO_ADMIN_PASSWORD: "strong-example-password" };
  const missingToken = { ...remote, TURSO_AUTH_TOKEN: undefined, DEMO_ADMIN_USER: "reviewer", DEMO_ADMIN_PASSWORD: "strong-example-password" };
  const missingAdmin = remote;
  const defaultPassword = { ...remote, DEMO_ADMIN_USER: "reviewer", DEMO_ADMIN_PASSWORD: "casepilot" };
  for (const env of [missingDb, missingToken, missingAdmin, defaultPassword]) {
    await assert.rejects(async () => createCasePilotServer({ env }), (error) => {
      assert.match(error.message, /configuration|database|credentials|password/i);
      assert.doesNotMatch(error.message, /private-db|secret-hosted-token|strong-example-password|libsql:/);
      return true;
    });
  }
});


test("database rejection during a decision does not expose connection details", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-decision-error-"));
  const app = await createCasePilotServer({ dbPath: join(dir, "decision.sqlite"), env: {} });
  t.after(async () => { await new Promise((resolve) => app.server.close(resolve)); await app.close(); await removeTemporaryDir(dir); });
  const created = await createLegacyPayment(app.dispatch, { ...validCase, paymentReference: "ASYNC-ERROR-001" });
  const { token } = await adminContext(app.dispatch);
  app.db.decidePayment = async () => { throw new Error("libsql://private-db.turso.io?authToken=secret-decision-token"); };
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/payments/${created.body.id}/decision`, {
    method: "POST", headers: { "content-type": "application/json", "x-admin-token": token }, body: JSON.stringify({ decision: "accept" }),
  });
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private-db|secret-decision-token|libsql:/);
});

test("payment workflow and audit history persist across a database reopen", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-reopen-flow-"));
  const dbPath = join(dir, "persistent.sqlite");
  let app = await createCasePilotServer({ dbPath, env: {} });
  t.after(async () => { await app?.close(); await removeTemporaryDir(dir); });

  const created = await createLegacyPayment(app.dispatch, {
    ...validCase,
    paymentReference: "PERSIST-WORKFLOW-001",
    payeeName: "Apex Industrial Parts Ltd",
  });
  assert.equal(created.status, 201);
  const login = await app.dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  assert.equal(login.status, 200);
  const context = { token: login.body.token };
  const message = await app.dispatch("POST", `/api/payments/${created.body.id}/message`, { message: "Your payment review is complete." }, context);
  assert.equal(message.status, 201);
  const decision = await app.dispatch("POST", `/api/payments/${created.body.id}/decision`, { decision: "accept", note: "Reviewed evidence; outcome still needs verification." }, context);
  assert.equal(decision.status, 200);
  assert.equal(decision.body.workflowStatus, "reviewed");
  const verification = await app.dispatch("POST", `/api/payments/${created.body.id}/verify`, {}, context);
  assert.equal(verification.status, 200);
  assert.equal(verification.body.verified, false);
  const paymentId = created.body.id;
  await app.close();

  app = await createCasePilotServer({ dbPath, env: {} });
  const reopenedLogin = await app.dispatch("POST", "/api/demo/login", { username: "admin", password: "casepilot" });
  const reopened = await app.dispatch("GET", `/api/payments/${paymentId}`, {}, { token: reopenedLogin.body.token });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.workflowStatus, "reviewed");
  assert.equal(reopened.body.messages[0].message, "Your payment review is complete.");
  assert.ok(reopened.body.audit.some((event) => event.type === "operator_decision"));
  assert.ok(reopened.body.audit.some((event) => event.type === "outcome_verification"));
});
