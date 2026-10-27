import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateSyntheticCases } from "../src/seed.mjs";
import { createDatabase } from "../src/db.mjs";
import { createClient } from "@libsql/client";

async function withDatabase(run, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "casepilot-db-"));
  const path = join(dir, "test.sqlite");
  let db;
  try {
    db = await createDatabase({ path, env: {}, ...options });
    return await run(db, { dir, path });
  } finally {
    if (db) await db.close();
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      // Windows can retain a SQLite file handle briefly after libSQL closes it.
      if (process.platform !== "win32" || error.code !== "EBUSY") throw error;
    }
  }
}

test("generates 120 deterministic cases across all review routes", () => {
  const a = generateSyntheticCases(120);
  const b = generateSyntheticCases(120);
  assert.equal(a.length, 120);
  assert.deepEqual(a, b);
  assert.ok(new Set(a.map((row) => row.groundTruthRoute)).size >= 3);
  assert.ok(a.every((row) => row.synthetic === true));
});

test("local file selection creates schema and persists seeded cases across reopen", async () => {
  await withDatabase(async (db, { path }) => {
    const rows = generateSyntheticCases(120);
    assert.deepEqual(await db.seedCases(rows), { inserted: 120, existing: 120 });
    assert.deepEqual(await db.seedCases(rows), { inserted: 0, existing: 120 });
    assert.equal(await db.countCases(), 120);
    assert.equal((await db.listPayments({ limit: 1 })).total, 120);
    assert.equal((await db.listCases({ limit: 10 })).items.length, 10);
    await db.close();
    const reopened = await createDatabase({ path, env: {} });
    try {
      const first = await reopened.getCase(rows[0].id);
      assert.equal(first.paymentReference, rows[0].paymentReference);
      assert.ok(first.events.length > 0);
      assert.deepEqual(await reopened.seedCases(rows), { inserted: 0, existing: 120 });
    } finally { await reopened.close(); }
  });
});

test("DATABASE_URL selects its database only when the Turso token is present", async () => {
  await withDatabase(async (local, { dir, path }) => {
    const hostedPath = join(dir, "hosted.sqlite");
    const env = { DATABASE_URL: pathToFileURL(hostedPath).href, TURSO_AUTH_TOKEN: "test-token" };
    const selected = await createDatabase({ env, path });
    try {
      await selected.insertCase(generateSyntheticCases(1)[0]);
      assert.equal(await selected.countCases(), 1);
      assert.equal(await local.countCases(), 0);
      await local.close();
      await selected.close();
      const fallback = await createDatabase({ env: { DATABASE_URL: env.DATABASE_URL }, path });
      try { assert.equal(await fallback.countCases(), 0); }
      finally { await fallback.close(); }
    } finally { await selected.close(); }
  });
});

test("creating a payment round trips the full case and recommendation", async () => {
  await withDatabase(async (db) => {
    const input = { ...generateSyntheticCases(1)[0], id: "payment-1", paymentReference: "ROUND-TRIP-1", payeeName: "Vendor", beneficiaryAccount: "123", bankCountry: "SG", purpose: "Invoice" };
    const recommendation = { route: "human_review", rationale: "Manual check" };
    const payment = await db.createPayment(input, recommendation);
    assert.equal(payment.id, "payment-1");
    assert.equal(payment.payeeName, "Vendor");
    assert.equal(payment.beneficiaryAccount, "123");
    assert.equal(payment.bankCountry, "SG");
    assert.equal(payment.purpose, "Invoice");
    assert.deepEqual(payment.recommendation, recommendation);
    assert.equal(payment.case.triage.route, "human_review");
    assert.equal((await db.listPayments({ query: "ROUND-TRIP-1" })).items[0].id, payment.id);
  });
});

test("duplicate payment reference rolls back the second case and its events", async () => {
  await withDatabase(async (db) => {
    const [first, second] = generateSyntheticCases(2);
    await db.createPayment({ ...first, paymentReference: "UNIQUE-1" });
    await assert.rejects(db.createPayment({ ...second, paymentReference: "UNIQUE-1" }), /unique|constraint/i);
    assert.equal(await db.countCases(), 1);
    assert.equal((await db.listPayments()).total, 1);
    assert.equal(await db.getCase(second.id), null);
  });
});

