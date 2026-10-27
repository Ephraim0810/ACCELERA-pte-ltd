import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./db.mjs";
import { generateSyntheticCases, exceptionTypes } from "./seed.mjs";
import { computeTriage, recommendRoute } from "./policy.mjs";
import { analyzeCase, fallbackAnalysisForCase, makeCustomerDraft, validateCaseInput } from "./ai.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const MAX_BODY_BYTES = 200_000;

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Admin-Token" });
  response.end(JSON.stringify(data));
}
async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  }
  try { return JSON.parse(body || "{}"); } catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}
function secureHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
}
export function resolvePageAsset(pathname) {
  const files = { "/": "login.html", "/payment": "payment.html", "/payment.html": "payment.html", "/login": "login.html", "/transactions": "transactions.html", "/admin": "admin.html", "/styles.css": "styles.css", "/app.js": "app.js", "/payment.js": "payment.js", "/login.js": "login.js", "/admin.js": "admin.js", "/management.js": "management.js" };
  return files[pathname] || null;
}
async function serveAsset(pathname, response) {
  const file = resolvePageAsset(pathname);
  if (!file) return false;
  try {
    response.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    response.end(await readFile(resolve(PUBLIC, file)));
    return true;
  } catch { return false; }
}
export function loadEnvironmentFile(path = resolve(ROOT, ".env"), target = process.env) {
  let source; try { source = readFileSync(path, "utf8"); } catch { return target; }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith("#") || Object.hasOwn(target, match[1])) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    target[match[1]] = value;
  }
  return target;
}

