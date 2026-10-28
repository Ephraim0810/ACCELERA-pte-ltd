import { createHash, randomUUID } from "node:crypto";
import { groundedAnalysis, challengeEvidence, clearMatch } from "./evidence.mjs";

export const SCENARIOS = {
  recovery:{title:"Recover the missing confirmation",subtitle:"Request evidence through a scoped recipient portal, validate it and resume safely.",kind:"Smart Recovery Loop",profile:"status"},
  risk_flag:{title:"Escalate an unresolved risk restriction",subtitle:"A stored risk-monitor flag blocks automatic recovery until authorised review.",kind:"Risk exception",profile:"status"},
  evidence_conflict:{title:"Challenge a tempting retry recommendation",subtitle:"A failed event and possible completion disagree. Programmatic checks stop the proposal.",kind:"Evidence Challenger",profile:"status"},
  status_changed:{title:"Catch a plan overtaken by new status",subtitle:"A later status update invalidates the original action before it can execute.",kind:"SafeReplay",profile:"status"},
  normal: {title:"A payment recorded correctly", subtitle:"See why routine records bypass exception investigation.", kind:"Routine path", profile:"none"},
  status: {title:"Resolve a stale enquiry status", subtitle:"Match final confirmation, update the internal case and verify the saved result.", kind:"Automatic resolution", profile:"status"},
  waiting: {title:"Wait for the missing confirmation", subtitle:"Ask the precise question, keep the case open and resume when evidence arrives.", kind:"Evidence & resume", profile:"status"},
  allocation: {title:"Recover an authorised allocation", subtitle:"Restore an existing invoice split with approval and duplicate protection.", kind:"Human approval", profile:"allocation"},
  unrecognised_beneficiary: {title:"Verify an unfamiliar beneficiary",subtitle:"No stored reference is available. Ask for authorised confirmation without inventing a conflict.",kind:"Human handoff",profile:"manual"},
  conflict: {title:"Hand a conflicting case to a reviewer", subtitle:"A low-risk model suggestion cannot override conflicting beneficiary records.", kind:"Human handoff", profile:"manual"},
  false_ack: {title:"Catch an update that was not saved", subtitle:"An acknowledgement is not proof. Read-back catches the unchanged record.", kind:"Failure test", profile:"status"},
  missing_mandate: {title:"Block recovery without authority", subtitle:"Reviewer approval cannot create a missing allocation mandate.", kind:"Failure test", profile:"allocation"},
  already_applied: {title:"Recognise an allocation already applied", subtitle:"Verify the existing split without applying it a second time.", kind:"Duplicate protection", profile:"allocation"},
  mismatched_confirmation: {title:"Reject a mismatched confirmation", subtitle:"A different amount or reference is not evidence for this payment.", kind:"Failure test", profile:"status"},
  in_flight: {title:"Hold an attempt with an unknown outcome", subtitle:"Do not repeat a write while the previous attempt is unresolved.", kind:"Failure test", profile:"status"},
};
const clone = value => structuredClone(value);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function paymentSnapshot(p) {
  return {reference:p.paymentReference, customer:p.payerName||p.customerName, beneficiary:p.beneficiaryAccount||"", beneficiaryName:p.payeeName||"", country:p.bankCountry||"", amountMinor:Math.round(p.amount*100), currency:p.currency, rail:p.rail};
}
const bindingMatches = (e,s) => e && ["reference","customer","beneficiary","beneficiaryName","country","amountMinor","currency","rail"].every(k=>e[k]===s[k]);
const expires = item => !item?.validUntil || !Number.isFinite(Date.parse(item.validUntil)) || Date.parse(item.validUntil) <= Date.now();
const split = [{invoice:"INV-101",amountMinor:200000},{invoice:"INV-102",amountMinor:50000}];
export function createWorkflow(payment, scenario) {
  const selected = scenario || (payment.case?.exceptionType==="routine_payment" ? "normal" : payment.case?.exceptionType==="beneficiary_not_recognized" ? "unrecognised_beneficiary" : "conflict");
  if (!Object.hasOwn(SCENARIOS,selected)) throw Object.assign(new Error("Unknown synthetic scenario."),{status:422});
  const meta=SCENARIOS[selected], snapshot=paymentSnapshot(payment), now=new Date().toISOString();
  const expiry=new Date(Date.now()+86_400_000).toISOString();
  const target={enquiryStatus:"pending",allocations:[],unallocatedMinor:snapshot.amountMinor,invoices:split.map(a=>({invoice:a.invoice,outstandingMinor:a.amountMinor}))};
  const authority={id:"AUTH-"+snapshot.reference, ...snapshot, profile:meta.profile, allowedFields:meta.profile==="allocation"?["allocations","unallocatedMinor","invoices"]:["enquiryStatus"], validUntil:expiry, recoveryDelegation:meta.profile==="allocation"};
  const confirmation=meta.profile==="status"?{id:"CONF-"+snapshot.reference,...snapshot,finalStatus:"confirmed",authoritative:true,validUntil:expiry}:null;
  const mandate=meta.profile==="allocation"?{id:"MANDATE-"+snapshot.reference,...snapshot,split:clone(split),authorised:true,validUntil:expiry}:null;
  if(selected==="waiting") { /* final confirmation is deliberately absent until the simulator delivers it */ }
  if(selected==="mismatched_confirmation") confirmation.amountMinor+=100;
  if(selected==="already_applied"){target.allocations=clone(split);target.unallocatedMinor=0;target.invoices.forEach(i=>i.outstandingMinor=0);}
  const source={confirmation:selected==="waiting"?null:confirmation,mandate:selected==="missing_mandate"?null:mandate,authority,conflict:selected==="conflict"};
  if(selected==="recovery"){
    source.processorReceipt={...confirmation,id:"PROC-"+snapshot.reference,description:"Fictional processor receipt visible to the authorised recipient, not yet received by operations."};
    source.confirmation=null;source.currentStatus="unknown";source.statusVersion=1;
  }
  if(selected==="risk_flag")source.riskIndicators=[{id:"RISK-"+snapshot.reference,source:"Authorised synthetic risk monitor",active:true,restriction:"no_automated_recovery",category:"unusual_beneficiary_change",description:"A synthetic beneficiary-change alert remains unresolved. This is a risk indicator, not a finding that fraud occurred.",reference:snapshot.reference,occurredAt:now}];
  if(selected==="evidence_conflict"){
    source.confirmation={...confirmation,finalStatus:"rejected"};
    source.statusEvents=[{id:"FAILED-"+snapshot.reference,...snapshot,status:"rejected",authoritative:true,source:"Mock processor event log",occurredAt:now},{id:"POSSIBLE-"+snapshot.reference,...snapshot,status:"possible_completion",authoritative:true,source:"Mock settlement event log",occurredAt:now}];
  }
  if(selected==="status_changed"){source.currentStatus="confirmed";source.statusVersion=1;}
  return {version:1,scenario:selected,profile:meta.profile,title:meta.title,status:meta.profile==="none"?"not_required":"detected",investigationRequired:meta.profile!=="none",
    analysisMode:"not_run",analysis:null,createdAt:now,updatedAt:now,protected:snapshot,
    source,
    target,proposal:null,approval:null,attempts:selected==="in_flight"?[{id:randomUUID(),status:"unknown",createdAt:now}]:[],
    verification:null,question:null,takenOver:false,events:[{id:randomUUID(),type:meta.profile==="none"?"routine_recorded":"exception_detected",actor:"System",at:now,
      message:meta.profile==="none"?"Basic validation passed. The instruction was recorded. No exception investigation or model call was needed.":"A synthetic exception was detected. The payment instruction is protected; only the defined internal case action can be considered."}]};
}
function expected(w) {
  if(w.profile==="status") return {...clone(w.target),enquiryStatus:"confirmed"};
  if(w.profile==="allocation") return {enquiryStatus:w.target.enquiryStatus,allocations:clone(w.source.mandate?.split||[]),unallocatedMinor:0,invoices:w.target.invoices.map(i=>({invoice:i.invoice,outstandingMinor:0}))};
  return clone(w.target);
}
function contextOf(w,p) {return digest({protected:paymentSnapshot(p),source:w.source,target:w.target,profile:w.profile});}
function event(w,type,message,actor="Agent") {w.events.push({id:randomUUID(),type,message,actor,at:new Date().toISOString()});}
export function workflowChecks(w,p) {
  const checks=[];
  const add=(label,pass,reason,waiting=false)=>checks.push({label,pass,reason:pass?"Passed":reason,waiting:!pass&&waiting});
  add("Original instruction unchanged",equal(w.protected,paymentSnapshot(p)),"Protected payment fields no longer match the original instruction.");
  add("A supported action is defined",["status","allocation"].includes(w.profile),w.scenario==="unrecognised_beneficiary"?"No stored beneficiary reference is available. Obtain authorised beneficiary confirmation before choosing an action.":"This case needs a specialist decision; no automatic playbook applies.");
  const a=w.source.authority, s=w.protected;
  add("Action authority matches this record",bindingMatches(a,s)&&a.profile===w.profile&&!expires(a),"The mock action authority is absent, expired or does not match this payment.");
  add("Permitted fields only",equal(a?.allowedFields,w.profile==="allocation"?["allocations","unallocatedMinor","invoices"]:["enquiryStatus"]),"The authority does not permit the expected internal fields.");
  add("No unresolved prior attempt",!w.attempts.some(x=>["unknown","in_flight"].includes(x.status)),"The previous attempt has an unknown outcome. Reconcile it before any retry.",true);
  add("Source records are consistent",!w.source.conflict,"Conflicting beneficiary records require a human investigation.");
  if(w.profile==="status"){
    const c=w.source.confirmation;
    add("Final confirmation is available",Boolean(c),"Obtain final authoritative mock processor confirmation for "+s.reference+".",true);
    if(c){add("Confirmation exactly matches payment",bindingMatches(c,s)&&c.authoritative===true&&c.finalStatus==="confirmed","Confirmation must match the reference, customer, beneficiary, amount and currency.");
      add("Confirmation is current",!expires(c),"The available confirmation has expired; obtain current evidence.");}
    add("Enquiry status is eligible",["pending","confirmed"].includes(w.target.enquiryStatus),"The enquiry is no longer in an eligible state.");
  }
  if(w.profile==="allocation"){
    const m=w.source.mandate, allocations=w.target.allocations, already=Boolean(m)&&equal(allocations,m.split)&&w.target.unallocatedMinor===0&&w.target.invoices.every(i=>i.outstandingMinor===0);
    add("Existing allocation mandate is valid",Boolean(m)&&m.authorised===true&&bindingMatches(m,s)&&!expires(m),"An exact, current, existing allocation mandate is required. A reviewer cannot invent it.");
    add("Recovery delegation exists",a?.recoveryDelegation===true,"There is no delegated authority to recover this allocation.");
    add("Invoice split equals received amount",Boolean(m)&&m.split.length===2&&m.split.every(x=>Number.isSafeInteger(x.amountMinor)&&x.amountMinor>0)&&m.split.reduce((n,x)=>n+x.amountMinor,0)===s.amountMinor,"The authorised split must equal the received mock payment exactly.");
    add("Current balances and allocation match",already||(allocations.length===0&&w.target.unallocatedMinor===s.amountMinor&&Boolean(m)&&w.target.invoices.length===m.split.length&&w.target.invoices.every(i=>m.split.some(a=>a.invoice===i.invoice&&a.amountMinor===i.outstandingMinor))),"A partial, conflicting or duplicate allocation needs reconciliation.");
  }
  if(w.source.currentStatus)add("Latest status remains eligible",w.source.currentStatus==="confirmed","The latest mock status is not confirmed; the previous plan cannot execute.",w.source.currentStatus==="unknown"&&!w.proposal);
  const challenged=challengeEvidence(w,p);
  add("Evidence Challenger supports the claims",challenged.passed,challenged.reasons.join(" "),challenged.waiting);
  return checks;
}
function refuse(message,status=409){throw Object.assign(new Error(message),{status});}
export function transitionWorkflow(input,payment,action,{note="",analysis=null,record=null}={}) {
  const w=clone(input);w.updatedAt=new Date().toISOString();w.version++;
  if(action==="accept_recovery"){
    if(w.scenario!=="recovery"||w.source.confirmation)refuse("This recovery case is not awaiting a new confirmation.");
    const received=record;
    if(!received||!bindingMatches(received,w.protected)||received.finalStatus!=="confirmed")refuse("Validated matching processor evidence is required.");
    w.source.confirmation=clone(received);w.source.currentStatus="confirmed";w.source.statusVersion=(w.source.statusVersion||1)+1;
    w.analysis=null;w.analysisMode="not_run";w.proposal=null;w.approval=null;w.simulation=null;w.question=null;w.status="detected";
    event(w,"recovery_response_validated","The scoped recipient supplied a response matching the saved processor receipt. New evidence is recorded; old proposals and approvals are invalidated.","System");return w;
  }
  if(action==="status_changed"){
    if(w.scenario!=="status_changed")refuse("This simulator event is not available for the selected case.");
    w.source.currentStatus="unknown";w.source.statusVersion=(w.source.statusVersion||1)+1;
    event(w,"payment_status_changed","The simulator recorded a newer unconfirmed status after the proposal. SafeReplay must reject the outdated plan.","System");return w;
  }
  if(["reject","request_information","escalate"].includes(action)){
    if(w.status==="not_required"||w.status==="verified")refuse("No open exception is available for this review decision.");
    if(typeof note!=="string"||note.trim().length<8)refuse("Record a specific reason for the reviewer decision.",422);
    w.status=action==="request_information"&&w.profile==="status"?"waiting":"manual";
    w.question=note.trim();w.proposal=null;w.approval=null;w.takenOver=action!=="request_information";
    w.reviewDecisions=[...(w.reviewDecisions||[]),{decision:action,note:note.trim(),at:w.updatedAt}];
    event(w,"reviewer_"+action,note.trim(),"Reviewer");return w;
  }
  if(action==="simulate"){
    if(!w.proposal||!["ready","review"].includes(w.status))refuse("Investigate a supported case before simulating its proposed correction.");
    const checks=workflowChecks(w,payment),approvalRequired=w.profile==="allocation"&&!w.proposal.noOp&&!w.approval;
    w.simulation={at:w.updatedAt,proposalId:w.proposal.id,context:contextOf(w,payment),before:clone(w.target),expected:clone(w.proposal.expected),checks,approvalRequired,permitted:checks.every(c=>c.pass)&&!approvalRequired&&w.proposal.context===contextOf(w,payment),fundsMoved:false};
    event(w,"safety_simulated","SafeReplay preview compared the proposed internal change with current evidence, authority, duplicate and policy checks. No target record changed.","System");return w;
  }
  if(action==="takeover"){
    if(w.status==="not_required"||w.status==="verified") refuse("This record has no open exception to take over.");
    w.takenOver=true;w.status="manual";w.question=w.question||"Review the linked evidence and determine the next permitted action.";
    event(w,"human_takeover","A reviewer took ownership. Automatic execution is paused.","Reviewer");return w;
  }
  if(action==="request_evidence"){
    if(w.status!=="waiting")refuse("This case is not waiting for evidence.");
    w.question="Provide final authoritative mock processor confirmation for "+w.protected.reference+", matching "+w.protected.currency+" "+(w.protected.amountMinor/100).toFixed(2)+" and beneficiary ending "+w.protected.beneficiary.slice(-4)+".";
    event(w,"evidence_requested",w.question,"Agent");return w;
  }
  if(action==="receive_evidence"){
    if(w.scenario!=="waiting"||w.source.confirmation)refuse("No outstanding simulator confirmation is available for this case.");
    w.source.confirmation={id:"CONF-"+w.protected.reference,...w.protected,finalStatus:"confirmed",authoritative:true,validUntil:new Date(Date.now()+86_400_000).toISOString()};
    w.proposal=null;w.approval=null;w.analysis=null;w.analysisMode="not_run";w.question=null;w.status=w.takenOver?"manual":"detected";
    event(w,"evidence_received","The simulator supplied an exact final confirmation. The previous proposal and approval were invalidated.","System");return w;
  }
  if(action==="investigate"){
    if(["verified","not_required","executed","verification_failed"].includes(w.status))refuse("Investigation is not available in the current state.");
    w.analysis=groundedAnalysis(analysis,w,payment);w.analysisMode=analysis?.provider==="groq"?"live_ai":"offline_walkthrough";
    w.challenger=challengeEvidence(w,payment,w.analysis);w.clearMatch=clearMatch(w,payment);
    const checks=workflowChecks(w,payment), failed=checks.filter(c=>!c.pass);
    w.checks=checks;w.proposal=null;w.approval=null;
    if(w.takenOver){w.status="manual";}
    else if(failed.length){w.status=failed.some(x=>!x.waiting)?"manual":"waiting";w.question=failed.map(x=>x.reason).join(" ");}
    else if(["uncertain","high"].includes(analysis?.riskRecommendation)){w.status="manual";w.question="The advisory investigator raised an additional concern. A reviewer must inspect it alongside the linked source evidence: "+String(analysis.summary||"Uncertainty remains.").slice(0,600);}
    else {
      const noOp=equal(w.target,expected(w));
      w.proposal={id:randomUUID(),context:contextOf(w,payment),expected:expected(w),noOp,allowedFields:clone(w.source.authority.allowedFields),createdAt:w.updatedAt};
      w.status=w.profile==="allocation"&&!noOp?"review":"ready";w.question=null;
    }
    event(w,"investigation_completed",w.status==="ready"?"Evidence and authority checks passed. A permitted internal update is ready.":w.status==="review"?"The existing allocation mandate matches. Reviewer approval is required before recovery.":w.question||"A reviewer owns the case.");
    return w;
  }
  if(action==="approve"){
    if(w.status!=="review"||!w.proposal||w.takenOver)refuse("Approval is unavailable until all evidence and authority checks pass.");
    if(workflowChecks(w,payment).some(c=>!c.pass)||w.proposal.context!==contextOf(w,payment))refuse("Evidence or authority changed. Investigate again before approval.");
    if(typeof note!=="string"||note.trim().length<8)refuse("Record a short reason explaining the approval.",422);
    w.approval={proposalId:w.proposal.id,context:w.proposal.context,actor:"Reviewer",note:note.trim().slice(0,500),at:w.updatedAt};w.status="ready";
    event(w,"reviewer_approved","Approved the exact existing mandate for recovery. "+w.approval.note,"Reviewer");return w;
  }
  if(action==="execute"){
    if(w.status==="verified"||w.status==="executed"){event(w,"duplicate_prevented","The same action is already recorded. No second update was applied.","System");return w;}
    if(w.status!=="ready"||w.takenOver||!w.proposal)refuse("Execution is blocked. Resolve the evidence, authority or review requirement first.");
    const checks=workflowChecks(w,payment);
    w.simulation={at:w.updatedAt,proposalId:w.proposal.id,context:contextOf(w,payment),before:clone(w.target),expected:clone(w.proposal.expected),checks,approvalRequired:false,permitted:checks.every(c=>c.pass)&&w.proposal.context===contextOf(w,payment),fundsMoved:false};
    if(checks.some(c=>!c.pass)||w.proposal.context!==contextOf(w,payment))refuse("Current records no longer match the approved proposal. Investigate again.");
    if(w.profile==="allocation"&&!w.proposal.noOp&&(!w.approval||w.approval.proposalId!==w.proposal.id||w.approval.context!==w.proposal.context))refuse("Approval for this exact allocation proposal is required.");
    if(w.proposal.noOp){w.status="executed";event(w,"already_applied","The exact expected record is already present. No write was repeated.","System");return w;}
    const attempt={id:randomUUID(),key:digest({payment:payment.id,proposal:w.proposal.context}),status:"acknowledged",createdAt:w.updatedAt};
    w.attempts.push(attempt);
    if(w.scenario!=="false_ack")w.target=clone(w.proposal.expected);
    w.status="executed";event(w,"action_executed",w.profile==="allocation"?"The existing authorised allocation was written to mock records. Read-back verification is still required.":"The mock action service acknowledged the enquiry update. Read-back verification is still required.","System");return w;
  }
  if(action==="verify"){
    if(w.status==="verified"){event(w,"verification_repeated","The previously verified outcome remains recorded.","System");return w;}
    if(w.status!=="executed"||!w.proposal)refuse("Execute or recognise the permitted action before verifying its outcome.");
    const unchanged=equal(w.protected,paymentSnapshot(payment)), matches=equal(w.target,w.proposal.expected);
    const checks=workflowChecks(w,payment), valid=checks.every(c=>c.pass);
    w.verification={at:w.updatedAt,expected:clone(w.proposal.expected),actual:clone(w.target),protectedFieldsUnchanged:unchanged,matches,authorityValid:valid,verified:unchanged&&matches&&valid};
    w.status=w.verification.verified?"verified":"verification_failed";
    w.attempts.forEach(a=>{if(a.status==="acknowledged")a.status=w.verification.verified?"verified":"unknown";});
    event(w,w.status==="verified"?"verified":"verification_failed",w.status==="verified"?"Saved mock records match the expected outcome and protected payment fields are unchanged. The operational case is closed.":"Read-back did not establish the expected outcome. The case remains open; no blind retry is allowed.","System");
    return w;
  }
  refuse("Unknown workflow action.",422);
}