test("messages, decisions and verification audit persist across close and reopen", async () => {
  await withDatabase(async (db, { path }) => {
    const input = { ...generateSyntheticCases(1)[0], id: "workflow-1", paymentReference: "WORKFLOW-1" };
    const payment = await db.createPayment(input);
    const message = await db.saveMessage(payment.id, "Please verify the details");
    assert.equal(message.status, "draft_only");
    assert.equal(message.sent, false);
    assert.equal((await db.decidePayment(payment.id, "accept", "Reviewed")).workflowStatus, "reviewed");
    assert.equal((await db.verifyPayment(payment.id)).actionRecorded, true);
    await db.close();
    const reopened = await createDatabase({ path, env: {} });
    try {
      const saved = await reopened.getPayment(payment.id);
      assert.equal(saved.workflowStatus, "reviewed");
      assert.equal(saved.messages[0].message, "Please verify the details");
      assert.equal(saved.messages[0].sent, false);
      assert.ok(saved.audit.some((item) => item.type === "customer_draft_saved" && item.details.messageId === message.id));
      assert.ok(saved.audit.some((item) => item.type === "operator_decision" && item.details.note === "Reviewed"));
      assert.ok(saved.audit.some((item) => item.type === "outcome_verification" && item.details.actionRecorded === true));
    } finally { await reopened.close(); }
  });
});

test("payment and case pages keep full response shapes with bounded database reads", async () => {
  const executed = [];
  const clientFactory = (config) => {
    const client = createClient(config);
    return new Proxy(client, {
      get(target, key) {
        if (key === "execute") return (statement) => {
          executed.push(typeof statement === "string" ? statement : statement.sql);
          return target.execute(statement);
        };
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  await withDatabase(async (db) => {
    const seed = generateSyntheticCases(120);
    await db.seedCases(seed);
    const target = seed[0];
    await db.saveDraft(target.id, "Pending review");
    await db.saveAnalysis(target.id, "policy_fallback", { label: "synthetic" }, { route: "routine", total: 0 });

    executed.length = 0;
    const payments = await db.listPayments({ limit: 120 });
    const paymentQueries = executed.length;
    assert.equal(payments.total, 120);
    assert.equal(payments.items.length, 120);
    const payment = payments.items.find((item) => item.id === target.id);
    assert.equal(payment.case.id, target.id);
    assert.equal(payment.events.length, target.events.length);
    assert.equal(payment.messages[0].message, "Pending review");
    assert.equal(payment.analyses[0].provider, "policy_fallback");
    assert.ok(payment.audit.some((item) => item.type === "analysis_created"));
    assert.ok(paymentQueries > 0 && paymentQueries <= 8, "payment page executed " + paymentQueries + " queries");

    executed.length = 0;
    const cases = await db.listCases({ limit: 120 });
    const caseQueries = executed.length;
    assert.equal(cases.total, 120);
    const entry = cases.items.find((item) => item.id === target.id);
    assert.equal(entry.events.length, target.events.length);
    assert.deepEqual(entry.analyses, []);
    assert.deepEqual(entry.drafts, []);
    assert.deepEqual(entry.audit, []);
    assert.ok(caseQueries > 0 && caseQueries <= 3, "case page executed " + caseQueries + " queries");
  }, { clientFactory });
});
test("pending payment filter includes processing and unknown statuses", async () => {
  await withDatabase(async (db) => {
    await db.seedCases(generateSyntheticCases(12));
    const unknown = (await db.listPayments({ status: "unknown" })).total;
    const processing = (await db.listPayments({ status: "processing" })).total;
    assert.equal((await db.listPayments({ status: "pending" })).total, unknown + processing);
  });
});

test("only a closed case can be reported as resolved", async () => {
  await withDatabase(async (db) => {
    await db.seedCases(generateSyntheticCases(12));
    const record = (await db.listCases({ limit: 1 })).items[0];
    const outcome = await db.verifyPayment(record.id);
    assert.equal(outcome.verified, false);
    assert.equal(outcome.actionRecorded, false);
  });
});
