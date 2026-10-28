import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {enhancedDispatcher} from "../src/upgrade-api.mjs";
import {createCasePilotServer,createApiDispatcher} from "../src/server.mjs";
let app,dir,admin,agent,reviewer,owner;
async function login(username,password){const r=await app.dispatch("POST","/api/demo/login",{username,password});assert.equal(r.status,200);return {token:r.body.token};}
before(async()=>{dir=mkdtempSync(join(tmpdir(),"accelera-upgrade-"));app=await createCasePilotServer({dbPath:join(dir,"app.sqlite"),env:{}});admin=await login("admin","casepilot");});
after(async()=>{await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:100}).catch(()=>{});});
async function scenario(key){const r=await app.dispatch("POST","/api/demo/scenarios/"+key,{},admin);assert.equal(r.status,201,JSON.stringify(r.body));return r.body;}
const step=(id,action,extra={},ctx=admin)=>app.dispatch("POST","/api/payments/"+id+"/workflow",{action,...extra},ctx);
async function request(x){const r=await app.dispatch("POST","/api/payments/"+x.id+"/recovery-requests",{},admin);assert.equal(r.status,201,JSON.stringify(r.body));const u=new URL(r.body.portalUrl,"http://test");return {...r.body,requestToken:new URLSearchParams(u.hash.slice(1)).get("token")};}
async function portal(q){return app.dispatch("GET","/api/recovery/requests/"+q.request.id,{}, {requestToken:q.requestToken});}
async function response(q,body){return app.dispatch("POST","/api/recovery/requests/"+q.request.id+"/responses",body,{requestToken:q.requestToken});}
function correct(p){const e=p.body.sourceRecord;return {reference:e.reference,amountMinor:e.amountMinor,currency:e.currency,beneficiaryAccount:e.beneficiary,finalStatus:e.finalStatus,processorRecordId:e.id};}

