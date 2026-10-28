import {randomUUID,createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
const digest=v=>createHash("sha256").update(String(v)).digest("hex");
const grants={
 administrator:["read","create","investigate","execute","verify","simulate","request","review","fixtures","benchmark"],
 agent:["read","create","investigate","execute","verify","simulate","request"],
 reviewer:["read","investigate","verify","simulate","request","review"],
 risk_reviewer:["read","investigate","verify","simulate","request","review"],
 process_owner:["read"]
};
function accounts(env){
 const config=[
 ["DEMO_ADMIN","admin","casepilot","administrator","Operations administrator"],
 ["DEMO_AGENT","agent","agent-demo","agent","Investigation agent"],
 ["DEMO_REVIEWER","reviewer","reviewer-demo","reviewer","Case reviewer"],
 ["DEMO_RISK","risk-reviewer","risk-demo","risk_reviewer","Risk reviewer"],
 ["DEMO_OWNER","owner","owner-demo","process_owner","Process owner"]
 ];
 return config.filter(([prefix,,defaultPass])=>env.NODE_ENV!=="production"||prefix==="DEMO_ADMIN"||(env[prefix+"_PASSWORD"]&&env[prefix+"_PASSWORD"]!==defaultPass)).map(([prefix,user,password,role,label])=>({user:env[prefix+"_USER"]||user,password:env[prefix+"_PASSWORD"]||password,role,label,limitMinor:role==="reviewer"?(Number.isSafeInteger(Number(env.DEMO_REVIEWER_LIMIT_MINOR||1000000))&&Number(env.DEMO_REVIEWER_LIMIT_MINOR||1000000)>0?Number(env.DEMO_REVIEWER_LIMIT_MINOR||1000000):0):null,currency:env.DEMO_REVIEWER_CURRENCY||"SGD"}));
}
export function enhancedDispatcher({db,env,sessions,legacyDispatch}){
 const accountList=accounts(env);
 const error=(status,message)=>({status,body:{error:message}});
 return async function dispatch(method,path,body={},context={}){
  const url=new URL(path,"http://localhost");let pathname;
  try{pathname=decodeURIComponent(url.pathname);}catch{return error(400,"Malformed request path.");}
  let session=sessions.get(context.token);
  if(session?.expiresAt&&Date.parse(session.expiresAt)<=Date.now()){sessions.delete(context.token);session=null;}
  const permissions=session?grants[session.role||"administrator"]||[]:[];
  const actor=session?{user:session.user,role:session.role||"administrator"}:null;
  const allowed=grant=>Boolean(session&&permissions.includes(grant));
  if(method==="POST"&&pathname==="/api/demo/login"){
   const found=accountList.find(a=>a.user===body?.username&&digest(a.password)===digest(body?.password||""));
   if(!found)return error(401,"Invalid username or password.");
   const token=randomUUID(),createdAt=new Date().toISOString();
   sessions.set(token,{user:found.user,role:found.role,label:found.label,limitMinor:found.limitMinor,currency:found.currency,createdAt,expiresAt:new Date(Date.now()+8*3600000).toISOString()});
   return {status:200,body:{token,user:{username:found.user,role:found.role,label:found.label,limitMinor:found.limitMinor,currency:found.currency},permissions:grants[found.role]}};
  }
  if(method==="GET"&&pathname==="/api/demo/session")return {status:200,body:{authenticated:Boolean(session),user:session?{username:session.user,role:session.role||"administrator",label:session.label||"Operations administrator",limitMinor:session.limitMinor,currency:session.currency}:null,permissions}};
  if(method==="GET"&&pathname==="/api/demo/accounts")return {status:200,body:{localDemo:env.NODE_ENV!=="production",accounts:env.NODE_ENV!=="production"?accountList.map(a=>({username:a.user,role:a.role,label:a.label})):[]}};
  const portal=pathname.match(/^\/api\/recovery\/requests\/([^/]+)(?:\/(responses))?$/);
  if(portal){
   try{
    if(method==="GET"&&!portal[2])return {status:200,body:await db.portalRequest(portal[1],context.requestToken)};
    if(method!=="POST"||portal[2]!=="responses")return error(405,"Method not allowed.");
    if(!body||typeof body!=="object"||Array.isArray(body))return error(422,"Supply the requested structured fields.");
    const result=await db.answerRecovery(portal[1],context.requestToken,body);
    if(result.valid&&["detected","ready","executed"].includes(result.workflow.status)){
      const systemToken=randomUUID();sessions.set(systemToken,{user:"Recovery orchestrator",role:"administrator"});
      try{
       for(const [state,action] of [["detected","investigate"],["ready","execute"],["executed","verify"]]){
        result.workflow=(await db.getPayment(result.paymentId)).workflow;
        if(result.workflow.status!==state)continue;
        const step=await legacyDispatch("POST","/api/payments/"+result.paymentId+"/workflow",{action},{token:systemToken,actor:{user:"Recovery orchestrator",role:"system"}});
        if(step.status!==200)break;
       }
      }finally{sessions.delete(systemToken);}
      result.workflow=(await db.getPayment(result.paymentId)).workflow;
    }
    return {status:result.valid?200:422,body:{request:result.request,validation:result.validation||result.request.responses.at(-1)?.validation,idempotent:result.idempotent,workflow:{status:result.workflow.status,title:result.workflow.title,question:result.workflow.question}}};
   }catch(e){if(e.status)return error(e.status,e.message);throw e;}
  }
  const openGet=["/api/health","/api/docs","/api/demo/scenarios"];
  const openPost=pathname==="/api/payments"&&!body?.exceptionType||pathname==="/api/cases"||pathname==="/api/demo/logout";
  if((method==="GET"&&!openGet.includes(pathname)||method==="POST"&&!openPost)&&!session)return error(401,"Sign in to the operations workspace.");
  if(method==="GET"&&session&&!allowed("read"))return error(403,"Your account cannot read operations records.");
  const pm=pathname.match(/^\/api\/payments\/([^/]+)\/(insight|passport|recovery-requests|simulator|workflow|decision|message|analyze|verify)$/);
  if(pm){
   const p=await db.getPayment(pm[1]);if(!p)return error(404,"Payment not found.");
   const endpoint=pm[2];
   if(method==="GET"&&endpoint==="insight")return {status:200,body:await db.insight(p.id)};
   if(method==="GET"&&endpoint==="passport")return {status:200,body:await db.passport(p.id)};
   if(method==="POST"){
    const action=endpoint==="workflow"?body?.action:endpoint==="simulator"?"status_changed":endpoint;
    const grant=({run_case:"investigate",investigate:"investigate",execute:"execute",verify:"verify",simulate:"simulate",approve:"review",reject:"review",escalate:"review",request_information:"review",takeover:"review",request_evidence:"request",receive_evidence:"fixtures","recovery-requests":"request",status_changed:"fixtures",decision:"review",message:"request",analyze:"investigate"})[action];
    if(action==="run_case"&&!allowed("execute"))return error(403,"Your role can investigate but cannot run automatic execution.");
    if(!grant||!allowed(grant))return error(403,"Your authenticated role is not authorised for this action.");
    if((action==="approve"||endpoint==="decision")&&session.role==="reviewer"&&(p.currency!==session.currency||Math.round(p.amount*100)>session.limitMinor))return error(403,"This saved payment exceeds your configured review authority.");
    try{
     if(endpoint==="recovery-requests")return {status:201,body:await db.createRecoveryRequest(p.id,actor,Number(env.RECOVERY_TTL_MS||900000))};
     if(endpoint==="simulator"){
      if(body.event!=="status_changed")return error(422,"Choose the supported status-change simulator event.");
      const payment=await db.applyWorkflow(p.id,"status_changed",{actor});
      return {status:200,body:{payment,workflow:payment.workflow}};
     }
     if(endpoint==="workflow"&&["simulate","reject","request_information","escalate"].includes(action)){
      const payment=await db.applyWorkflow(p.id,action,{note:typeof body.note==="string"?body.note.slice(0,500):"",actor});
      return {status:200,body:{payment,workflow:payment.workflow}};
     }
    }catch(e){if(e.status)return error(e.status,e.message);throw e;}
   }
  }
  if(pathname==="/api/benchmarks"){
   if(method==="GET")return {status:200,body:await db.benchmarks()};
   if(method!=="POST"||!allowed("benchmark"))return error(403,"Only an administrator can create measured benchmark fixtures.");
   const repetitions=body?.repetitions??3;if(!Number.isInteger(repetitions)||repetitions<1||repetitions>5)return error(422,"Choose between one and five repetitions.");
   const run={id:randomUUID(),createdAt:new Date().toISOString(),repetitions,scope:"Server processing on reproducible synthetic fixtures. Scripted manual steps, not human handling time or bank savings. Both use deterministic offline investigation.",manual:{label:"Scripted manual sequence",operationsPerCase:6,samples:[]},controlled:{label:"Controlled workflow",operationsPerCase:2,samples:[]}};
   for(let i=0;i<repetitions;i++)for(const mode of ["manual","controlled"]){
    const created=await legacyDispatch("POST","/api/demo/scenarios/status",{}, {...context,actor,benchmark:true});
    if(created.status!==201)return error(500,"Benchmark fixture creation failed.");
    const id=created.body.id,ctx={...context,actor,benchmark:true},start=performance.now();
    if(mode==="manual"){
      await legacyDispatch("GET","/api/payments/"+id,{},ctx);
      await legacyDispatch("POST","/api/payments/"+id+"/workflow",{action:"investigate"},ctx);
      await db.insight(id);
      await db.applyWorkflow(id,"simulate",{actor});
      await legacyDispatch("POST","/api/payments/"+id+"/workflow",{action:"execute"},ctx);
      await legacyDispatch("POST","/api/payments/"+id+"/workflow",{action:"verify"},ctx);
    }else{
      await legacyDispatch("POST","/api/payments/"+id+"/workflow",{action:"run_case"},ctx);
      await db.passport(id);
    }
    const saved=await db.getPayment(id);run[mode].samples.push({processingMs:Number((performance.now()-start).toFixed(3)),outcome:saved.workflow.status,reference:saved.paymentReference});
   }
   if(["manual","controlled"].some(mode=>run[mode].samples.some(sample=>sample.outcome!=="verified")))return error(409,"The comparison was not saved because both paths must reach verified closure. Inspect the fixture outcomes before trying again.");
   for(const mode of ["manual","controlled"])run[mode].meanProcessingMs=Number((run[mode].samples.reduce((n,s)=>n+s.processingMs,0)/repetitions).toFixed(3));
   return {status:201,body:await db.saveBenchmark(run)};
  }
  if(method==="POST"&&pathname.startsWith("/api/demo/scenarios/")&&!allowed("create"))return error(403,"Your account cannot create synthetic operational fixtures.");
  if(method==="POST"&&pathname==="/api/payments"&&body?.exceptionType&&!allowed("create"))return error(session?403:401,"Legacy fixtures require an authorised operations account.");
  if(method==="POST"&&pathname.match(/^\/api\/cases\/[^/]+\/(analyze|review|customer-draft)$/)){
   const grant=pathname.endsWith("/review")?"review":pathname.endsWith("/analyze")?"investigate":"request";
   if(!allowed(grant))return error(403,"Your role cannot perform this case action.");
  }
  return legacyDispatch(method,path,body,{...context,actor});
 };
}
