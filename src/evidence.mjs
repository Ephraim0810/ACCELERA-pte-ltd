import {createHash} from "node:crypto";
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evidenceRecords(w,p){
 const s=w.protected,records=[
 {id:"PAY-"+p.id,type:"payment_instruction",source:"Saved payment instruction",authoritative:true,description:"Protected original instruction in the payment database.",data:{reference:s.reference,customer:s.customer,beneficiary:s.beneficiary,amountMinor:s.amountMinor,currency:s.currency,rail:s.rail}},
 {id:"ENQ-"+p.id,type:"enquiry_snapshot",source:"Original enquiry snapshot",authoritative:true,description:"The enquiry state observed when this synthetic case was opened.",data:{reference:s.reference,enquiryStatus:"pending"}}
 ];
 const add=(record,type,source)=>{if(record)records.push({id:record.id,type,source,authoritative:record.authoritative!==false,description:record.description||source,data:structuredClone(record)});};
 if(w.source.processorReceipt&&!w.source.confirmation)add({...w.source.processorReceipt,authoritative:false,description:"Scenario fixture held by the recipient; not received or admitted as operations confirmation."},"recipient_receipt_not_received","Recipient fixture · not admitted as confirmation");
 add(w.source.confirmation,"processor_confirmation","Mock processor confirmation received");
 add(w.source.authority,"action_authority","Configured synthetic operations authority");
 add(w.source.mandate,"allocation_mandate","Existing authorised allocation mandate");
 for(const e of w.source.statusEvents||[])add(e,"status_event",e.source||"Authorised synthetic event log");
 for(const r of w.source.riskIndicators||[])add(r,"risk_indicator",r.source||"Authorised synthetic risk monitor");
 if(w.source.currentStatus)add({id:"CURRENT-"+p.id,status:w.source.currentStatus,version:w.source.statusVersion||1,reference:s.reference},"latest_status","Latest saved mock status");
 return records;
}
export function evidenceDigest(w,p){return hash(evidenceRecords(w,p).filter(r=>r.type!=="enquiry_snapshot"));}
export function clearMatch(w,p,related=[]){
 const instruction=evidenceRecords(w,p).find(e=>e.type==="payment_instruction");
 const sources=evidenceRecords(w,p).filter(r=>["processor_confirmation","status_event","allocation_mandate"].includes(r.type));
 const keys=["reference","amountMinor","currency","beneficiary"];
 const rows=sources.map(r=>{
  const fields=keys.map(key=>({field:key,expected:instruction.data[key],actual:r.data[key],matches:r.data[key]===instruction.data[key]}));
  return {recordId:r.id,source:r.source,classification:fields.every(f=>f.matches)?"exact_binding":"discrepancy",fields,reason:fields.every(f=>f.matches)?"Exact reference, amount, currency and beneficiary binding.":fields.filter(f=>!f.matches).map(f=>f.field+" differs or is missing").join("; ")};
 });
 return {method:"Exact field binding; shared payer or amount alone is only a search candidate.",records:rows,candidates:related.map(r=>({id:r.id,reference:r.paymentReference,amountMinor:Math.round(r.amount*100),currency:r.currency,classification:"candidate_only",reason:"Shares a payer or beneficiary reference; this alone does not establish a match."}))};
}
export function groundedAnalysis(model,w,p){
 const records=evidenceRecords(w,p),provider=model?.provider||"demo_fallback";
 const result={...(model||{}),provider,evidenceDigest:model?.evidenceDigest||evidenceDigest(w,p)};
 if(provider!=="groq"){
  result.claims=[{id:"amount",kind:"payment_amount",value:w.protected.amountMinor,evidenceIds:["PAY-"+p.id]},{id:"currency",kind:"payment_currency",value:w.protected.currency,evidenceIds:["PAY-"+p.id]}];
  if(w.source.confirmation)result.claims.push({id:"status",kind:"payment_status",value:w.source.confirmation.finalStatus,evidenceIds:[w.source.confirmation.id]});
  if(w.scenario==="evidence_conflict"){
   const rejected=(w.source.statusEvents||[]).find(r=>r.status==="rejected");
   result.claims.push({id:"fixture-status-claim",kind:"payment_status",value:"rejected",evidenceIds:[rejected.id]});
   result.fixtureRecommendation=true;result.proposedAction="resubmit_payment";
   result.summary="Failure-test recommendation: a rejected event suggests a retry. The Challenger must also consider the separate possible-completion event. This is an injected test proposal, not a live model result.";
  }else result.summary=w.source.confirmation?"The received confirmation can be compared with the original instruction. An internal update is eligible only if all authority, risk and current-state checks pass.":"The final processor outcome is not established by the evidence received. Request the exact matching confirmation and keep the case open.";
  result.hypotheses=[...(Array.isArray(model?.uncertainties)?model.uncertainties:[])].slice(0,8);
 }
 result.evidenceReferences=records.map(r=>r.id);
 return result;
}
export function challengeEvidence(w,p,analysis=w.analysis){
 const records=evidenceRecords(w,p),byId=new Map(records.map(r=>[r.id,r]));
 const model=analysis?(!Array.isArray(analysis.claims)&&analysis.provider!=="groq"?groundedAnalysis(analysis,w,p):analysis):groundedAnalysis(null,w,p);
 const raw=Array.isArray(model.claims)?model.claims.slice(0,16):[];
 const statusRecords=records.filter(r=>["processor_confirmation","status_event","latest_status"].includes(r.type));
 const statuses=statusRecords.map(r=>r.data.finalStatus||r.data.status);
 const conflict=(statuses.includes("rejected")&&(statuses.includes("confirmed")||statuses.includes("possible_completion")))||w.source.conflict===true;
 const claims=raw.map((c,i)=>{
  const ids=Array.isArray(c.evidenceIds)?c.evidenceIds.filter(x=>typeof x==="string").slice(0,10):[];
  const cited=ids.map(id=>byId.get(id)).filter(Boolean);
  let supported=false;
  if(c.kind==="payment_amount")supported=cited.some(r=>r.type==="payment_instruction"&&r.data.amountMinor===c.value);
  if(c.kind==="payment_currency")supported=cited.some(r=>r.type==="payment_instruction"&&r.data.currency===c.value);
  if(c.kind==="beneficiary_account")supported=cited.some(r=>r.type==="payment_instruction"&&r.data.beneficiary===c.value);
  if(c.kind==="payment_status")supported=cited.some(r=>["processor_confirmation","status_event","latest_status"].includes(r.type)&&(r.data.finalStatus||r.data.status)===c.value);
  if(c.kind==="allocation_mandate")supported=c.value===true&&cited.some(r=>r.type==="allocation_mandate"&&r.data.authorised===true);
  const contradicted=c.kind==="payment_status"&&conflict;
  return {id:String(c.id||"claim-"+i),kind:String(c.kind||"untyped"),value:c.value,evidenceIds:ids,status:contradicted?"contradicted":supported&&ids.length===cited.length?"verified":"unsupported",reason:contradicted?"Another authoritative record indicates a conflicting or possible completion state.":supported&&ids.length===cited.length?"The cited structured fields support this claim.":"No complete matching structured evidence supports this factual claim."};
 });
 if(!claims.length)claims.push({id:"missing-typed-claims",kind:"untyped",value:null,evidenceIds:[],status:"unsupported",reason:"No verifiable typed factual claims were returned. Narrative advice cannot authorise an action."});
 const risks=records.filter(r=>r.type==="risk_indicator"&&r.data.active===true&&r.data.restriction);
 const missing=w.profile==="status"&&!w.source.confirmation;
 const stale=Boolean(model.evidenceDigest&&model.evidenceDigest!==evidenceDigest(w,p));
 const unsupported=claims.some(c=>c.status!=="verified");
 const reasons=[];
 if(missing)reasons.push("Final authoritative processor confirmation has not been received.");
 if(conflict)reasons.push("Authoritative status or beneficiary records conflict. No resubmission is permitted.");
 if(risks.length)reasons.push("An unresolved risk-monitor restriction blocks automated recovery.");
 if(stale)reasons.push("The evidence changed after this recommendation. Investigate the current records again.");
 if(unsupported)reasons.push("One or more factual claims are unsupported or contradicted.");
 return {method:"Independent structured-record checks, not a second LLM.",at:new Date().toISOString(),passed:!missing&&!conflict&&!risks.length&&!stale&&!unsupported,waiting:missing&&!conflict&&!risks.length&&!stale&&!unsupported,claims,conflicts:conflict?statusRecords.map(r=>r.id):[],riskRestrictions:risks.map(r=>r.id),stale,reasons,evidenceDigest:evidenceDigest(w,p)};
}