test("the Smart Recovery portal validates real stored evidence and resumes to verified closure",async()=>{
 const x=await scenario("recovery");assert.equal((await step(x.id,"run_case")).body.workflow.status,"waiting");
 const q=await request(x),p=await portal(q);assert.equal(p.status,200);assert.equal(p.body.request.status,"awaiting_response");
 const result=await response(q,correct(p));assert.equal(result.status,200);assert.equal(result.body.validation.valid,true);
 assert.equal(result.body.workflow.status,"verified");
 const passport=await app.dispatch("GET","/api/payments/"+x.id+"/passport",{},admin);
 assert.equal(passport.status,200);assert.equal(passport.body.recoveryRequests[0].status,"validated");
 assert.ok(passport.body.evidence.length>2);assert.ok(passport.body.audit.some(a=>a.type==="recovery_response_validated"));
});
test("wrong, missing or contradictory portal responses do not authorise recovery",async()=>{
 const x=await scenario("recovery");await step(x.id,"run_case");const q=await request(x),p=await portal(q);
 for(const body of [{...correct(p),amountMinor:999},{...correct(p),finalStatus:"rejected"},{reference:x.paymentReference}]){
  const result=await response(q,body);assert.equal(result.status,422);assert.equal(result.body.validation.valid,false);
 }
 const saved=await app.dispatch("GET","/api/payments/"+x.id,{},admin);assert.equal(saved.body.workflow.status,"waiting");assert.equal(saved.body.workflow.attempts.length,0);
});
test("a recovery capability cannot read or answer a different request",async()=>{
 const a=await scenario("recovery"),b=await scenario("recovery");await step(a.id,"run_case");await step(b.id,"run_case");
 const qa=await request(a),qb=await request(b);
 assert.equal((await app.dispatch("GET","/api/recovery/requests/"+qb.request.id,{}, {requestToken:qa.requestToken})).status,403);
 assert.equal((await app.dispatch("GET","/api/payments/"+a.id,{}, {requestToken:qa.requestToken})).status,401);
});
test("repeating an identical accepted response never applies a second action",async()=>{
 const x=await scenario("recovery");await step(x.id,"run_case");const q=await request(x),p=await portal(q),body=correct(p);
 const first=await response(q,body),again=await response(q,body);
 assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(again.body.idempotent,true);
 const saved=await app.dispatch("GET","/api/payments/"+x.id,{},admin);assert.equal(saved.body.workflow.attempts.length,1);
 assert.equal((await response(q,{...body,amountMinor:1})).status,409);
});
test("risk restrictions remain blocked regardless of favourable model or reviewer approval",async()=>{
 const x=await scenario("risk_flag");const result=await step(x.id,"run_case");assert.equal(result.body.workflow.status,"manual");
 assert.equal((await step(x.id,"approve",{note:"AI thinks this is safe"})).status,409);
 assert.equal((await step(x.id,"execute")).status,409);
 const decision=await step(x.id,"escalate",{note:"Keep the restriction and refer to the authorised risk desk."});
 assert.equal(decision.status,200);assert.equal(decision.body.workflow.attempts.length,0);assert.ok(decision.body.workflow.source.riskIndicators[0].active);
});
test("Evidence Challenger blocks a failed-only claim when completion evidence also exists",async()=>{
 const x=await scenario("evidence_conflict");const r=await step(x.id,"run_case");
 assert.equal(r.body.workflow.status,"manual");assert.equal(r.body.workflow.challenger.passed,false);
 assert.ok(r.body.workflow.challenger.claims.some(c=>c.status==="contradicted"));
 assert.equal(r.body.workflow.attempts.length,0);
});
test("a status change invalidates the proposed SafeReplay action before execution",async()=>{
 const x=await scenario("status_changed");await step(x.id,"investigate");
 assert.equal((await step(x.id,"simulate")).status,200);
 const changed=await app.dispatch("POST","/api/payments/"+x.id+"/simulator",{event:"status_changed"},admin);assert.equal(changed.status,200);
 const blocked=await step(x.id,"execute");assert.equal(blocked.status,409);
 const p=await app.dispatch("GET","/api/payments/"+x.id,{},admin);assert.equal(p.body.workflow.attempts.length,0);
 assert.ok(p.body.workflow.events.some(e=>e.type==="action_blocked"));
});
test("backend roles cannot be changed by the role selector or supplied payload",async()=>{
 agent=await login("agent","agent-demo");reviewer=await login("reviewer","reviewer-demo");owner=await login("owner","owner-demo");
 const x=await scenario("allocation");await step(x.id,"investigate");
 assert.equal((await step(x.id,"approve",{note:"I claim to be reviewer",role:"administrator"},agent)).status,403);
 assert.equal((await step(x.id,"execute",{},owner)).status,403);
 assert.equal((await step(x.id,"approve",{note:"Checked exact mandate and current balances."},reviewer)).status,200);
});
test("reviewer authority limits are enforced against the saved payment",async()=>{
 const x=await scenario("allocation");
 await step(x.id,"investigate");
 const envApp=await createCasePilotServer({dbPath:join(dir,"limit.sqlite"),env:{DEMO_REVIEWER_LIMIT_MINOR:"10000"}});
 try{
  const a=await envApp.dispatch("POST","/api/demo/login",{username:"admin",password:"casepilot"});
  const r=await envApp.dispatch("POST","/api/demo/login",{username:"reviewer",password:"reviewer-demo"});assert.equal(r.status,200);
  const p=await envApp.dispatch("POST","/api/demo/scenarios/allocation",{}, {token:a.body.token});
  await envApp.dispatch("POST","/api/payments/"+p.body.id+"/workflow",{action:"investigate"},{token:a.body.token});
  assert.equal((await envApp.dispatch("POST","/api/payments/"+p.body.id+"/workflow",{action:"approve",note:"Within my claimed authority"},{token:r.body.token})).status,403);
 }finally{await envApp.close();}
});
test("SafeReplay preview changes no target and Passport records it with inspectable sources",async()=>{
 const x=await scenario("status");await step(x.id,"investigate");const before=await app.dispatch("GET","/api/payments/"+x.id,{},admin);
 const preview=await step(x.id,"simulate");assert.equal(preview.status,200);assert.equal(preview.body.workflow.simulation.permitted,true);
 assert.deepEqual(preview.body.workflow.target,before.body.workflow.target);
 const pass=await app.dispatch("GET","/api/payments/"+x.id+"/passport",{},admin);assert.ok(pass.body.safetySimulation);assert.ok(pass.body.evidence.every(e=>e.id&&e.source));
});
test("benchmarks store measured synthetic runs with a labelled scripted baseline",async()=>{
 const r=await app.dispatch("POST","/api/benchmarks",{repetitions:2},admin);assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(r.body.manual.label,"Scripted manual sequence");assert.equal(r.body.repetitions,2);
 assert.equal(r.body.manual.samples.length,2);assert.equal(r.body.controlled.samples.length,2);
 assert.ok(r.body.manual.samples.every(s=>s.outcome==="verified"));assert.ok(r.body.controlled.samples.every(s=>s.outcome==="verified"));
 assert.ok(r.body.manual.samples.every(s=>Number.isFinite(s.processingMs)&&s.processingMs>=0));
 assert.ok(r.body.manual.operationsPerCase>r.body.controlled.operationsPerCase);
 const saved=await app.dispatch("GET","/api/benchmarks",{},admin);assert.equal(saved.body.items[0].id,r.body.id);
});
test("recovery evidence, approvals and Passport survive reopening storage",async()=>{
 const x=await scenario("recovery");await step(x.id,"run_case");const q=await request(x),p=await portal(q);await response(q,correct(p));
 await app.close();app=await createCasePilotServer({dbPath:join(dir,"app.sqlite"),env:{}});admin=await login("admin","casepilot");
 const saved=await app.dispatch("GET","/api/payments/"+x.id+"/passport",{},admin);assert.equal(saved.body.outcome.status,"verified");assert.equal(saved.body.recoveryRequests[0].responses.length,1);
});