function openApiDocument() {
  const ok = { description: "Request completed." };
  const bad = { description: "Invalid request or not found." };
  const caseInput = {
    type: "object",
    required: ["customerName", "amount", "currency", "rail", "paymentStatus", "exceptionType", "customerEnquiry", "evidenceSummary", "evidenceQuality", "potentialImpact", "identityConcern", "retryRequested", "authoritativeConflict"],
    properties: {
      customerName: { type: "string", minLength: 2, maxLength: 600 },
      paymentReference: { type: "string", minLength: 2, maxLength: 40 },
      amount: { type: "number", exclusiveMinimum: 0, maximum: 100000000 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      rail: { type: "string", minLength: 2, maxLength: 600 },
      paymentStatus: { type: "string", enum: ["confirmed", "processing", "rejected", "unknown"] },
      exceptionType: { type: "string", enum: exceptionTypes },
      customerEnquiry: { type: "string", minLength: 2, maxLength: 600 },
      evidenceSummary: { type: "string", minLength: 2, maxLength: 600 },
      evidenceQuality: { type: "string", enum: ["complete", "partial", "conflicting", "missing"] },
      potentialImpact: { type: "string", enum: ["information_only", "reversible_update", "payment_change"] },
      identityConcern: { type: "string", enum: ["none", "needs_check", "suspected_unauthorized"] },
      retryRequested: { type: "boolean" },
      authoritativeConflict: { type: "boolean" },
      events: { type: "array", maxItems: 20, items: { type: "object", required: ["title", "detail"], properties: { title: { type: "string", maxLength: 120 }, detail: { type: "string", maxLength: 600 }, verified: { type: "boolean" }, occurredAt: { type: "string", format: "date-time" } } } },
    },
  };
  const paymentSubmission = { type: "object", required: ["customerName","payeeName","beneficiaryAccount","bankCountry","paymentReference","amount","currency","rail","purpose"], properties: { customerName: {type:"string",minLength:2,maxLength:120}, payeeName:{type:"string",minLength:2,maxLength:120}, beneficiaryAccount:{type:"string",pattern:"^[0-9]{8,18}$"}, bankCountry:{type:"string",minLength:2,maxLength:120}, paymentReference:{type:"string",minLength:2,maxLength:40}, amount:{type:"number",exclusiveMinimum:0,maximum:100000000}, currency:{type:"string",pattern:"^[A-Z]{3}$"}, rail:{type:"string",enum:["GIRO","FAST","MEPS","SWIFT"]}, purpose:{type:"string",minLength:2,maxLength:120} } };
  return {
    openapi: "3.1.0",
    info: { title: "CasePilot Synthetic Payment Exception API", version: "1.0.0", description: "Synthetic-only demo API. No live banking or customer actions." },
    servers: [{ url: "/" }],
    paths: {
      "/api/demo/login": { post: { summary: "Sign in to the operations workspace", responses: { "200": ok, "401": bad } } },
      "/api/demo/logout": { post: { summary: "End the operations session", responses: { "200": ok } } },
      "/api/payments": { get: { summary: "List all payments for an authenticated operations user", responses: { "200": ok, "401": bad } }, post: { summary: "Submit a payment and automatically assess its beneficiary details", requestBody: { required: true, content: { "application/json": { schema: { "$ref": "#/components/schemas/PaymentSubmission" } } } }, responses: { "201": ok, "422": bad } } },
      "/api/payments/{paymentId}": { get: { summary: "Get payment and investigation history", responses: { "200": ok, "401": bad, "404": bad } } },
      "/api/payments/{paymentId}/message": { post: { summary: "Record a customer message", responses: { "201": ok, "401": bad } } },
      "/api/payments/{paymentId}/decision": { post: { summary: "Record an operator decision or audited recommendation override", responses: { "200": ok, "401": bad, "422": bad } } },
      "/api/payments/{paymentId}/verify": { post: { summary: "Verify the recorded workflow outcome", responses: { "200": ok, "401": bad } } },
      "/api/health": { get: { summary: "Check service and seed status", responses: { "200": ok } } },
      "/api/metrics": { get: { summary: "Get synthetic queue metrics", responses: { "200": ok } } },
      "/api/cases": {
        get: { summary: "List and filter cases", parameters: [{ name: "route", in: "query", schema: { type: "string", enum: ["all", "routine", "human_review", "escalate"] } }, { name: "q", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } }, { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } }], responses: { "200": ok } },
        post: { summary: "Create a synthetic payment exception", requestBody: { required: true, content: { "application/json": { schema: { "$ref": "#/components/schemas/CaseInput" } } } }, responses: { "201": ok, "409": { description: "Payment reference already exists." }, "422": bad } },
      },
      "/api/cases/{caseId}": { get: { summary: "Get case and history", parameters: [{ name: "caseId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok, "404": bad } } },
      "/api/cases/{caseId}/analyze": { post: { summary: "Analyze case; deterministic policy sets the route", parameters: [{ name: "caseId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": ok, "404": bad } } },
      "/api/cases/{caseId}/customer-draft": { post: { summary: "Create an unsent customer-message draft", parameters: [{ name: "caseId", in: "path", required: true, schema: { type: "string" } }], responses: { "201": ok, "404": bad } } },
      "/api/cases/{caseId}/review": { post: { summary: "Record a human reviewer decision", parameters: [{ name: "caseId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["outcome"], properties: { outcome: { type: "string", enum: ["mark_reviewed", "escalate", "request_information"] }, note: { type: "string", maxLength: 500 } } } } } }, responses: { "200": ok, "422": bad, "404": bad } } },
    },
    components: { schemas: { CaseInput: caseInput, PaymentSubmission: paymentSubmission } },
  };
}

const knownBeneficiaries = {
  "0123456789": { name: "Apex Industrial Parts Pte Ltd", country: "Singapore" },
  "1234567890": { name: "Meridian Trading Pte Ltd", country: "Singapore" },
  "2345678901": { name: "Harbourline Components Pte Ltd", country: "Singapore" },
};
function validatePaymentSubmission(body, exceptionTypes) {
  if (body.exceptionType !== undefined) {
    const legacy = validateCaseInput(body, exceptionTypes);
    if (!legacy.error) legacy.value = { ...legacy.value, payeeName: String(body.payeeName || "Supplier / beneficiary").slice(0,120), beneficiaryAccount: String(body.beneficiaryAccount || ""), bankCountry: String(body.bankCountry || ""), purpose: String(body.purpose || legacy.value.customerEnquiry) };
    return legacy;
  }
  for (const field of ["customerName","payeeName","paymentReference","beneficiaryAccount","bankCountry","rail","purpose"]) {
    if (typeof body[field] !== "string" || body[field].trim().length < 2 || body[field].trim().length > 120) return { error: field + " must contain between 2 and 120 characters." };
  }
  if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 100000000) return { error: "amount must be a positive number under 100,000,000." };
  if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) return { error: "currency must be a 3-letter uppercase code." };
  if (!/^[0-9]{8,18}$/.test(body.beneficiaryAccount.replace(/\s/g,""))) return { error: "Enter a beneficiary account number between 8 and 18 digits." };
  if (!/^(GIRO|FAST|MEPS|SWIFT)$/i.test(body.rail)) return { error: "Payment method is invalid." };
  if (body.paymentReference.trim().length > 40 || body.payeeName.trim().length > 120) return { error: "Payment reference or beneficiary name is too long." };
  const account=body.beneficiaryAccount.replace(/\s/g,""); const known=knownBeneficiaries[account];
  const norm=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const matched=Boolean(known && norm(known.name)===norm(body.payeeName));
  const countryMatches=Boolean(known && known.country.toLowerCase()===String(body.bankCountry).trim().toLowerCase());
  const mismatch=Boolean(known && (!matched || !countryMatches));
  const evidenceQuality=mismatch?"conflicting":matched?"complete":"partial";
  const evidenceSummary=mismatch?"Beneficiary name or bank country conflicts with the stored account record.":matched?"Beneficiary name and account number match the stored payment reference records.":"The beneficiary account is not present in the stored payment reference records and requires verification.";
  const eventDetail=mismatch?"Beneficiary name or country conflicts with the stored account record.":matched?"Beneficiary details matched the stored account record.":"No stored beneficiary record was found for this account.";
  const facts={customerName:body.customerName.trim(),payeeName:body.payeeName.trim(),paymentReference:body.paymentReference.trim(),amount:body.amount,currency:body.currency,rail:body.rail.toUpperCase(),paymentStatus:"processing",exceptionType:mismatch?"beneficiary_name_mismatch":matched?"routine_payment":"beneficiary_not_recognized",customerEnquiry:body.purpose.trim(),purpose:body.purpose.trim(),evidenceSummary,evidenceQuality,potentialImpact:matched?"information_only":"payment_change",identityConcern:mismatch?"suspected_unauthorized":matched?"none":"needs_check",retryRequested:false,authoritativeConflict:mismatch,events:[{title:"Payment instruction submitted",detail:"Payment instruction entered for processing.",verified:true},{title:"Beneficiary verification",detail:eventDetail,verified:matched}]};
  const validated=validateCaseInput(facts,exceptionTypes); if(validated.error)return validated;
  validated.value={...validated.value,payeeName:facts.payeeName,beneficiaryAccount:account,bankCountry:body.bankCountry.trim(),purpose:facts.purpose};
  return validated;
}

export function createApiDispatcher({ db, env = process.env, analyzer, sessions = new Map() } = {}) {
  const runAnalysis = analyzer || ((record) => analyzeCase(record, env));
  return async function dispatch(method, path, body = {}, context = {}) {
    const url = new URL(path, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const token = context.token || '';
    const isAdmin = Boolean(token && sessions.has(token));
    if (method === 'POST' && pathname === '/api/demo/login') {
      const user = env.DEMO_ADMIN_USER || 'admin'; const password = env.DEMO_ADMIN_PASSWORD || 'casepilot';
      if (body.username !== user || body.password !== password) return { status: 401, body: { error: 'Invalid username or password.' } };
      const session = randomUUID(); sessions.set(session, { user, createdAt: new Date().toISOString() });
      return { status: 200, body: { token: session, user: { username: user, name: 'Alex Morgan', role: 'Operations administrator' } } };
    }
    if (method === 'GET' && pathname === '/api/demo/session') return { status: 200, body: { authenticated: isAdmin, user: isAdmin ? sessions.get(token) : null } };
    if (method === 'POST' && pathname === '/api/demo/logout') { sessions.delete(token); return { status: 200, body: { ok: true } }; }
    if (method === 'POST' && pathname === '/api/payments') {
      let validated; try { validated = validatePaymentSubmission(body, exceptionTypes); } catch (error) { return { status: 422, body: { error: error.message } }; }
      if (validated.error) return { status: 422, body: { error: validated.error } };
      try {
        const initial = await db.createPayment({ ...validated.value });
        let model; try { model = await runAnalysis(initial.case); } catch { model = fallbackAnalysisForCase(initial.case); }
        const recommendation = recommendRoute(initial.case, model);
        await db.saveAnalysis(initial.case.id, model.provider || 'policy_fallback', model, initial.case.triage);
        const result = await db.updateRecommendation(initial.id, recommendation);
        return { status: 201, body: result };
      } catch (error) { if (String(error.message).includes('UNIQUE constraint failed')) return { status: 409, body: { error: 'Payment reference is already in use.' } }; throw error; }
    }
    if (method === 'GET' && pathname === '/api/payments') {
      if (!isAdmin) return { status: 401, body: { error: 'Admin login required.' } };
      const limit=Math.min(200,Math.max(1,Number.parseInt(url.searchParams.get('limit')||'100',10)||100));
      const offset=Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0);
      return { status:200, body:await db.listPayments({route:url.searchParams.get('route')||undefined,status:url.searchParams.get('status')||undefined,query:(url.searchParams.get('q')||'').slice(0,100),limit,offset}) };
    }
    const pm=pathname.match(/^\/api\/payments\/([^/]+)(?:\/(message|decision|verify|analyze))?$/);
    if(pm){
      const [,id,action]=pm; const payment=await db.getPayment(id); if(!payment)return {status:404,body:{error:'Payment not found.'}};
      if(method==='GET'&&!action)return isAdmin?{status:200,body:payment}:{status:401,body:{error:'Admin login required.'}};
      if(method!=='POST')return {status:405,body:{error:'Method not allowed.'}};
      if(!isAdmin)return {status:401,body:{error:'Admin login required.'}};
      if(action==='analyze'){
        let model;try{model=await runAnalysis(payment.case)}catch{model=fallbackAnalysisForCase(payment.case)}
        const recommendation=recommendRoute(payment.case,model); await db.saveAnalysis(payment.case.id,model.provider||'policy_fallback',model,payment.case.triage); return {status:200,body:await db.updateRecommendation(id,recommendation)};
      }
      if(action==='message'){
        if(typeof body.message!=='string'||body.message.trim().length<3||body.message.length>1500)return {status:422,body:{error:'Message must be between 3 and 1500 characters.'}};
        const result=await db.saveMessage(id,body.message.trim());return {status:201,body:result};
      }
      if(action==='decision'){
        if(typeof body.decision!=='string')return {status:422,body:{error:'decision is required.'}};
        try {
          const result = await db.decidePayment(id, body.decision, String(body.note || '').slice(0, 500), String(body.overrideReason || '').slice(0, 500), String(body.overrideRoute || ''));
          return { status: 200, body: result };
        } catch (error) {
          const validationErrors = new Set([
            "An override reason is required.", "Safety hard stops cannot be overridden.",
            "Select a valid route for the override.", "A payment with an active safety stop cannot be closed.",
            "Invalid decision.",
          ]);
          if (validationErrors.has(error.message)) return { status: 422, body: { error: error.message } };
          throw error;
        }
      }
      if(action==='verify'){const result=await db.verifyPayment(id);return {status:200,body:result};}
    }
    if (method === "GET" && pathname === "/api/health") {
      try {
        const caseCount = await db.countCases();
        const paymentCount = (await db.listPayments({ limit: 1 })).total;
        return { status: 200, body: { ok: true, name: "CasePilot", syntheticOnly: true, workflowVersion: 3, caseCount, paymentCount, aiMode: env.GROQ_API_KEY ? "groq-enabled" : "demo-fallback", aiProvider: env.AI_PROVIDER || "groq", aiModel: env.AI_MODEL || "openai/gpt-oss-20b" } };
      } catch {
        return { status: 503, body: { ok: false, error: "Database unavailable." } };
      }
    }
    if (method === "GET" && pathname === "/api/docs") return { status: 200, body: openApiDocument() };
    if (method === "GET" && pathname === "/api/metrics") return isAdmin ? { status: 200, body: await db.metrics() } : { status: 401, body: { error: "Admin login required." } };
    if (method === "GET" && pathname === "/api/cases") {
      if (!isAdmin) return { status: 401, body: { error: "Admin login required." } };
      const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
      return { status: 200, body: await db.listCases({ route: url.searchParams.get("route") || undefined, status: url.searchParams.get("status") || undefined, query: (url.searchParams.get("q") || "").slice(0, 100), limit, offset }) };
    }
    if (method === "POST" && pathname === "/api/cases") {
      let validated;
      try { validated = validateCaseInput(body, exceptionTypes); } catch (error) { return { status: 422, body: { error: error.message } }; }
      if (validated.error) return { status: 422, body: { error: validated.error } };
      try { return { status: 201, body: await db.insertCase(validated.value) }; }
      catch (error) {
        if (String(error.message).includes("UNIQUE constraint failed")) return { status: 409, body: { error: "paymentReference is already in use." } };
        throw error;
      }
    }
    const match = pathname.match(/^\/api\/cases\/([^/]+)(?:\/(analyze|customer-draft|review))?$/);
    if (match) {
      const [, caseId, action] = match;
      const record = await db.getCase(caseId);
      if (!record) return { status: 404, body: { error: "Case not found." } };
      if (method === "GET" && !action) return isAdmin ? { status: 200, body: record } : { status: 401, body: { error: "Admin login required." } };
      if (method !== "POST") return { status: 405, body: { error: "Method not allowed." } };
      if (!isAdmin) return { status: 401, body: { error: "Admin login required." } };
      if (action === "analyze") {
        let model;
        try { model = await runAnalysis(record); } catch { model = fallbackAnalysisForCase(record); }
        if (!model || typeof model !== "object") model = fallbackAnalysisForCase(record);
        const triage = computeTriage(record);
        const saved = await db.saveAnalysis(caseId, model.provider || "demo_fallback", model, triage);
        return { status: 200, body: { model: saved.model, triage, createdAt: saved.createdAt } };
      }
      if (action === "customer-draft") {
        const safeToUseModelDraft = record.triage.route === "routine" && record.evidenceQuality === "complete" && !record.authoritativeConflict && record.identityConcern === "none" && ["confirmed", "rejected"].includes(record.paymentStatus);
        const modelDraft = record.analyses[0]?.model?.customerDraft;
        const message = safeToUseModelDraft && typeof modelDraft === "string" && modelDraft.length < 1500 ? modelDraft : makeCustomerDraft(record);
        return { status: 201, body: await db.saveDraft(caseId, message) };
      }
      if (action === "review") {
        if (!["mark_reviewed", "escalate", "request_information"].includes(body.outcome)) return { status: 422, body: { error: "outcome must be mark_reviewed, escalate, or request_information." } };
        if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 500)) return { status: 422, body: { error: "note must be a string up to 500 characters." } };
        return { status: 200, body: await db.reviewCase(caseId, body.outcome, body.note || "") };
      }
    }
    return { status: 404, body: { error: "API route not found." } };
  };
}

export async function createCasePilotServer({ dbPath = "data/casepilot.sqlite", env = process.env, analyzer } = {}) {
  const hosted = env.NODE_ENV === "production";
  if (hosted) {
    if (!env.DATABASE_URL?.trim() || !env.TURSO_AUTH_TOKEN?.trim()) {
      throw new Error("Hosted database configuration is incomplete.");
    }
    if (!env.DEMO_ADMIN_USER?.trim() || !env.DEMO_ADMIN_PASSWORD?.trim() || env.DEMO_ADMIN_PASSWORD === "casepilot") {
      throw new Error("Hosted admin credentials must be set to nondefault values.");
    }
  }
  let db;
  try {
    db = await createDatabase({ path: resolve(dbPath), env: hosted ? env : {} });
    await db.seedCases(generateSyntheticCases(120));
  } catch {
    if (db) await db.close();
    throw new Error("Database initialization failed.");
  }
  const sessions = new Map();
  const dispatch = createApiDispatcher({ db, env, analyzer, sessions });
  const server = createServer(async (request, response) => {
    secureHeaders(response);
    const url = new URL(request.url || "/", "http://localhost");
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type, X-Admin-Token" });
      response.end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      try {
        const body = request.method === "POST" ? await readJson(request) : {};
        const cookie = request.headers.cookie || '';
        const cookieToken = cookie.match(/(?:^|;\s*)casepilot_session=([^;]+)/)?.[1] || '';
        const result = await dispatch(request.method, url, body, { token: request.headers["x-admin-token"] || cookieToken });
        return sendJson(response, result.status, result.body);
      } catch (error) { return sendJson(response, error.status || 500, { error: error.status ? error.message : "The request could not be completed." }); }
    }
    const cookieToken = (request.headers.cookie || "").match(/(?:^|;\s*)casepilot_session=([^;]+)/)?.[1] || "";
    if (request.method === "GET" && ["/admin", "/transactions"].includes(url.pathname) && !sessions.has(cookieToken)) { response.writeHead(302, { location: "/login" }); response.end(); return; }
    if (request.method === "GET" && await serveAsset(url.pathname, response)) return;
    sendJson(response, 404, { error: "Not found." });
  });
  return { server, db, dispatch, close: async () => { await db.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnvironmentFile();
  try {
    const app = await createCasePilotServer();
    const port = Number.parseInt(process.env.PORT || "4174", 10);
    const caseCount = await app.db.countCases();
    app.server.listen(port, "0.0.0.0", () => {
      console.log("CasePilot running on port " + app.server.address().port);
      console.log("Synthetic cases: " + caseCount + " | AI: " + (process.env.GROQ_API_KEY ? "Groq enabled" : "AI key required"));
    });
  } catch {
    console.error("CasePilot startup failed. Check server configuration and database availability.");
    process.exitCode = 1;
  }
}
