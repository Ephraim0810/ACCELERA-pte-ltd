import { createClient } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { computeTriage } from "./policy.mjs";
import { createWorkflow, transitionWorkflow, paymentSnapshot } from "./workflow.mjs";
import { evidenceRecords, clearMatch, challengeEvidence } from "./evidence.mjs";

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
    CREATE TABLE IF NOT EXISTS payment_workflows (payment_id TEXT PRIMARY KEY REFERENCES payments(id), state_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_requests (id TEXT PRIMARY KEY,payment_id TEXT NOT NULL REFERENCES payments(id),recipient TEXT NOT NULL,status TEXT NOT NULL,required_json TEXT NOT NULL,token_hash TEXT NOT NULL,binding_hash TEXT NOT NULL,accepted_hash TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_responses (id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES recovery_requests(id),payload_json TEXT NOT NULL,validation_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS benchmark_runs (id TEXT PRIMARY KEY,data_json TEXT NOT NULL,created_at TEXT NOT NULL);
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
  let writeQueue=Promise.resolve();
  async function write(operation) {
    const previous=writeQueue;let release;
    writeQueue=new Promise(resolve=>{release=resolve;});
    await previous;
    let tx;
    try {
      tx=await db.transaction("write");
      const result=await operation(tx);
      await tx.commit();
      return result;
    } catch(error) {
      if(tx)try{await tx.rollback();}catch{}
      throw error;
    } finally {
      if(tx)tx.close();
      release();
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
      const workflow = createWorkflow({id:created.id,...input,case:{...input}}, input.demoScenario);
      if(input.benchmark)workflow.isBenchmark=true;
      await run(tx, "INSERT INTO payment_workflows (payment_id,state_json) VALUES (?,?)", [created.id,JSON.stringify(workflow)]);
      return created;
    });
    return getPayment(record.id);
  }
  function mapPayment(row, record, workflow = null) {
    return { id: row.id, paymentReference: row.payment_reference, customerName: row.payer_name, payerName: row.payer_name,
      payeeName: row.payee_name, beneficiaryAccount: row.beneficiary_account, bankCountry: row.bank_country,
      purpose: row.purpose, amount: row.amount, currency: row.currency, rail: row.rail,
      paymentStatus: row.payment_status, route: row.route, workflowStatus: row.workflow_status,
      recommendation: parseJson(row.recommendation_json, {}), createdAt: row.created_at, updatedAt: row.updated_at,
      workflow, case: record, events: record?.events || [], analyses: record?.analyses || [],
      messages: record?.drafts || [], audit: record?.audit || [] };
  }
  async function getPayment(id) {
    const row = await one(db, "SELECT * FROM payments WHERE id=?", [id]);
    const stored = row ? await one(db, "SELECT state_json FROM payment_workflows WHERE payment_id=?", [id]) : null;
    return row ? mapPayment(row, await getCase(row.case_id), stored ? parseJson(stored.state_json, null) : null) : null;
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
  async function listPayments({ route, status, query, guided = false, limit = 100, offset = 0 } = {}) {
    const where = [], params = [];
    if (guided) where.push("EXISTS (SELECT 1 FROM payment_workflows wf WHERE wf.payment_id=p.id AND COALESCE(json_extract(wf.state_json,'$.isBenchmark'),0)=0)");
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
    const selected = await rows(db, "SELECT p.*,w.state_json AS workflow_json FROM payments p LEFT JOIN payment_workflows w ON w.payment_id=p.id " + clause + " ORDER BY p.created_at DESC LIMIT ? OFFSET ?", [...params, limit, offset]);
    if (!selected.length) return { items: [], total, limit, offset };
    const caseIds = [...new Set(selected.map((row) => row.case_id).filter(Boolean))];
    const caseRows = caseIds.length
      ? await rows(db, "SELECT * FROM cases WHERE id IN (" + caseIds.map(() => "?").join(",") + ")", caseIds)
      : [];
    const cases = new Map((await hydrateCasePage(caseRows)).map((record) => [record.id, record]));
    return { items: selected.map((row) => mapPayment(row, cases.get(row.case_id) || null, parseJson(row.workflow_json, null))), total, limit, offset };
  }
  async function saveMessage(paymentId, message) {
    const p = await getPayment(paymentId);
    if (!p) return null;
    const now = new Date().toISOString(), id = randomUUID();
    await write(async (tx) => {
      await run(tx, "INSERT INTO customer_drafts (id, case_id, message, status, created_at) VALUES (?, ?, ?, 'draft_only', ?)", [id, p.case.id, message, now]);
      await auditEvent(tx, p.case.id, "customer_draft_created", { sent: false }, now);
      await auditEvent(tx, p.case.id, "customer_draft_saved", { messageId: id, sent: false }, now);
      await run(tx, "UPDATE payments SET workflow_status='awaiting_customer',updated_at=? WHERE id=?", [now, paymentId]);
    });
    return { id, caseId: p.case.id, message, status: "draft_only", sent: false, createdAt: now };
  }
  async function decidePayment(paymentId, decision, note = "", overrideReason = "", overrideRoute = "") {
    const p = await getPayment(paymentId);
    if (!p) return null;
    if (decision === "override" && !String(overrideReason).trim()) throw new Error("An override reason is required.");
    if (decision === "override" && p.case?.triage?.hardStops?.length) throw new Error("Safety hard stops cannot be overridden.");
    if (decision === "override" && !["routine", "human_review", "escalate"].includes(overrideRoute)) throw new Error("Select a valid route for the override.");
    if (decision === "close" && p.case?.triage?.hardStops?.length) throw new Error("A payment with an active safety stop cannot be closed.");
    if (decision === "close" && p.workflow?.status !== "verified") throw new Error("Read-back verification is required before closure.");
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
    const p=await getPayment(paymentId);
    if(!p)return null;
    if(p.workflow?.status==="executed"){
      const result=await applyWorkflow(paymentId,"verify");
      return {verified:result.workflow.status==="verified",resolved:result.workflow.status==="verified",actionRecorded:true,issues:result.workflow.status==="verified"?[]:["The saved outcome did not pass verification."],payment:result};
    }
    const verified=p.workflow?.status==="verified"&&p.workflow.verification?.verified===true;
    const issues=verified?[]:["The case remains open. A permitted action and read-back verification are required."];
    await auditEvent(db,p.case.id,"outcome_verification",{verified,actionRecorded:["reviewed","closed","escalated","awaiting_information"].includes(p.workflowStatus),issues});
    return {verified,resolved:verified,actionRecorded:["reviewed","closed","escalated","awaiting_information"].includes(p.workflowStatus),issues,payment:await getPayment(paymentId)};
  }
  async function applyWorkflow(paymentId,action,details={}) {
    let blocked;
    await write(async tx=>{
      const row=await one(tx,"SELECT * FROM payments WHERE id=?",[paymentId]);
      const saved=await one(tx,"SELECT state_json FROM payment_workflows WHERE payment_id=?",[paymentId]);
      if(!row||!saved)throw Object.assign(new Error("No guided workflow exists for this payment."),{status:404});
      const current=parseJson(saved.state_json,null),record=mapPayment(row,null,current);
      let updated;
      try{updated=transitionWorkflow(current,record,action,details);}
      catch(error){
        if(!error.status)throw error;
        blocked=error;updated=structuredClone(current);updated.version++;updated.updatedAt=new Date().toISOString();
        updated.events.push({id:randomUUID(),type:"action_blocked",actor:"System",at:updated.updatedAt,message:error.message,requestedAction:action});
      }
      if(action==="approve"&&updated.approval){updated.approval.actorPrincipal=details.actor?.user||"Reviewer";updated.approval.authorisationRole=details.actor?.role||"system";}
      for(const e of updated.events.slice(current.events.length)){e.actorPrincipal=details.actor?.user||e.actor;e.authorisationRole=details.actor?.role||"system";e.previousStatus=current.status;e.resultingStatus=updated.status;}
      await run(tx,"UPDATE payment_workflows SET state_json=? WHERE payment_id=?",[JSON.stringify(updated),paymentId]);
      const status={verified:"closed",executed:"verification_pending",verification_failed:"verification_failed",waiting:"awaiting_information",manual:"escalated",review:"pending",ready:"ready",detected:"pending",not_required:"not_required"}[updated.status];
      await run(tx,"UPDATE payments SET workflow_status=?,updated_at=? WHERE id=?",[status,updated.updatedAt,paymentId]);
      await run(tx,"UPDATE cases SET review_status=?,updated_at=? WHERE id=?",[status,updated.updatedAt,row.case_id]);
      const last=updated.events.at(-1);await auditEvent(tx,row.case_id,"workflow_"+last.type,{actor:last.actor,principal:last.actorPrincipal,message:last.message,previousStatus:current.status,resultingStatus:updated.status,workflowVersion:updated.version},updated.updatedAt);
    });
    if(blocked)throw blocked;
    return getPayment(paymentId);
  }
  async function workflowMetrics() {
    const states=(await rows(db,"SELECT state_json FROM payment_workflows")).map(r=>parseJson(r.state_json,null)).filter(s=>s&&!s.isBenchmark);
    const exceptions=states.filter(s=>s.investigationRequired), verified=exceptions.filter(s=>s.status==="verified");
    const durations=verified.map(s=>(Date.parse(s.verification.at)-Date.parse(s.createdAt))/1000);
    return {syntheticOnly:true,riskRestricted:states.filter(s=>(s.source.riskIndicators||[]).some(r=>r.active)).length,recoveryOpen:states.filter(s=>s.scenario==="recovery"&&!s.source.confirmation).length,total:states.length,exceptions:exceptions.length,routine:states.filter(s=>s.status==="not_required").length,
      verified:verified.length,waiting:exceptions.filter(s=>s.status==="waiting").length,human:exceptions.filter(s=>["manual","review","verification_failed"].includes(s.status)).length,
      falseAcknowledgementsCaught:states.filter(s=>s.events.some(e=>e.type==="verification_failed")).length,
      duplicateWritesPrevented:states.reduce((n,s)=>n+s.events.filter(e=>["duplicate_prevented","already_applied"].includes(e.type)).length,0),
      averageObservedResolutionSeconds:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,
      modelInvestigations:states.filter(s=>s.analysisMode==="live_ai").length,offlineInvestigations:states.filter(s=>s.analysisMode==="offline_walkthrough").length,
      actions:states.reduce((n,s)=>n+s.attempts.filter(a=>a.status!=="unknown").length,0),
      events:states.flatMap(s=>s.events.map(e=>({...e,reference:s.protected.reference,scenario:s.scenario}))).sort((a,b)=>b.at.localeCompare(a.at))};
  }

  const tokenDigest=value=>createHash("sha256").update(String(value)).digest("hex");
  async function recoveryRequests(paymentId){
    const found=await rows(db,"SELECT * FROM recovery_requests WHERE payment_id=? ORDER BY created_at",[paymentId]);
    return Promise.all(found.map(async row=>({id:row.id,paymentId:row.payment_id,recipient:row.recipient,status:row.status,requiredFields:parseJson(row.required_json),createdAt:row.created_at,expiresAt:row.expires_at,
      responses:(await rows(db,"SELECT * FROM recovery_responses WHERE request_id=? ORDER BY created_at",[row.id])).map(x=>({id:x.id,payload:parseJson(x.payload_json,{}),validation:parseJson(x.validation_json,{}),createdAt:x.created_at}))})));
  }
  async function createRecoveryRequest(paymentId,actor={},ttlMs=900000){
    const p=await getPayment(paymentId),w=p?.workflow;
    if(!w||w.scenario!=="recovery"||w.status!=="waiting"||w.source.confirmation)throw Object.assign(new Error("This case is not waiting for a processor confirmation."),{status:409});
    const secret=randomBytes(32).toString("base64url"),now=new Date().toISOString(),expires=new Date(Date.now()+Math.max(1000,Math.min(86400000,ttlMs))).toISOString();
    let id;
    await write(async tx=>{
      const active=await one(tx,"SELECT * FROM recovery_requests WHERE payment_id=? AND status='awaiting_response' ORDER BY created_at DESC LIMIT 1",[paymentId]);
      id=active?.id||randomUUID();
      const required=["reference","amountMinor","currency","beneficiaryAccount","finalStatus","processorRecordId"];
      if(active)await run(tx,"UPDATE recovery_requests SET token_hash=?,expires_at=? WHERE id=?",[tokenDigest(secret),expires,id]);
      else await run(tx,"INSERT INTO recovery_requests (id,payment_id,recipient,status,required_json,token_hash,binding_hash,created_at,expires_at) VALUES (?,?,?,'awaiting_response',?,?,?,?,?)",
        [id,paymentId,"Mock processor operations desk",JSON.stringify(required),tokenDigest(secret),tokenDigest(JSON.stringify(w.protected)),now,expires]);
      const current=await one(tx,"SELECT state_json FROM payment_workflows WHERE payment_id=?",[paymentId]),state=parseJson(current.state_json,null);
      state.version++;state.updatedAt=now;state.events.push({id:randomUUID(),type:"recovery_request_created",actor:"Agent",actorPrincipal:actor.user||"operator",authorisationRole:actor.role||"administrator",at:now,previousStatus:state.status,resultingStatus:state.status,message:"A processor-confirmation request was saved for the intended mock processor desk. The scoped portal link is a local delivery simulation; no notification was sent.",requestId:id});
      await run(tx,"UPDATE payment_workflows SET state_json=? WHERE payment_id=?",[JSON.stringify(state),paymentId]);
      await auditEvent(tx,p.case.id,"recovery_request_created",{requestId:id,recipient:"Mock processor operations desk",actor:actor.user||"operator"},now);
    });
    const request=(await recoveryRequests(paymentId)).find(r=>r.id===id);
    return {request,portalUrl:"/request?id="+encodeURIComponent(id)+"#token="+encodeURIComponent(secret)};
  }
  async function portalRequest(id,secret){
    const r=await one(db,"SELECT * FROM recovery_requests WHERE id=?",[id]);
    if(!r||!secret||tokenDigest(secret)!==r.token_hash)throw Object.assign(new Error("This request link is not authorised."),{status:403});
    if(Date.parse(r.expires_at)<=Date.now())throw Object.assign(new Error("This request link has expired. Ask operations to issue a new link."),{status:410});
    const payment=await getPayment(r.payment_id),request=(await recoveryRequests(r.payment_id)).find(q=>q.id===id);
    return {request,sourceRecord:structuredClone(payment.workflow.source.processorReceipt),authorisation:{scope:"This information request only",recipient:r.recipient,expiresAt:r.expires_at}};
  }
  async function answerRecovery(id,secret,payload){
    let outcome;
    await write(async tx=>{
      const r=await one(tx,"SELECT * FROM recovery_requests WHERE id=?",[id]);
      if(!r||!secret||tokenDigest(secret)!==r.token_hash)throw Object.assign(new Error("This request link is not authorised."),{status:403});
      if(Date.parse(r.expires_at)<=Date.now())throw Object.assign(new Error("This request link has expired."),{status:410});
      const acceptedHash=tokenDigest(JSON.stringify(payload));
      if(r.status!=="awaiting_response"){
        if(r.accepted_hash===acceptedHash){outcome={valid:true,idempotent:true,paymentId:r.payment_id};return;}
        throw Object.assign(new Error("This request already has an accepted response; a different response cannot replace it."),{status:409});
      }
      const prow=await one(tx,"SELECT * FROM payments WHERE id=?",[r.payment_id]);
      const saved=await one(tx,"SELECT state_json FROM payment_workflows WHERE payment_id=?",[r.payment_id]),w=parseJson(saved.state_json,null),p=mapPayment(prow,null,w),receipt=w.source.processorReceipt;
      const fields=[
        ["reference",payload?.reference===receipt.reference],
        ["amountMinor",Number.isSafeInteger(payload?.amountMinor)&&payload.amountMinor===receipt.amountMinor],
        ["currency",payload?.currency===receipt.currency],
        ["beneficiaryAccount",payload?.beneficiaryAccount===receipt.beneficiary],
        ["finalStatus",payload?.finalStatus==="confirmed"&&receipt.finalStatus==="confirmed"],
        ["processorRecordId",payload?.processorRecordId===receipt.id],
        ["original instruction",r.binding_hash===tokenDigest(JSON.stringify(w.protected))&&JSON.stringify(w.protected)===JSON.stringify(paymentSnapshot(p))]
      ];
      const validation={valid:fields.every(([,pass])=>pass),checks:fields.map(([field,pass])=>({field,pass,reason:pass?"Matches the saved authoritative mock record.":"Missing or different from the saved mock record."})),evidenceIds:[receipt.id,"PAY-"+p.id],at:new Date().toISOString()};
      const safePayload=Object.fromEntries(["reference","amountMinor","currency","beneficiaryAccount","finalStatus","processorRecordId"].map(k=>[k,payload?.[k]??null]));
      await run(tx,"INSERT INTO recovery_responses (id,request_id,payload_json,validation_json,created_at) VALUES (?,?,?,?,?)",[randomUUID(),id,JSON.stringify(safePayload),JSON.stringify(validation),validation.at]);
      let updated;
      if(validation.valid){
        updated=transitionWorkflow(w,p,"accept_recovery",{record:{...receipt,description:"Matching processor receipt supplied through the authorised request portal.",authoritative:true},actor:{user:r.recipient,role:"information_provider"}});
        await run(tx,"UPDATE recovery_requests SET status='validated',accepted_hash=? WHERE id=?",[acceptedHash,id]);
      }else{
        updated=structuredClone(w);updated.version++;updated.updatedAt=validation.at;
        updated.events.push({id:randomUUID(),type:"recovery_response_rejected",actor:"Information provider",actorPrincipal:r.recipient,at:validation.at,previousStatus:w.status,resultingStatus:w.status,message:"The response did not match the requested processor evidence. Failed fields: "+fields.filter(([,pass])=>!pass).map(([field])=>field).join(", ")+". No action was authorised.",requestId:id});
      }
      await run(tx,"UPDATE payment_workflows SET state_json=? WHERE payment_id=?",[JSON.stringify(updated),p.id]);
      if(validation.valid){await run(tx,"UPDATE payments SET workflow_status='pending',updated_at=? WHERE id=?",[validation.at,p.id]);await run(tx,"UPDATE cases SET review_status='pending',updated_at=? WHERE id=?",[validation.at,prow.case_id]);}
      await auditEvent(tx,prow.case_id,validation.valid?"recovery_response_validated":"recovery_response_rejected",{requestId:id,validation},validation.at);
      outcome={valid:validation.valid,validation,paymentId:p.id,idempotent:false};
    });
    const p=await getPayment(outcome.paymentId);
    return {...outcome,request:(await recoveryRequests(p.id)).find(r=>r.id===id),workflow:p.workflow,payment:p};
  }
  async function relatedPayments(p){
    const matches=await rows(db,"SELECT * FROM payments WHERE id<>? AND (payer_name=? OR (beneficiary_account<>'' AND beneficiary_account=?)) ORDER BY created_at DESC LIMIT 8",[p.id,p.payerName,p.beneficiaryAccount]);
    return matches.map(r=>mapPayment(r,null));
  }
  async function insight(paymentId){
    const p=await getPayment(paymentId);if(!p?.workflow)return null;
    const w=p.workflow,requests=await recoveryRequests(p.id),related=await relatedPayments(p);
    return {payment:p,evidence:evidenceRecords(w,p),clearMatch:clearMatch(w,p,related),challenger:challengeEvidence(w,p),recoveryRequests:requests};
  }
  async function passport(paymentId){
    const data=await insight(paymentId);if(!data)return null;
    const {payment:p,evidence,clearMatch:matching,challenger,recoveryRequests:requests}=data,w=p.workflow;
    const pass={schemaVersion:2,case:{id:p.id,reference:p.paymentReference,title:w.title,scenario:w.scenario,openedAt:w.createdAt,originalInstruction:paymentSnapshot(p)},investigation:{mode:w.analysisMode,summary:w.analysis?.summary||"Investigation has not run.",hypotheses:w.analysis?.hypotheses||[],claims:w.analysis?.claims||[]},evidence,clearMatch:matching,challenger,recoveryRequests:requests,proposedAction:w.proposal,safetySimulation:w.simulation||null,approvals:w.approval?[w.approval]:[],reviewerDecisions:w.reviewDecisions||[],execution:w.attempts,postExecutionVerification:w.verification,outcome:{status:w.status,question:w.question,fundsMoved:false},audit:[...w.events].sort((a,b)=>a.at.localeCompare(b.at)),scope:"Synthetic internal records only; this is not independent external-bank confirmation."};
    return {...pass,checksum:tokenDigest(JSON.stringify(pass)),generatedAt:new Date().toISOString()};
  }
  async function saveBenchmark(data){await run(db,"INSERT INTO benchmark_runs (id,data_json,created_at) VALUES (?,?,?)",[data.id,JSON.stringify(data),data.createdAt]);return data;}
  async function benchmarks(){return {items:(await rows(db,"SELECT data_json FROM benchmark_runs ORDER BY created_at DESC LIMIT 20")).map(r=>parseJson(r.data_json,{}))};}

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
    saveMessage, decidePayment, verifyPayment, updateRecommendation, applyWorkflow, workflowMetrics,
    recoveryRequests,createRecoveryRequest,portalRequest,answerRecovery,insight,passport,saveBenchmark,benchmarks,
    close: async () => { db.close(); },
  };
}