test("live-model claims without matching source IDs never authorise execution",async()=>{
 const modelApp=await createCasePilotServer({dbPath:join(dir,"unsupported.sqlite"),env:{},analyzer:async()=>({provider:"groq",riskRecommendation:"low",summary:"A fabricated unsupported completion claim",claims:[{id:"unsafe",kind:"payment_status",value:"confirmed",evidenceIds:["NOT-A-SAVED-RECORD"]}]})});
 try{const a=await modelApp.dispatch("POST","/api/demo/login",{username:"admin",password:"casepilot"}),ctx={token:a.body.token};
 const p=await modelApp.dispatch("POST","/api/demo/scenarios/status",{},ctx);
 const r=await modelApp.dispatch("POST","/api/payments/"+p.body.id+"/workflow",{action:"run_case"},ctx);
 assert.equal(r.body.workflow.status,"manual");assert.equal(r.body.workflow.challenger.claims[0].status,"unsupported");assert.equal(r.body.workflow.attempts.length,0);
 }finally{await modelApp.close();}
});
test("expired recovery capabilities cannot read or submit a response",async()=>{
 const expiryApp=await createCasePilotServer({dbPath:join(dir,"expiry.sqlite"),env:{RECOVERY_TTL_MS:"1000"}}),now=Date.now;
 try{const a=await expiryApp.dispatch("POST","/api/demo/login",{username:"admin",password:"casepilot"}),ctx={token:a.body.token};
 const p=await expiryApp.dispatch("POST","/api/demo/scenarios/recovery",{},ctx);await expiryApp.dispatch("POST","/api/payments/"+p.body.id+"/workflow",{action:"run_case"},ctx);
 const r=await expiryApp.dispatch("POST","/api/payments/"+p.body.id+"/recovery-requests",{},ctx),u=new URL(r.body.portalUrl,"http://test"),cap={requestToken:new URLSearchParams(u.hash.slice(1)).get("token")};
 Date.now=()=>now()+2000;
 assert.equal((await expiryApp.dispatch("GET","/api/recovery/requests/"+r.body.request.id,{},cap)).status,410);
 assert.equal((await expiryApp.dispatch("POST","/api/recovery/requests/"+r.body.request.id+"/responses",{},cap)).status,410);
 }finally{Date.now=now;await expiryApp.close();}
});

test("encoded route aliases cannot bypass backend role permissions",async()=>{
 const readOnly=await login("owner","owner-demo");const x=await scenario("allocation");await step(x.id,"investigate");
 for(const action of ["approve","execute","run_case"]){
  const r=await app.dispatch("POST","/api/%70ayments/"+x.id+"/workflow",{action,note:"Attempted encoded path bypass"},readOnly);assert.equal(r.status,403);
 }
 assert.equal((await app.dispatch("POST","/api/%64emo/scenarios/status",{},readOnly)).status,403);
});

test("accepted recovery can resume an interrupted action or verification without duplicate effects",async()=>{
 for(const stopAt of ["execute","verify"]){
  const x=await scenario("recovery");await step(x.id,"run_case");const q=await request(x),p=await portal(q),body=correct(p);
  const sessions=new Map(),legacy=createApiDispatcher({db:app.db,env:{},sessions});let interrupted=false;
  const dispatch=enhancedDispatcher({db:app.db,env:{},sessions,legacyDispatch:async(method,path,payload,ctx)=>{
   if(payload?.action===stopAt&&!interrupted){interrupted=true;return {status:503,body:{error:"Injected interruption before "+stopAt}};}
   return legacy(method,path,payload,ctx);
  }});
  const send=()=>dispatch("POST","/api/recovery/requests/"+q.request.id+"/responses",body,{requestToken:q.requestToken});
  const first=await send();assert.equal(first.status,200);assert.equal(first.body.workflow.status,stopAt==="execute"?"ready":"executed");
  const replay=await send();assert.equal(replay.status,200);assert.equal(replay.body.workflow.status,"verified");
  const saved=await app.db.getPayment(x.id);assert.equal(saved.workflow.attempts.length,1);
 }
});
