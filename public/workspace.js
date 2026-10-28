import {$,$$,esc,icon,api,notice,when,money,labels,badge,shell,guide,roles,loadGuidedRecords} from "/shared.js";
import {mountCaseUpgrade,identity,overviewUpgrade,mountBenchmark,openRecoveryTab} from "/upgrade-ui.js";
let currentPermissions=[];
const params=new URLSearchParams(location.search);
const view=location.pathname==="/admin"?"outcomes":location.pathname==="/overview"?"overview":params.get("view")==="payments"?"payments":"cases";
let items=[],allItems=[],metrics={},scenarios={},selected=params.get("id"),filter="all",query="",activeCase=null,loadGeneration=0;
shell(view);
const pageTitle=(eyebrow,title,description,action="")=>'<div class="page-heading"><div><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p>'+description+'</p></div>'+action+'</div>';
const stat=(title,value,note,i)=>'<article class="stat-card"><div class="stat-top"><small>'+title+'</small>'+icon(i)+'</div><strong>'+esc(value??"—")+'</strong><p>'+note+'</p></article>';
const errorState=message=>'<div class="empty-state">'+icon("refresh")+'<h2>Let’s reconnect.</h2><p>'+esc(message)+'</p><div class="button-row"><button class="button primary" id="retry">Try again</button><a class="button secondary" href="/login">Sign in</a></div></div>';
async function load(){
 const generation=++loadGeneration;
 try{
 const [m,s,p]=await Promise.all([api("/api/workflow/metrics"),api("/api/demo/scenarios"),loadGuidedRecords()]);
 if(generation!==loadGeneration)return;
 metrics=m;scenarios=s;allItems=p.filter(x=>x.workflow);
 if(view==="overview")renderOverview();
 else if(view==="outcomes"){renderOutcomes();$("#content").insertAdjacentHTML("beforeend",'<div id="benchmarkPanel"></div>');await mountBenchmark(currentPermissions);}
 else renderQueue();
 }catch(e){$("#content").innerHTML=errorState(e.message);$("#retry").onclick=load;}
}
function scenarioCard(key,i){
 const s=scenarios[key];return '<article class="scenario-card"><div class="scenario-top"><span class="scenario-number">'+String(i+1).padStart(2,"0")+'</span><span class="scenario-kind">'+esc(s.kind)+'</span></div><h3>'+esc(s.title)+'</h3><p>'+esc(s.subtitle)+'</p><button class="button" data-scenario="'+esc(key)+'">Open guided scenario '+icon("arrow")+'</button></article>';
}
function renderOverview(){
 const primary=["recovery","risk_flag","evidence_conflict","status_changed","allocation","normal"],advanced=["status","waiting","conflict","false_ack","missing_mandate","already_applied","mismatched_confirmation","in_flight"];
 $("#content").innerHTML='<section class="hero"><div><div class="eyebrow">ACCELERA / INTELLIGENT OPERATIONS</div><h1>Investigate intelligently.<br>Resolve with proof.</h1><p>Recover the missing evidence. Challenge the conclusion. Complete the permitted action and verify its saved outcome.</p><div class="button-row"><button class="button primary" data-scenario="recovery">Explore Smart Recovery '+icon("arrow")+'</button><a class="text-link" href="/payment">Start with a payment '+icon("arrow")+'</a></div></div><div class="hero-diagram"><div class="hero-node">'+icon("file")+'<div><b>A case is still pending</b><small>What is missing, and what can we do?</small></div></div><div class="hero-node">'+icon("layers")+'<div><b>Evidence → permission → action</b><small>One connected operational workflow</small></div></div><div class="hero-node">'+icon("check")+'<div><b>Saved outcome verified</b><small>Then, and only then, close the case.</small></div></div></div></section>'+
 '<div class="stat-grid">'+stat("Guided records",metrics.total,"Synthetic records you have created","layers")+stat("Verified resolutions",metrics.verified,"Read-back checks passed","check")+stat("Waiting for evidence",metrics.waiting,"Cases held open with a question","clock")+stat("Human attention",metrics.human,"Review or specialist handling","user")+'</div>'+
 guide("START HERE","Pick a scenario. Follow the evidence.","Each guided scenario creates a new fictional record. You control the next steps and can inspect what actually changed. The labels distinguish ordinary processing, a permitted update and a case that must remain open.")+
 '<div class="section-heading"><div><h2>See how Accelera works.</h2><p>Six journeys through the same controlled workflow.</p></div><small>LABELLED SYNTHETIC SCENARIOS</small></div><div class="scenario-grid">'+primary.map(scenarioCard).join('')+'</div><details class="advanced"><summary>Explore more working scenarios <span>8 scenarios +</span></summary><div class="scenario-grid">'+advanced.map((k,i)=>scenarioCard(k,i+6)).join('')+'</div>'+
 '<div class="section-heading"><div><h2>Five roles. One connected case.</h2><p>Each responsibility stays visible from detection to measurement.</p></div></div><div class="role-strip">'+Object.entries(roles).map(([role,text],i)=>'<div class="role-item"><small>0'+(i+1)+'</small><b>'+role+'</b><p>'+text+'</p></div>').join('')+'</div><p class="caption">Backend accounts enforce investigation, execution, review and read-only authority. An administrator can demonstrate the complete synthetic workflow.</p>';
 $("#content").insertAdjacentHTML("beforeend",overviewUpgrade(metrics));
}
const priorities={verification_failed:10,manual:9,waiting:7,review:6,ready:5,executed:8,detected:4,verified:0,not_required:-1};
function filteredItems(){
 return allItems.filter(x=>view==="payments"||x.workflow.investigationRequired).filter(x=>filter==="all"||(
 filter==="open"?!["verified","not_required"].includes(x.workflow.status):
 filter==="human"?["review","manual","verification_failed"].includes(x.workflow.status):
 filter==="waiting"?x.workflow.status==="waiting":filter==="verified"?x.workflow.status==="verified":true))
 .filter(x=>[x.paymentReference,x.workflow.title,x.payerName,x.payeeName].join(" ").toLowerCase().includes(query.toLowerCase()))
 .sort((a,b)=>(priorities[b.workflow.status]-priorities[a.workflow.status])||a.createdAt.localeCompare(b.createdAt));
}
function applyRolePermissions(){
 const map={run_case:"execute",investigate:"investigate",execute:"execute",verify:"verify",approve:"review",simulate:"simulate",takeover:"review",request_evidence:"request",receive_evidence:"fixtures"};
 $$("#casePanel [data-action]").forEach(b=>{if(map[b.dataset.action]&&!currentPermissions.includes(map[b.dataset.action])){b.disabled=true;b.title="Your authenticated role is not authorised for this action.";}});
}
function renderQueue(){
 $("#content").innerHTML=pageTitle(view==="payments"?"SYSTEM / SAVED RECORDS":"AGENT & REVIEWER / CASE WORKSPACE",view==="payments"?"Payments, clearly recorded.":"Turn evidence into resolution.",view==="payments"?"See which records needed investigation and which followed normal processing.":"Urgent and blocked cases stay visible. Readiness determines the next permitted action.",'<a class="button primary" href="/payment">'+icon("plus")+' Record payment</a>')+
 '<div class="queue-layout"><aside class="queue-sidebar"><div class="queue-title"><h2>'+(view==="payments"?"Guided payment records":"Exception queue")+'</h2><p>Urgency first. Oldest first within each state.</p></div><label class="search-field">'+icon("search")+'<input id="search" aria-label="Search guided records" placeholder="Search a reference, case or name" value="'+esc(query)+'"></label><div class="filter-row">'+[["all","All"],["open","Open"],["human","Human"],["waiting","Waiting"],["verified","Verified"]].map(([k,t])=>'<button data-filter="'+k+'" class="'+(filter===k?"active":"")+'">'+t+'</button>').join('')+'</div><div class="queue-sort"><span>PRIORITY & AGE</span><span id="queueCount"></span></div><div class="queue-list" id="queueList"></div><div class="queue-end">Saved mock records · Refresh to reload</div></aside><section class="case-panel" id="casePanel" aria-live="polite"></section></div>';
 $("#search").addEventListener("input",e=>{query=e.target.value;renderList();});
 renderList();
 if(!selected&&items.length)selected=items[0].id;
 if(selected)loadCase(selected);
 else $("#casePanel").innerHTML='<div class="empty-state">'+icon("file")+'<h2>Your next case starts here.</h2><p>Open a guided scenario to see evidence, permissions, actions and verification working together.</p><a class="button primary" href="/overview">Explore scenarios '+icon("arrow")+'</a></div>';
}
function renderList(){
 items=filteredItems();$("#queueCount").textContent=items.length+" RECORD"+(items.length===1?"":"S");
 $("#queueList").innerHTML=items.length?items.map(x=>'<button class="queue-record '+(x.id===selected?"active":"")+'" data-record="'+esc(x.id)+'"><span class="record-ref">'+esc(x.paymentReference)+'</span><strong>'+esc(x.workflow.title)+'</strong><span class="record-sub"><span>'+esc(money(Math.round(x.amount*100),x.currency))+'</span><span>'+esc(when(x.createdAt))+'</span></span>'+badge(x.workflow.status)+'</button>').join(''):'<div class="empty-state"><p>No matching records. Try another filter or open a guided scenario.</p></div>';
}
function stepper(w){
 const order=["Detect","Investigate","Authorise","Act","Verify"];
 const stage={not_required:0,detected:1,waiting:1,manual:1,review:2,ready:3,executed:4,verification_failed:4,verified:5}[w.status]??0;
 return '<div class="stepper" aria-label="Case progress">'+order.map((label,i)=>'<div class="step '+(stage>i?"done":stage===i?"active":"")+'"><i>'+(stage>i?"✓":i+1)+'</i><span>'+label+'</span></div>').join('')+'</div>';
}
const guideCopy={
 not_required:["NO EXCEPTION DETECTED","Recorded correctly. Investigation was not needed.","Standard validation matched the synthetic beneficiary reference. Accelera recorded the instruction and did not run an exception investigation or call the model. Recording does not establish settlement."],
 detected:["NEXT / INVESTIGATE","What is stopping this case from closing?","Start the investigation to connect the structured mock records, identify any missing evidence and determine whether a defined action is permitted."],
 ready:["NEXT / CONTROLLED ACTION","The evidence supports one permitted action.","The current records and action authority passed the defined checks. Review exactly what will change. Execution updates only the permitted internal mock record; verification is a separate step."],
 review:["NEXT / REVIEWER APPROVAL","Recover an existing decision, with approval.","The mandate defines the invoice split. The reviewer approves recovery of that exact allocation; they are not inventing a new allocation or changing the payment instruction."],
 waiting:["WAIT / A SPECIFIC ANSWER IS MISSING","Keep the case open. Ask the precise question.","An unresolved outcome is not a failure confirmation. Request the missing evidence and hold the case. The labelled simulator can deliver a matching confirmation so the workflow can resume."],
 manual:["HUMAN HANDOFF / CONTROL STAYS IN PLACE","A person needs to resolve the remaining question.","The evidence, completed checks and blocking reason are ready for review. Approval cannot override missing authority, conflicting records or an unknown outcome."],
 executed:["NEXT / READ BACK THE SAVED RESULT","The action was acknowledged. Is the outcome there?","Read back the persisted mock record and compare it with the expected result. An acknowledgement alone cannot close the case."],
 verification_failed:["STOP / VERIFICATION DID NOT PASS","The expected saved outcome was not established.","The case remains open. Do not blindly repeat the action. A reviewer must reconcile the existing attempt and inspect the actual records."],
 verified:["VERIFIED / OPERATIONAL CASE CLOSED","The saved record proves the expected outcome.","The read-back matched the permitted result and protected payment fields remained unchanged. This closes the defined operational case; it does not assert real-world settlement."]
};
function caseGuide(w){
 if(w.scenario==="status_changed"&&["detected","ready"].includes(w.status))return guide("CHANGED-STATUS FAILURE TEST","Prepare a plan, then challenge it with newer evidence.","Investigate first. Open SafeReplay, inspect the preview and simulate a changed payment status. Attempting the old update must stop when its evidence is no longer current.");
 const c=guideCopy[w.status]||guideCopy.manual;
 return guide(c[0],c[1],c[2]);
}
function caseCard(title,body,tag="",cls=""){
 return '<section class="case-card '+cls+'"><div class="card-title"><h3>'+title+'</h3><small>'+tag+'</small></div><div class="card-content">'+body+'</div></section>';
}
function facts(x,w){
 return '<dl class="fact-list"><dt>Original reference</dt><dd>'+esc(x.paymentReference)+'</dd><dt>Payer</dt><dd>'+esc(x.payerName)+'</dd><dt>Beneficiary</dt><dd>'+esc(x.payeeName)+'</dd><dt>Account</dt><dd>•••• '+esc(x.beneficiaryAccount.slice(-4)||"—")+'</dd><dt>Amount / currency</dt><dd>'+esc(money(w.protected.amountMinor,x.currency))+'</dd><dt>Instruction status</dt><dd>'+esc(x.paymentStatus==='processing'?'Recorded for mock processing':x.paymentStatus==='unknown'?'Final outcome unconfirmed':'Mock source: '+x.paymentStatus)+'</dd></dl>';
}
function sources(w){
 const c=w.source.confirmation,m=w.source.mandate,a=w.source.authority;
 const source=(label,title,description,id,missing=false)=>'<div class="source-card '+(missing?"missing":"")+'"><div class="eyebrow">'+label+'</div><h4>'+title+'</h4><p>'+esc(description)+'</p><span class="source-state">'+(missing?'Not established':'Available in mock records')+'</span><span class="source-id">'+esc(id||"No record supplied")+'</span></div>';
 let cards='';
 if(w.profile==="status")cards+=source("MOCK PROCESSOR",c?"Final confirmation":"Final confirmation missing",c?money(c.amountMinor,c.currency)+" · "+c.reference+" · status "+c.finalStatus:"A timeout did not establish the final outcome. No resubmission is permitted.",c?.id,!c);
 if(w.profile==="allocation")cards+=source("EXISTING INSTRUCTION",m?"Authorised invoice split":"Allocation mandate missing",m?m.split.map(x=>x.invoice+" "+money(x.amountMinor,m.currency)).join(" + "):"No authority exists to invent or recover an invoice split.",m?.id,!m);
 if(w.profile==="manual")cards+=w.scenario==="unrecognised_beneficiary"?source("REFERENCE GAP","Beneficiary reference unavailable","This account is not in the synthetic registry. No name mismatch has been established. Obtain authorised beneficiary confirmation.",null,true):source("CONFLICTING RECORDS","Beneficiary details disagree","The entered beneficiary name does not match the synthetic reference record. A specialist must investigate.","MOCK-REFERENCE-REGISTRY",true);
 cards+=source("ACTION AUTHORITY","Defined internal fields",w.profile==="allocation"?"Recover the existing authorised allocation, subject to current balances and reviewer approval.":"Update internal enquiryStatus only. Original payment instruction fields are protected.",a?.id,!a);
 return '<div class="detail-columns">'+cards+'</div><p class="caption">These are structured synthetic sources supplied by the scenario. They are not live bank records or independent confirmations from OCBC.</p>';
}
function checkList(w){
 if(!w.checks?.length)return '<div class="info-box">Run the investigation to see each evidence, authority and duplicate check. No check result is assumed.</div>';
 return '<div class="check-list">'+w.checks.map(c=>'<div class="check-row '+(!c.pass?"failed":"")+'"><span class="check-symbol">'+(c.pass?"✓":"!")+'</span><div><b>'+esc(c.label)+'</b>'+(!c.pass?'<p>'+esc(c.reason)+'</p>':'')+'</div></div>').join('')+'</div>';
}
function compare(w){
 if(w.profile==="status")return '<div class="compare"><div><small>Current saved enquiry</small><b>'+esc(w.target.enquiryStatus)+'</b><p>Internal record only</p></div>'+icon("arrow")+'<div><small>Expected after action</small><b>confirmed</b><p>From matching mock evidence</p></div></div>';
 if(w.profile==="allocation"){
  const target=w.target.allocations.length?w.target.allocations.map(a=>a.invoice+" "+money(a.amountMinor,w.protected.currency)).join(" + "):"Unallocated "+money(w.target.unallocatedMinor,w.protected.currency);
  const expected=w.source.mandate?.split.map(a=>a.invoice+" "+money(a.amountMinor,w.protected.currency)).join(" + ")||"No authorised split";
  return '<div class="compare"><div><small>Current saved record</small><b>'+esc(target)+'</b><p>No new invoice split is chosen</p></div>'+icon("arrow")+'<div><small>Existing authorised result</small><b>'+esc(expected)+'</b><p>Restore exactly this mandate</p></div></div>';
 }return '';
}
function actionArea(w){
 const btn=(a,text,cls="primary")=>'<button class="button '+cls+'" data-action="'+a+'">'+text+' '+icon(a==="verify"?"check":"arrow")+'</button>';
 let content='';
 if(w.status==="not_required")return '<div class="info-box success"><b>Payment recorded correctly.</b><br>Basic validation completed. Exception checks and model investigation did not run because no exception was detected.</div>';
 if(w.status==="detected")content='<div class="button-row">'+btn("run_case","Run controlled workflow")+btn("investigate","Guide me step by step","secondary")+'</div><p class="caption">The controlled run investigates, applies a permitted update and verifies its saved result. It pauses when evidence or reviewer approval is needed.</p>';
 if(w.status==="detected"&&w.scenario==="status_changed")content=btn("investigate","Investigate & prepare a plan")+'<p class="caption">Next, open SafeReplay to test what happens when the payment status changes after this plan.</p>';
 if(w.status==="waiting")content='<div class="info-box warning">'+esc(w.question||"The previous attempt needs reconciliation.")+'</div><div class="button-row">'+(w.scenario==="recovery"?'<button class="button primary" data-start-recovery>Open Smart Recovery Loop →</button>':w.scenario==="waiting"?btn("request_evidence","Record evidence request","secondary"):'')+btn("takeover","Hand to reviewer","secondary")+'</div>'+
 (w.scenario==="waiting"&&!w.source.confirmation?'<details class="advanced"><summary>SIMULATOR / Deliver missing evidence <span>+</span></summary><p class="caption">This control injects a fictional matching processor confirmation. It does not contact a bank or customer.</p>'+btn("receive_evidence","Simulate confirmation received","secondary")+'</details>':'');
 if(w.status==="manual"||w.status==="verification_failed")content='<div class="info-box '+(w.status==="verification_failed"?"error":"warning")+'">'+esc(w.status==="verification_failed"?"Read-back found no matching saved outcome. The existing attempt is now unresolved.":w.question||"This case needs human judgement.")+'</div><p class="action-explainer">The handoff includes the original record, available evidence and blocking checks. A human can investigate; this prototype cannot bypass the action controls.</p>'+(w.takenOver?'<div class="badge manual">Reviewer owns this case</div>':btn("takeover","Take ownership as reviewer","secondary"));
 if(w.status==="review")content=compare(w)+'<label class="field">Approval note<textarea id="approvalNote" minlength="8" maxlength="500" rows="2" placeholder="Explain how you checked the existing mandate and recovery authority."></textarea><small>Approval is bound to this exact proposal. It cannot create missing authority.</small></label>'+btn("approve","Approve this exact recovery");
 if(w.status==="ready")content=compare(w)+'<div class="info-box"><b>Permitted fields:</b> '+esc(w.proposal?.allowedFields.join(", ")||"None")+'. Original instruction fields remain unchanged.</div>'+btn("execute",w.proposal?.noOp?"Recognise the existing result":"Apply permitted mock update");
 if(w.status==="executed")content=compare(w)+'<p class="action-explainer">The action step is recorded, but the case is still open. Verification must read the saved record and check the protected instruction.</p>'+btn("verify","Read back & verify outcome");
 if(w.status==="verified")content='<div class="info-box success"><b>Verified against saved records.</b><br>The expected outcome is present. Original payment fields are unchanged. This defined operational case is closed.</div>'+compare(w)+btn("execute","Test duplicate protection","secondary");
 return content+'<div id="actionError" class="form-error" role="alert" hidden></div><p class="action-footnote">Only synthetic internal records can change. No money movement or payment resubmission.</p>';
}
function timeline(w){
 return '<div class="timeline">'+w.events.slice().reverse().map(e=>'<article class="timeline-event"><b>'+esc(e.type.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()))+'</b><p>'+esc(e.message)+'</p><small>'+esc(e.actor)+' · '+esc(when(e.at))+'</small></article>').join('')+'</div>';
}
function analysis(w){
 if(w.analysisMode==="not_run")return '<div class="info-box">Investigation has not run. No AI result or confidence score is implied.</div>';
 const a=w.analysis||{},live=w.analysisMode==="live_ai";
 return '<div class="info-box">'+(live?'<b>Live AI advisory investigation</b><br>':'<b>Offline deterministic walkthrough</b><br>')+(live?'The configured model returned an explanation. Structured source checks still govern every action.':'No usable live AI result was used. The workflow uses the supplied synthetic evidence and deterministic checks.')+'</div>'+(live?'<p class="action-explainer">'+esc(a.summary||"No summary was returned.")+'</p>':'')+
 '<p class="caption">AI can explain evidence and uncertainty. It cannot grant authority, override a missing confirmation or decide that an unverified action succeeded.</p>';
}
async function loadCase(id){
 selected=id;renderList();$("#casePanel").innerHTML='<div class="skeleton"><span></span><span></span><p>Reading saved case…</p></div>';
 try{
 const x=await api("/api/payments/"+encodeURIComponent(id));if(selected!==id)return;activeCase=x;const w=x.workflow;
 if(!w){$("#casePanel").innerHTML='<div class="empty-state"><h2>Reference sample</h2><p>This legacy synthetic sample has no guided execution contract. Open a guided scenario to explore the full workflow.</p><a class="button primary" href="/overview">Open scenarios</a></div>';return;}
 const url=new URL(location.href);url.searchParams.set("id",id);history.replaceState(null,"",url);
 $("#casePanel").innerHTML='<div class="case-header"><div class="case-header-top"><span class="eyebrow">'+(w.status==="not_required"?"SAVED PAYMENT RECORD":w.profile==="allocation"?"EXISTING AUTHORISED ALLOCATION":"INTERNAL PAYMENT ENQUIRY")+'</span>'+badge(w.status)+'</div><span class="case-ref">'+esc(x.paymentReference)+'</span><h2>'+esc(w.title)+'</h2><p>'+esc(x.payerName)+' → '+esc(x.payeeName)+' · '+esc(money(w.protected.amountMinor,x.currency))+'</p></div>'+stepper(w)+caseGuide(w)+
 caseCard(w.status==="not_required"?"Recording result":"Your next permitted step",actionArea(w),"LIVE SAVED STATE","action-card")+
 caseCard("Original instruction",facts(x,w),"PROTECTED FIELDS")+
 (w.investigationRequired?caseCard("Linked evidence",sources(w),"SYNTHETIC SOURCES")+caseCard("Evidence & authority checks",checkList(w),"DETERMINISTIC CONTROLS")+caseCard("Investigation mode",analysis(w),w.analysisMode==="live_ai"?"AI ADVISORY":"TRANSPARENT MODE"):'')+
 (w.verification?caseCard("Read-back verification",'<div class="check-list"><div class="check-row '+(!w.verification.matches?"failed":"")+'"><span class="check-symbol">'+(w.verification.matches?"✓":"!")+'</span><div><b>Saved target matches expected outcome</b><p>'+esc(w.verification.matches?"The read-back comparison passed.":"The expected change was not present in the saved target.")+'</p></div></div><div class="check-row '+(!w.verification.protectedFieldsUnchanged?"failed":"")+'"><span class="check-symbol">'+(w.verification.protectedFieldsUnchanged?"✓":"!")+'</span><div><b>Original instruction unchanged</b><p>Reference, payer, beneficiary, amount, currency and rail were checked.</p></div></div></div>','PERSISTED RESULT'):'')+
 '<details class="case-card case-history" open><summary>Activity & decision history · '+w.events.length+' events</summary><div class="card-content">'+timeline(w)+'</div></details>'+
 (w.investigationRequired?'<details class="case-card case-history"><summary>Prepare an unsent evidence-request draft</summary><div class="card-content"><p class="caption">The draft is stored for review. No email, SMS or customer message is sent.</p><label class="field">Message<textarea id="messageDraft" rows="3" maxlength="1500">'+esc(w.question||"Please confirm the final processor outcome for "+x.paymentReference+" with matching reference, amount and beneficiary.")+'</textarea></label><button class="button secondary" data-save-draft>Save draft only</button><div id="draftResult" role="status"></div>'+(x.messages?.length?'<p class="caption">'+x.messages.length+' saved draft(s). Latest: '+esc(x.messages[0].message)+'</p>':'')+'</div></details>':'');
 if(w.investigationRequired){
  const zone=document.createElement("div");zone.id="upgradeZone";$("#casePanel .action-card").after(zone);
  const legacy=document.createElement("details");legacy.className="legacy-detail";legacy.innerHTML="<summary>Original instruction, source records and full activity</summary>";
  while(zone.nextSibling)legacy.append(zone.nextSibling);zone.after(legacy);
  await mountCaseUpgrade(x,currentPermissions,loadCase);
 }
 applyRolePermissions();
 }catch(e){if(selected!==id)return;$("#casePanel").innerHTML=errorState(e.message);$("#retry").onclick=()=>loadCase(id);}
}
function renderOutcomes(){
 $("#content").innerHTML=pageTitle("ADMINISTRATOR & PROCESS OWNER / OBSERVED OUTCOMES","Every action leaves evidence.","Inspect actual events from this prototype. Counts update from saved records; no bank performance or savings are assumed.",'<a class="button secondary" href="/transactions">Open cases '+icon("arrow")+'</a>')+
 '<div class="stat-grid">'+stat("Verified resolutions",metrics.verified,"Cases closed after read-back","check")+stat("False success caught",metrics.falseAcknowledgementsCaught,"Acknowledged updates that failed verification","shield")+stat("Duplicate protection",metrics.duplicateWritesPrevented,"Repeat writes avoided or existing results recognised","layers")+stat("Waiting / human",metrics.waiting+" / "+metrics.human,"Open cases requiring another step","user")+'</div>'+
 guide("HOW TO READ THESE NUMBERS","Measured here, in this prototype.","These are recorded scenario outcomes, not a benchmark of OCBC. The observed resolution duration includes your clicks and any waiting; it is not active handling time or a demonstrated bank time saving.")+
 '<div class="split-grid"><section class="panel"><div class="panel-head"><div><h2>Workspace outcomes</h2><p>Actual guided records only</p></div>'+icon("grid")+'</div><div class="panel-body"><dl class="fact-list"><dt>Total guided records</dt><dd>'+metrics.total+'</dd><dt>No investigation needed</dt><dd>'+metrics.routine+'</dd><dt>Operational exceptions</dt><dd>'+metrics.exceptions+'</dd><dt>Live AI investigations</dt><dd>'+metrics.modelInvestigations+'</dd><dt>Offline walkthroughs</dt><dd>'+metrics.offlineInvestigations+'</dd><dt>Mean observed resolution</dt><dd>'+(metrics.averageObservedResolutionSeconds===null?'No verified cases yet':metrics.averageObservedResolutionSeconds+' seconds')+'</dd></dl></div><div class="metrics-note">Observed case duration includes clicks and waiting. The separate comparison below measures only scripted server processing.</div></section><section class="panel"><div class="panel-head"><div><h2>What the controls protect</h2><p>Defined mock workflow boundaries</p></div>'+icon("shield")+'</div><div class="panel-body"><div class="check-list">'+["Original payment instructions stay protected","Missing evidence keeps the case open","Existing mandate required for allocation","Approval is bound to the exact proposal","Saved outcome verified before closure"].map(t=>'<div class="check-row"><span class="check-symbol">✓</span><b>'+t+'</b></div>').join('')+'</div></div></section></div>'+
 '<div class="section-heading"><div><h2>Action & decision log</h2><p>Who acted, what happened and when. Most recent first.</p></div><small>'+metrics.events.length+' SAVED EVENTS</small></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Time · SGT</th><th>Reference</th><th>Role</th><th>Event</th><th>Explanation</th></tr></thead><tbody>'+metrics.events.slice(0,250).map(e=>'<tr><td>'+esc(when(e.at))+'</td><td>'+esc(e.reference)+'</td><td>'+esc(e.actor)+'</td><td>'+esc(e.type.replaceAll("_"," "))+'</td><td class="audit-message">'+esc(e.message)+'</td></tr>').join('')+'</tbody></table>'+(metrics.events.length?'':'<div class="empty-state"><p>No recorded actions yet. Start a guided scenario.</p><a class="button primary" href="/overview">Explore scenarios</a></div>')+'</div></section>';
}
$("#content").addEventListener("click",async e=>{
 if(e.target.closest("[data-start-recovery]")){openRecoveryTab();return;}
 const s=e.target.closest("[data-scenario]");if(s){s.disabled=true;const old=s.innerHTML;s.textContent="Creating synthetic case…";try{const x=await api("/api/demo/scenarios/"+s.dataset.scenario,{method:"POST",body:"{}"});location.href="/transactions?"+(x.workflow.status==="not_required"?"view=payments&":"")+"id="+encodeURIComponent(x.id);}catch(err){notice(err.message,"error");s.disabled=false;s.innerHTML=old;}return;}
 const r=e.target.closest("[data-record]");if(r){loadCase(r.dataset.record);return;}
 const f=e.target.closest("[data-filter]");if(f){filter=f.dataset.filter;$$("[data-filter]").forEach(b=>b.classList.toggle("active",b===f));renderList();return;}
 const a=e.target.closest("[data-action]");if(a){
 const actionCaseId=selected,action=a.dataset.action,note=$("#approvalNote")?.value||"";
 const buttons=$$("[data-action]");buttons.forEach(b=>b.disabled=true);const old=a.innerHTML;a.textContent=["investigate","run_case"].includes(action)?"Investigating evidence…":"Saving & checking…";
 try{await api("/api/payments/"+actionCaseId+"/workflow",{method:"POST",body:JSON.stringify({action,note})});notice({simulate:"SafeReplay preview saved. No target changed.",run_case:"Controlled run saved. Inspect the outcome and audit trail.",investigate:"Investigation saved. Review the next step.",execute:"Action recorded. Check the saved outcome.",verify:"Verification result saved.",approve:"Approval recorded for this exact proposal.",receive_evidence:"Matching synthetic confirmation received.",request_evidence:"Specific evidence request recorded.",takeover:"Reviewer ownership recorded."}[action]);const [m,p]=await Promise.all([api("/api/workflow/metrics"),loadGuidedRecords()]);metrics=m;allItems=p.filter(x=>x.workflow);if(selected===actionCaseId)await loadCase(actionCaseId);else renderList();}
 catch(err){const box=selected===actionCaseId?$("#actionError"):null;if(box){box.hidden=false;box.textContent=err.message;}notice(err.message,"error");}
 finally{if(a.isConnected){a.innerHTML=old;buttons.forEach(b=>b.disabled=false);}}return;
 }
 const d=e.target.closest("[data-save-draft]");if(d){d.disabled=true;try{await api("/api/payments/"+selected+"/message",{method:"POST",body:JSON.stringify({message:$("#messageDraft").value})});$("#draftResult").innerHTML='<div class="info-box success">Draft saved. No message was sent.</div>';}catch(err){notice(err.message,"error");}finally{d.disabled=false;}}
});
$("#refresh").onclick=load;
api("/api/demo/session").then(s=>{if(!s.authenticated){location.replace("/login?next="+encodeURIComponent(location.pathname+location.search));return;}currentPermissions=s.permissions||[];identity(s);load();}).catch(e=>{$("#content").innerHTML=errorState(e.message);$("#retry").onclick=load;});
