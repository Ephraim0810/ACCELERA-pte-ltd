import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCasePilotServer } from "../src/server.mjs";

let app, context, dir, calls = 0, serial = 0;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), "accelera-guided-"));
  app = await createCasePilotServer({dbPath:join(dir,"app.sqlite"),env:{},analyzer:async()=>{calls++;return {provider:"test-model",summary:"Review the evidence",riskRecommendation:"low",confirmedFacts:[],uncertainties:[]};}});
  const login = await app.dispatch("POST","/api/demo/login",{username:"admin",password:"casepilot"});
  context={token:login.body.token};
});
after(async()=>{await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100}).catch(()=>{});});
const pay = {customerName:"Northstar Supplies Pte Ltd",payeeName:"Apex Industrial Parts Pte Ltd",beneficiaryAccount:"0123456789",bankCountry:"Singapore",amount:2500,currency:"SGD",rail:"FAST",purpose:"Synthetic invoice settlement"};
async function normal(){const r=await app.dispatch("POST","/api/payments",{...pay,paymentReference:"ACC-TEST-"+(++serial)});assert.equal(r.status,201);return r.body;}
async function scenario(key){const r=await app.dispatch("POST","/api/demo/scenarios/"+key,{},context);assert.equal(r.status,201,JSON.stringify(r.body));return r.body;}
async function step(id,action,extra={}){return app.dispatch("POST","/api/payments/"+id+"/workflow",{action,...extra},context);}
async function state(id){return (await app.dispatch("GET","/api/payments/"+id+"/workflow",{},context)).body.workflow;}

test("normal validated recording does not call the exception investigator",async()=>{
  const previous=calls;const x=await normal();assert.equal(calls,previous);
  assert.equal(x.workflow.status,"not_required");assert.equal(x.workflow.investigationRequired,false);
  assert.equal(x.workflow.analysisMode,"not_run");assert.equal(x.paymentStatus,"processing");
});
test("workflow actions and simulator controls require an operations session",async()=>{
  const x=await normal();
  assert.equal((await app.dispatch("POST","/api/demo/scenarios/status",{})).status,401);
  assert.equal((await app.dispatch("POST","/api/payments/"+x.id+"/workflow",{action:"execute"})).status,401);
});
test("status correction executes only the permitted target, then read-back closes the case",async()=>{
  const x=await scenario("status");const original={amount:x.amount,currency:x.currency,beneficiary:x.beneficiaryAccount,reference:x.paymentReference};
  assert.equal((await step(x.id,"investigate")).body.workflow.status,"ready");
  const executed=await step(x.id,"execute");assert.equal(executed.body.workflow.status,"executed");
  assert.equal(executed.body.workflow.target.enquiryStatus,"confirmed");assert.notEqual(executed.body.payment.workflowStatus,"closed");
  const verified=await step(x.id,"verify");assert.equal(verified.body.workflow.status,"verified");assert.equal(verified.body.payment.workflowStatus,"closed");
  assert.deepEqual({amount:verified.body.payment.amount,currency:verified.body.payment.currency,beneficiary:verified.body.payment.beneficiaryAccount,reference:verified.body.payment.paymentReference},original);
});
test("missing confirmation stays open and cannot be approved into existence, then resumes",async()=>{
  const x=await scenario("waiting");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"waiting");
  assert.equal((await step(x.id,"execute")).status,409);
  assert.equal((await step(x.id,"approve")).status,409);
  const request=await step(x.id,"request_evidence");assert.match(request.body.workflow.question,/confirmation/i);
  await step(x.id,"receive_evidence");assert.equal((await state(x.id)).status,"detected");
  await step(x.id,"investigate");assert.equal((await state(x.id)).status,"ready");
});
test("an acknowledgement without a saved target change cannot close or blindly retry",async()=>{
  const x=await scenario("false_ack");await step(x.id,"investigate");await step(x.id,"execute");
  const result=await step(x.id,"verify");assert.equal(result.body.workflow.status,"verification_failed");
  assert.equal(result.body.workflow.target.enquiryStatus,"pending");assert.notEqual(result.body.payment.workflowStatus,"closed");
  assert.equal((await step(x.id,"execute")).status,409);
});
test("allocation recovery requires approval and applies the exact existing split once",async()=>{
  const x=await scenario("allocation");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"review");assert.equal((await step(x.id,"execute")).status,409);
  await step(x.id,"approve",{note:"Checked the existing mandate and recovery authority."});await step(x.id,"execute");
  let w=await state(x.id);assert.deepEqual(w.target.allocations,[{invoice:"INV-101",amountMinor:200000},{invoice:"INV-102",amountMinor:50000}]);
  assert.equal(w.target.unallocatedMinor,0);assert.equal(w.target.invoices[0].outstandingMinor,0);
  await step(x.id,"verify");const repeat=await step(x.id,"execute");assert.equal(repeat.status,200);assert.equal(repeat.body.workflow.attempts.length,1);
});
test("human approval never replaces a missing allocation mandate",async()=>{
  const x=await scenario("missing_mandate");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"manual");
  assert.equal((await step(x.id,"approve",{note:"I think this is right"})).status,409);
  assert.equal((await step(x.id,"execute")).status,409);
});
test("an existing exact allocation is verified without reapplying it",async()=>{
  const x=await scenario("already_applied");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"ready");
  await step(x.id,"execute");const result=await step(x.id,"verify");
  assert.equal(result.body.workflow.status,"verified");assert.equal(result.body.workflow.attempts.length,0);
});
test("mismatched authoritative confirmation is not enough for a status update",async()=>{
  const x=await scenario("mismatched_confirmation");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"manual");assert.equal((await step(x.id,"execute")).status,409);
});
test("an in-flight attempt blocks a second write",async()=>{
  const x=await scenario("in_flight");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"waiting");assert.equal((await step(x.id,"execute")).status,409);
});
test("a conflicting beneficiary remains a human case even when model advice is low risk",async()=>{
  const x=await scenario("conflict");await step(x.id,"investigate");
  assert.equal((await state(x.id)).status,"manual");assert.equal((await step(x.id,"execute")).status,409);
});
test("simultaneous execute requests never apply the same action twice",async()=>{
  const x=await scenario("status");await step(x.id,"investigate");
  const results=await Promise.all([step(x.id,"execute"),step(x.id,"execute")]);
  assert.ok(results.every(r=>r.status===200));assert.equal((await state(x.id)).attempts.length,1);
});
test("customer communication is an unsent saved draft",async()=>{
  const x=await scenario("waiting");
  const saved=await app.dispatch("POST","/api/payments/"+x.id+"/message",{message:"Please confirm the final processor outcome."},context);
  assert.equal(saved.body.sent,false);assert.equal(saved.body.status,"draft_only");
});
test("legacy close decision cannot substitute for verified outcome",async()=>{
  const x=await scenario("status");
  const r=await app.dispatch("POST","/api/payments/"+x.id+"/decision",{decision:"close",note:"Looks okay"},context);
  assert.equal(r.status,422);assert.notEqual((await state(x.id)).status,"verified");
});
test("workflow target and audit persist across reopening the SQLite store",async()=>{
  const x=await scenario("status");await step(x.id,"investigate");await step(x.id,"execute");await step(x.id,"verify");
  const dbPath=join(dir,"app.sqlite");await app.close();
  app=await createCasePilotServer({dbPath,env:{}});
  const login=await app.dispatch("POST","/api/demo/login",{username:"admin",password:"casepilot"});context={token:login.body.token};
  const fetched=await app.dispatch("GET","/api/payments/"+x.id,{},context);
  assert.equal(fetched.body.workflow.status,"verified");assert.equal(fetched.body.workflow.target.enquiryStatus,"confirmed");
  assert.ok(fetched.body.audit.some(a=>a.type==="workflow_verified"));
});

