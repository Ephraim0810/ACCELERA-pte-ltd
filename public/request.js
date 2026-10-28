import {$,esc,brand,icon,money,when} from "/shared.js";
$("#portalBrand").innerHTML=brand;
const id=new URLSearchParams(location.search).get("id"),token=new URLSearchParams(location.hash.slice(1)).get("token");
let saved;
async function portal(path,body){
 const response=await fetch("/api/recovery/requests/"+encodeURIComponent(id)+(path||""),{method:body?"POST":"GET",credentials:"omit",headers:{"content-type":"application/json","x-request-token":token||""},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();return {ok:response.ok,status:response.status,data};
}
function validation(data,valid){
 const checks=data.validation?.checks||[];
 $("#portalStatus").innerHTML='<section class="request-validation"><span class="eyebrow">'+(valid?"RESPONSE SAVED & VALIDATED":"RESPONSE NOT ACCEPTED")+'</span><h2>'+(valid?"Your information matched the stored evidence.":"Some information needs correction.")+'</h2><p>'+esc(valid?(data.workflow.status==="verified"?"The operations workflow resumed, passed its evidence and safety checks, and verified the saved internal outcome.":"The response was recorded. Operations remains open because further checks or authorised review are required."): "No corrective action was authorised. Check the marked fields against your synthetic processor receipt.")+'</p><div class="check-list">'+checks.map(c=>'<div class="check-row '+(!c.pass?"failed":"")+'"><span class="check-symbol">'+(c.pass?"✓":"!")+'</span><div><b>'+esc(c.field)+'</b><p>'+esc(c.reason)+'</p></div></div>').join('')+'</div></section>';
 if(valid)$("#responseForm").hidden=true;
}
async function load(){
 try{
 if(!id||!token)throw Error("This page needs a valid request-scoped authorisation link.");
 const result=await portal("");if(!result.ok)throw Error(result.data.error||"This request is not available.");
 saved=result.data;const {request:r,sourceRecord:s,authorisation:a}=saved;
 $("#portalStatus").innerHTML='<div class="request-authorisation">'+icon("shield")+'<div><b>Authorised as '+esc(a.recipient)+'</b><small>Scope: this request only · expires '+esc(when(a.expiresAt))+' · operations records and actions are not available through this capability.</small></div></div>';
 $("#portalBody").hidden=false;
 $("#portalBody").innerHTML='<div class="payment-grid"><form id="responseForm" class="payment-form"><div class="eyebrow">REQUEST '+esc(r.id)+'</div><h2>Processor confirmation</h2><p class="caption">Complete all six fields from your saved synthetic receipt. Missing or conflicting fields will be rejected.</p><div id="portalError" class="form-error" role="alert" hidden></div><div class="form-grid"><label class="field full">Payment reference<input name="reference" required maxlength="40"></label><label class="field">Amount in minor units<input name="amountMinor" type="number" min="1" step="1" required><small>SGD 2,500.00 is 250000 cents.</small></label><label class="field">Currency<input name="currency" required maxlength="3" pattern="[A-Z]{3}"></label><label class="field">Beneficiary account<input name="beneficiaryAccount" required pattern="[0-9]{8,18}" maxlength="18"></label><label class="field">Final processor status<select name="finalStatus"><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="unknown">Unknown</option></select></label><label class="field full">Processor record ID<input name="processorRecordId" required maxlength="160"></label></div><div class="form-footer"><small>Submitting supplies information. It does not authorise a payment.</small><button class="button primary" type="submit">Submit for validation →</button></div></form><aside class="side-guide"><div class="eyebrow">SYNTHETIC PROCESSOR DESK</div><h2>Your supporting receipt.</h2><p>This is the fictional source record assigned to the intended recipient. Operations has not yet accepted it as evidence.</p><div class="receipt-source"><h3>'+esc(s.id)+'</h3><dl class="fact-list"><dt>Reference</dt><dd>'+esc(s.reference)+'</dd><dt>Amount</dt><dd>'+esc(money(s.amountMinor,s.currency))+'</dd><dt>Minor units</dt><dd>'+s.amountMinor+'</dd><dt>Beneficiary</dt><dd>'+esc(s.beneficiary)+'</dd><dt>Status</dt><dd>'+esc(s.finalStatus)+'</dd></dl><button class="button secondary full" id="fillReceipt" type="button">Fill from this receipt</button></div><div class="info-box">The backend compares your reply with this saved record, the original instruction and the scoped request. The AI does not approve your response.</div></aside></div>';
 $("#fillReceipt").onclick=()=>{const f=$("#responseForm");for(const [key,value]of Object.entries({reference:s.reference,amountMinor:s.amountMinor,currency:s.currency,beneficiaryAccount:s.beneficiary,finalStatus:s.finalStatus,processorRecordId:s.id}))f.elements[key].value=value;};
 $("#responseForm").onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector("button[type=submit]");button.disabled=true;button.textContent="Validating against saved records…";$("#portalError").hidden=true;
  try{const body=Object.fromEntries(new FormData(e.target));body.amountMinor=Number(body.amountMinor);const result=await portal("/responses",body);
   if(result.data.validation)validation(result.data,result.ok&&result.data.validation.valid);else throw Error(result.data.error||"The response could not be validated.");
  }catch(err){$("#portalError").textContent=err.message;$("#portalError").hidden=false;}finally{button.disabled=false;button.textContent="Submit for validation →";}
 };
 if(r.status==="validated")validation({validation:r.responses.at(-1)?.validation,workflow:{status:"recorded"}},true);
 }catch(e){$("#portalStatus").innerHTML='<div class="empty-state">'+icon("shield")+'<h2>This request is not available.</h2><p>'+esc(e.message)+'</p><p>Ask the operations sender for a new authorised link. No information was submitted.</p></div>';}
}
load();
