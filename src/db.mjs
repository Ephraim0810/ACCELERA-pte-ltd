import { createClient } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { computeTriage } from "./policy.mjs";

function parseJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapCase(row, events = [], analyses = [], drafts = [], audit = []) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerName: row.customer_name,
    paymentReference: row.payment_reference,
    amount: row.amount,
    currency: row.currency,
    rail: row.rail,
    paymentStatus: row.payment_status,
    exceptionType: row.exception_type,
    customerEnquiry: row.customer_enquiry,
    evidenceSummary: row.evidence_summary,
    evidenceQuality: row.evidence_quality,
    potentialImpact: row.potential_impact,
    identityConcern: row.identity_concern,
    retryRequested: Boolean(row.retry_requested),
    authoritativeConflict: Boolean(row.authoritative_conflict),
    synthetic: Boolean(row.synthetic),
    groundTruthRoute: row.ground_truth_route,
    reviewStatus: row.review_status,
    triage: {
      factorScores: parseJson(row.factor_scores_json, {}),
      total: row.risk_score,
      maxScore: 8,
      hardStops: parseJson(row.hard_stops_json, []),
      route: row.route,
      routeLabel: { routine: "Routine", human_review: "Human review", escalate: "Escalate" }[row.route],
      requiresHumanReview: row.route !== "routine",
      paymentActionAllowed: false,
      policyVersion: "casepilot-risk-v1",
    },
    events,
    analyses,
    drafts,
    audit,
  };
}

const schema = `
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      payment_reference TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      rail TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      exception_type TEXT NOT NULL,
      customer_enquiry TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      evidence_quality TEXT NOT NULL,
      potential_impact TEXT NOT NULL,
      identity_concern TEXT NOT NULL,
      retry_requested INTEGER NOT NULL,
      authoritative_conflict INTEGER NOT NULL,
      risk_score INTEGER NOT NULL,
      factor_scores_json TEXT NOT NULL,
      hard_stops_json TEXT NOT NULL,
      route TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'not_reviewed',
      synthetic INTEGER NOT NULL DEFAULT 1,
      ground_truth_route TEXT
    );
    CREATE TABLE IF NOT EXISTS case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      verified INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model_json TEXT NOT NULL,
      triage_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_drafts (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft_only',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cases_route ON cases(route);
    CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_case ON case_events(case_id);
    CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, payment_reference TEXT NOT NULL UNIQUE, payer_name TEXT NOT NULL, payee_name TEXT NOT NULL, beneficiary_account TEXT NOT NULL DEFAULT '', bank_country TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT '', amount REAL NOT NULL, currency TEXT NOT NULL, rail TEXT NOT NULL, payment_status TEXT NOT NULL, route TEXT NOT NULL, case_id TEXT REFERENCES cases(id), recommendation_json TEXT NOT NULL DEFAULT '{}', workflow_status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_payments_route ON payments(route);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
  `;
const insertCaseSql = `
    INSERT INTO cases (
      id, created_at, updated_at, customer_name, payment_reference, amount, currency,
      rail, payment_status, exception_type, customer_enquiry, evidence_summary,
      evidence_quality, potential_impact, identity_concern, retry_requested,
      authoritative_conflict, risk_score, factor_scores_json, hard_stops_json,
      route, review_status, synthetic, ground_truth_route
    ) VALUES (
      $id, $createdAt, $updatedAt, $customerName, $paymentReference, $amount, $currency,
      $rail, $paymentStatus, $exceptionType, $customerEnquiry, $evidenceSummary,
      $evidenceQuality, $potentialImpact, $identityConcern, $retryRequested,
      $authoritativeConflict, $riskScore, $factorScores, $hardStops,
      $route, $reviewStatus, 1, $groundTruthRoute
    )
  `;

const paymentInsertSql = "INSERT INTO payments (id,payment_reference,payer_name,payee_name,beneficiary_account,bank_country,purpose,amount,currency,rail,payment_status,route,case_id,recommendation_json,workflow_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