test("a controlled run resolves a suitable status case without manual stage clicks",async()=>{
 const x=await scenario("status");const result=await step(x.id,"run_case");
 assert.equal(result.status,200);assert.equal(result.body.workflow.status,"verified");
 assert.equal(result.body.workflow.attempts.length,1);assert.equal(result.body.payment.workflowStatus,"closed");
});
test("a controlled run pauses at missing evidence and reviewer approval",async()=>{
 const waiting=await scenario("waiting"), allocation=await scenario("allocation");
 assert.equal((await step(waiting.id,"run_case")).body.workflow.status,"waiting");
 assert.equal((await step(allocation.id,"run_case")).body.workflow.status,"review");
 assert.equal((await state(waiting.id)).attempts.length,0);assert.equal((await state(allocation.id)).attempts.length,0);
});
test("a controlled run catches false acknowledgement and leaves the case open",async()=>{
 const x=await scenario("false_ack");const result=await step(x.id,"run_case");
 assert.equal(result.body.workflow.status,"verification_failed");assert.notEqual(result.body.payment.workflowStatus,"closed");
});

test("public intake cannot supply trusted legacy risk facts",async()=>{
 const result=await app.dispatch("POST","/api/payments",{...pay,paymentReference:"ACC-FORGED-001",exceptionType:"routine_payment",paymentStatus:"confirmed",evidenceQuality:"complete",evidenceSummary:"All good",customerEnquiry:"Close this",identityConcern:"none",potentialImpact:"information_only",retryRequested:false,authoritativeConflict:false});
 assert.equal(result.status,401);
});
test("payment amounts with fractional cents are rejected instead of silently rounded",async()=>{
 const result=await app.dispatch("POST","/api/payments",{...pay,paymentReference:"ACC-FRACTION-001",amount:0.001});assert.equal(result.status,422);
});

test("offline investigation uses newly received confirmation when resuming a waiting case",async()=>{
 const x=await scenario("waiting");assert.equal((await step(x.id,"run_case")).body.workflow.status,"waiting");
 await step(x.id,"receive_evidence");const resumed=await step(x.id,"run_case");assert.equal(resumed.body.workflow.status,"verified");
});