export async function createDatabase({ env = process.env, path = "data/casepilot.sqlite", clientFactory = createClient } = {}) {
  const hosted = Boolean(env.DATABASE_URL && env.TURSO_AUTH_TOKEN);
  if (!hosted) await mkdir(dirname(path), { recursive: true });
  const db = clientFactory(hosted
    ? { url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }
    : { url: pathToFileURL(path).href });

  async function run(connection, sql, args = []) {
    return connection.execute({ sql, args });
  }
  async function rows(connection, sql, args = []) {
    return (await run(connection, sql, args)).rows;
  }
  async function one(connection, sql, args = []) {
    return (await rows(connection, sql, args))[0] ?? null;
  }
  async function write(operation) {
    const tx = await db.transaction("write");
    try {
      const result = await operation(tx);
      await tx.commit();
      return result;
    } catch (error) {
      try { await tx.rollback(); } catch { /* The failed statement may have closed the transaction. */ }
      throw error;
    } finally {
      tx.close();
    }
  }

  try {
    if (!hosted) {
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute("PRAGMA journal_mode = WAL");
    }
    await db.executeMultiple(schema);
    const existing = new Set((await rows(db, "PRAGMA table_info(payments)")).map((column) => column.name));
    for (const [name, definition] of [["beneficiary_account", "TEXT NOT NULL DEFAULT ''"], ["bank_country", "TEXT NOT NULL DEFAULT ''"], ["purpose", "TEXT NOT NULL DEFAULT ''"]]) {
      if (!existing.has(name)) await db.execute("ALTER TABLE payments ADD COLUMN " + name + " " + definition);
    }
  } catch (error) {
    db.close();
    throw error;
  }

  async function getCase(id, includeHistory = true) {
    const row = await one(db, "SELECT * FROM cases WHERE id = ?", [id]);
    if (!row) return null;
    const events = (await rows(db, "SELECT * FROM case_events WHERE case_id = ? ORDER BY occurred_at, rowid", [id]))
      .map((event) => ({
        id: event.id, occurredAt: event.occurred_at, title: event.title,
        detail: event.detail, verified: Boolean(event.verified),
      }));
    const analyses = includeHistory
      ? (await rows(db, "SELECT * FROM analyses WHERE case_id = ? ORDER BY created_at DESC", [id]))
        .map((item) => ({ id: item.id, provider: item.provider, model: parseJson(item.model_json, {}), triage: parseJson(item.triage_json, {}), createdAt: item.created_at }))
      : [];
    const drafts = includeHistory
      ? (await rows(db, "SELECT * FROM customer_drafts WHERE case_id = ? ORDER BY created_at DESC", [id]))
        .map((item) => ({ id: item.id, message: item.message, status: item.status, sent: item.status === "sent", createdAt: item.created_at }))
      : [];
    const audit = includeHistory
      ? (await rows(db, "SELECT * FROM audit_events WHERE case_id = ? ORDER BY created_at DESC LIMIT 30", [id]))
        .map((item) => ({ id: item.id, type: item.event_type, details: parseJson(item.details_json, {}), createdAt: item.created_at }))
      : [];
    return mapCase(row, events, analyses, drafts, audit);
  }

  async function insertCaseRows(tx, input) {
    const now = new Date().toISOString();
    const id = input.id || randomUUID();
    const triage = computeTriage(input);
    const paymentReference = input.paymentReference || "SYN-" + randomUUID().slice(0, 8).toUpperCase();
    await run(tx, insertCaseSql, {
      id, createdAt: now, updatedAt: now,
      customerName: input.customerName, paymentReference,
      amount: input.amount, currency: input.currency, rail: input.rail,
      paymentStatus: input.paymentStatus, exceptionType: input.exceptionType,
      customerEnquiry: input.customerEnquiry, evidenceSummary: input.evidenceSummary,
      evidenceQuality: input.evidenceQuality, potentialImpact: input.potentialImpact,
      identityConcern: input.identityConcern, retryRequested: Number(input.retryRequested),
      authoritativeConflict: Number(input.authoritativeConflict), riskScore: triage.total,
      factorScores: JSON.stringify(triage.factorScores), hardStops: JSON.stringify(triage.hardStops),
      route: triage.route, reviewStatus: triage.requiresHumanReview ? "pending" : "not_required",
      groundTruthRoute: input.groundTruthRoute || null,
    });
    const eventRows = input.events?.length ? input.events : [{
      title: "Case received", detail: "Synthetic payment exception added to the CasePilot queue.",
      verified: true, occurredAt: now,
    }];
    for (const event of eventRows) {
      await run(tx, "INSERT INTO case_events (id, case_id, occurred_at, title, detail, verified) VALUES (?, ?, ?, ?, ?, ?)",
        [randomUUID(), id, event.occurredAt || now, event.title, event.detail, Number(Boolean(event.verified))]);
    }
    await auditEvent(tx, id, "case_created", { source: input.id ? "synthetic_seed" : "api_or_ui" }, now);
    return { id, paymentReference, triage, now, reviewStatus: triage.requiresHumanReview ? "pending" : "not_required" };
  }
  async function auditEvent(connection, caseId, type, details, now = new Date().toISOString()) {
    await run(connection, "INSERT INTO audit_events (id,case_id,event_type,details_json,created_at) VALUES (?,?,?,?,?)",
      [randomUUID(), caseId, type, JSON.stringify(details), now]);
  }
  async function insertCase(input) {
    const record = await write((tx) => insertCaseRows(tx, input));
    return getCase(record.id);
  }
  async function backfillPayments(tx) {
    const missing = await rows(tx, "SELECT * FROM cases WHERE id NOT IN (SELECT id FROM payments)");
    if (missing.length) await tx.batch(missing.map((row) => {
      const recommendation = { route: row.route, aiRoute: row.route, confidence: 0.55, rationale: row.evidence_summary,
        provider: "policy_fallback", policyFloor: row.route, hardStops: parseJson(row.hard_stops_json, []) };
      return {
        sql: "INSERT OR IGNORE INTO payments (id,payment_reference,payer_name,payee_name,beneficiary_account,bank_country,purpose,amount,currency,rail,payment_status,route,case_id,recommendation_json,workflow_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [row.id, row.payment_reference, row.customer_name, "Supplier / beneficiary", "", "", row.customer_enquiry,
          row.amount, row.currency, row.rail, row.payment_status, row.route, row.id, JSON.stringify(recommendation),
          row.review_status, row.created_at, row.updated_at],
      };
    }));
  }
  async function seedCases(cases) {
    return write(async (tx) => {
      const existing = (await one(tx, "SELECT COUNT(*) AS n FROM cases")).n;
      if (existing > 0) {
        await backfillPayments(tx);
        return { inserted: 0, existing };
      }
      // Collect the whole synthetic seed before sending it as one transaction batch.
      // Hosted libSQL transactions have a short interactive timeout.
      const statements = [];
      const collector = { execute: async (statement) => {
        statements.push(statement);
        return { rows: [] };
      } };
      for (const item of cases) await insertCaseRows(collector, item);
      if (statements.length) await tx.batch(statements);
      await backfillPayments(tx);
      return { inserted: cases.length, existing: cases.length };
    });
  }
  async function createPayment(input, recommendation = {}) {
    const record = await write(async (tx) => {
      const created = await insertCaseRows(tx, input);
      const route = recommendation.route || created.triage.route;
      await run(tx, paymentInsertSql,
        [created.id, created.paymentReference, input.customerName, input.payeeName || "Supplier / beneficiary",
          input.beneficiaryAccount || "", input.bankCountry || "", input.purpose || input.customerEnquiry,
          input.amount, input.currency, input.rail, input.paymentStatus, route, created.id, JSON.stringify(recommendation),
          created.reviewStatus, created.now, created.now]);
      await run(tx, "UPDATE cases SET route = ? WHERE id = ?", [route, created.id]);
      return created;
    });
    return getPayment(record.id);
  }
  function mapPayment(row, record) {
    return { id: row.id, paymentReference: row.payment_reference, customerName: row.payer_name, payerName: row.payer_name,
      payeeName: row.payee_name, beneficiaryAccount: row.beneficiary_account, bankCountry: row.bank_country,
      purpose: row.purpose, amount: row.amount, currency: row.currency, rail: row.rail,
      paymentStatus: row.payment_status, route: row.route, workflowStatus: row.workflow_status,
      recommendation: parseJson(row.recommendation_json, {}), createdAt: row.created_at, updatedAt: row.updated_at,
      case: record, events: record?.events || [], analyses: record?.analyses || [],
      messages: record?.drafts || [], audit: record?.audit || [] };
  }
  async function getPayment(id) {
    const row = await one(db, "SELECT * FROM payments WHERE id=?", [id]);
    return row ? mapPayment(row, await getCase(row.case_id)) : null;
  }

  async function hydrateCasePage(caseRows, includeHistory = true) {
    if (!caseRows.length) return [];
    const ids = caseRows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    const groups = (records, mapRecord) => {
      const byCase = new Map();
      for (const record of records) {
        if (!byCase.has(record.case_id)) byCase.set(record.case_id, []);
        byCase.get(record.case_id).push(mapRecord(record));
      }
      return byCase;
    };
    const events = groups(
      await rows(db, "SELECT * FROM case_events WHERE case_id IN (" + placeholders + ") ORDER BY case_id, occurred_at, rowid", ids),
      (event) => ({ id: event.id, occurredAt: event.occurred_at, title: event.title,
        detail: event.detail, verified: Boolean(event.verified) }),
    );
    let analyses = new Map(), drafts = new Map(), audit = new Map();
    if (includeHistory) {
      analyses = groups(
        await rows(db, "SELECT * FROM analyses WHERE case_id IN (" + placeholders + ") ORDER BY case_id, created_at DESC", ids),
        (item) => ({ id: item.id, provider: item.provider, model: parseJson(item.model_json, {}),
          triage: parseJson(item.triage_json, {}), createdAt: item.created_at }),
      );
      drafts = groups(
        await rows(db, "SELECT * FROM customer_drafts WHERE case_id IN (" + placeholders + ") ORDER BY case_id, created_at DESC", ids),
        (item) => ({ id: item.id, message: item.message, status: item.status,
          sent: item.status === "sent", createdAt: item.created_at }),
      );
      audit = groups(
        await rows(db, "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY created_at DESC) AS history_rank FROM audit_events WHERE case_id IN (" + placeholders + ")) WHERE history_rank <= 30 ORDER BY case_id, created_at DESC", ids),
        (item) => ({ id: item.id, type: item.event_type, details: parseJson(item.details_json, {}),
          createdAt: item.created_at }),
      );
    }
    return caseRows.map((row) => mapCase(row, events.get(row.id) || [], analyses.get(row.id) || [],
      drafts.get(row.id) || [], audit.get(row.id) || []));
  }
  async function listPayments({ route, status, query, limit = 100, offset = 0 } = {}) {
    const where = [], params = [];
    if (route && route !== "all") { where.push("p.route=?"); params.push(route); }
    if (status && status !== "all") {
      if (status === "pending") where.push("p.payment_status IN ('unknown','processing')");
      else { where.push("p.payment_status=?"); params.push(status); }
    }
    if (query) {
      where.push("(p.payer_name LIKE ? OR p.payee_name LIKE ? OR p.payment_reference LIKE ?)");
      const q = "%" + query + "%";
      params.push(q, q, q);
    }
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = (await one(db, "SELECT COUNT(*) AS n FROM payments p " + clause, params)).n;
    const selected = await rows(db, "SELECT p.* FROM payments p " + clause + " ORDER BY p.created_at DESC LIMIT ? OFFSET ?", [...params, limit, offset]);
    if (!selected.length) return { items: [], total, limit, offset };
    const caseIds = [...new Set(selected.map((row) => row.case_id).filter(Boolean))];
    const caseRows = caseIds.length
      ? await rows(db, "SELECT * FROM cases WHERE id IN (" + caseIds.map(() => "?").join(",") + ")", caseIds)
      : [];
    const cases = new Map((await hydrateCasePage(caseRows)).map((record) => [record.id, record]));
    return { items: selected.map((row) => mapPayment(row, cases.get(row.case_id) || null)), total, limit, offset };
  }
  async function saveMessage(paymentId, message) {
    const p = await getPayment(paymentId);
    if (!p) return null;
    const now = new Date().toISOString(), id = randomUUID();
    await write(async (tx) => {
      await run(tx, "INSERT INTO customer_drafts (id, case_id, message, status, created_at) VALUES (?, ?, ?, 'draft_only', ?)", [id, p.case.id, message, now]);
      await auditEvent(tx, p.case.id, "customer_draft_created", { sent: false }, now);
      await run(tx, "UPDATE customer_drafts SET status='sent' WHERE id=?", [id]);
      await auditEvent(tx, p.case.id, "customer_message_sent", { messageId: id, channel: "SMS" }, now);
      await run(tx, "UPDATE payments SET workflow_status='awaiting_customer',updated_at=? WHERE id=?", [now, paymentId]);
    });
    return { id, caseId: p.case.id, message, status: "sent", sent: true, createdAt: now };
  }
  async function decidePayment(paymentId, decision, note = "", overrideReason = "", overrideRoute = "") {
    const p = await getPayment(paymentId);
    if (!p) return null;
    if (decision === "override" && !String(overrideReason).trim()) throw new Error("An override reason is required.");
    if (decision === "override" && p.case?.triage?.hardStops?.length) throw new Error("Safety hard stops cannot be overridden.");
    if (decision === "override" && !["routine", "human_review", "escalate"].includes(overrideRoute)) throw new Error("Select a valid route for the override.");
    if (decision === "close" && p.case?.triage?.hardStops?.length) throw new Error("A payment with an active safety stop cannot be closed.");
    const outcomes = { accept: "reviewed", request_information: "awaiting_information", escalate: "escalated", close: "closed" };
    if (!outcomes[decision] && decision !== "override") throw new Error("Invalid decision.");
    const status = decision === "override" ? "reviewed" : outcomes[decision];
    const route = decision === "override" ? overrideRoute : p.route;
    const now = new Date().toISOString();
    await write(async (tx) => {
      await run(tx, "UPDATE cases SET review_status=?,updated_at=? WHERE id=?", [status, now, p.case.id]);
      await run(tx, "UPDATE payments SET workflow_status=?,route=CASE WHEN ?='override' THEN ? ELSE route END,updated_at=? WHERE id=?", [status, decision, route, now, paymentId]);
      if (decision === "override") await run(tx, "UPDATE cases SET route=? WHERE id=?", [route, p.case.id]);
      await auditEvent(tx, p.case.id, "operator_decision",
        { decision, note, overrideReason, overrideRoute: decision === "override" ? overrideRoute : undefined, previousRoute: p.route }, now);
    });
    return getPayment(paymentId);
  }
  async function verifyPayment(paymentId) {
    const p = await getPayment(paymentId);
    if (!p) return null;
    const issues = [];
    if (!p.paymentReference || !p.case) issues.push("Payment or linked investigation record is missing.");
    if (p.case?.triage?.hardStops?.length && p.workflowStatus === "closed") issues.push("A case with an active safety stop cannot be closed.");
    const actionRecorded = ["reviewed", "closed", "escalated", "awaiting_information"].includes(p.workflowStatus);
    const resolved = p.workflowStatus === "closed" && issues.length === 0;
    if (!resolved && !issues.length) issues.push("The case remains open and requires another step.");
    await auditEvent(db, p.case.id, "outcome_verification", { verified: resolved, actionRecorded, issues });
    return { verified: resolved, resolved, actionRecorded, issues, payment: await getPayment(paymentId) };
  }
  async function listCases({ route, query, status, limit = 50, offset = 0 } = {}) {
    const where = [], params = [];
    if (route && route !== "all") { where.push("route = ?"); params.push(route); }
    if (status && status !== "all") { where.push("payment_status = ?"); params.push(status); }
    if (query) {
      where.push("(customer_name LIKE ? OR payment_reference LIKE ? OR exception_type LIKE ? OR customer_enquiry LIKE ?)");
      const term = "%" + query + "%";
      params.push(term, term, term, term);
    }
    const clause = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = (await one(db, "SELECT COUNT(*) AS n FROM cases " + clause, params)).n;
    const selected = await rows(db, "SELECT * FROM cases " + clause + " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?", [...params, limit, offset]);
    return { items: await hydrateCasePage(selected, false), total, limit, offset };
  }
  async function countCases() {
    return (await one(db, "SELECT COUNT(*) AS n FROM cases")).n;
  }
  async function metrics() {
    const routes = Object.fromEntries((await rows(db, "SELECT route, COUNT(*) AS n FROM cases GROUP BY route")).map((row) => [row.route, row.n]));
    const total = await countCases();
    const pendingReview = (await one(db, "SELECT COUNT(*) AS n FROM cases WHERE review_status = 'pending'")).n;
    const analyzed = (await one(db, "SELECT COUNT(DISTINCT case_id) AS n FROM analyses")).n;
    return { total, routes, pendingReview, analyzed, syntheticOnly: true };
  }
  async function saveAnalysis(caseId, provider, model, triage) {
    const now = new Date().toISOString(), id = randomUUID();
    await write(async (tx) => {
      await run(tx, "INSERT INTO analyses (id, case_id, provider, model_json, triage_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, caseId, provider, JSON.stringify(model), JSON.stringify(triage), now]);
      await auditEvent(tx, caseId, "analysis_created", { provider, route: triage.route, score: triage.total }, now);
    });
    return { id, provider, model, triage, createdAt: now };
  }
  async function saveDraft(caseId, message) {
    const now = new Date().toISOString(), id = randomUUID();
    await write(async (tx) => {
      await run(tx, "INSERT INTO customer_drafts (id, case_id, message, status, created_at) VALUES (?, ?, ?, 'draft_only', ?)", [id, caseId, message, now]);
      await auditEvent(tx, caseId, "customer_draft_created", { sent: false }, now);
    });
    return { id, caseId, message, status: "draft_only", sent: false, createdAt: now };
  }
  async function reviewCase(caseId, outcome, note = "") {
    const status = { mark_reviewed: "reviewed", escalate: "escalated", request_information: "awaiting_information" }[outcome];
    if (!status) throw new Error("Invalid review outcome");
    const now = new Date().toISOString();
    await write(async (tx) => {
      await run(tx, "UPDATE cases SET review_status = ?, updated_at = ? WHERE id = ?", [status, now, caseId]);
      await auditEvent(tx, caseId, "human_review", { outcome, note }, now);
    });
    return getCase(caseId);
  }
  async function updateRecommendation(paymentId, recommendation) {
    const p = await getPayment(paymentId);
    if (!p) return null;
    await write(async (tx) => {
      await run(tx, "UPDATE payments SET route=?,recommendation_json=?,updated_at=? WHERE id=?",
        [recommendation.route, JSON.stringify(recommendation), new Date().toISOString(), paymentId]);
      await run(tx, "UPDATE cases SET route=?,review_status=CASE WHEN ?='routine' THEN review_status ELSE 'pending' END WHERE id=?",
        [recommendation.route, recommendation.route, p.case.id]);
      await run(tx, "UPDATE payments SET workflow_status=CASE WHEN ?='routine' THEN workflow_status ELSE 'pending' END WHERE id=?",
        [recommendation.route, paymentId]);
      await auditEvent(tx, p.case.id, "ai_route_recommendation", recommendation);
    });
    return getPayment(paymentId);
  }
  return {
    seedCases, insertCase, getCase, listCases, countCases, metrics,
    saveAnalysis, saveDraft, reviewCase, createPayment, getPayment, listPayments,
    saveMessage, decidePayment, verifyPayment, updateRecommendation,
    close: async () => { db.close(); },
  };
}
