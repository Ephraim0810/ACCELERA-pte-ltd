import {$,$$,esc,brand,icon,api,money,guide} from "/shared.js";
$$("[data-brand]").forEach(x=>x.innerHTML=brand);
const form=$("#paymentForm");form.elements.paymentReference.value="ACC-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
form.addEventListener("submit",async e=>{
 e.preventDefault();const b=form.querySelector("button[type=submit]");b.disabled=true;b.textContent="Validating & recording…";$("#formError").hidden=true;
 const f=new FormData(form),p=Object.fromEntries(f);p.amount=Number(p.amount);
 try{
 const d=await api("/api/payments",{method:"POST",body:JSON.stringify(p)}),routine=d.workflow?.status==="not_required";
 const receipt=$("#receipt");receipt.hidden=false;receipt.className="receipt-card";
 receipt.innerHTML='<div class="receipt-title"><span class="receipt-symbol">'+icon(routine?"check":"file")+'</span><div><span class="eyebrow">'+(routine?'STANDARD VALIDATION COMPLETE':'AN EXCEPTION NEEDS ATTENTION')+'</span><h2>'+(routine?'Payment recorded correctly.':'Instruction recorded. Case flagged.')+'</h2><p>Reference '+esc(d.paymentReference)+'</p></div></div><dl class="fact-list"><dt>Recorded amount</dt><dd>'+esc(money(Math.round(d.amount*100),d.currency))+'</dd><dt>Instruction status</dt><dd>Recorded for mock processing</dd><dt>Basic record validation</dt><dd>Completed</dd><dt>Exception investigation</dt><dd>'+(routine?'Not required — no exception detected':'Not run yet — an operations review is needed')+'</dd><dt>Live AI call</dt><dd>Not run at intake</dd><dt>Funds moved</dt><dd>None — synthetic environment</dd></dl>'+
 guide("WHY THIS RESULT",routine?"No exception, no unnecessary investigation.":"An evidence gap needs attention.",routine?"The beneficiary details match the synthetic reference record. Standard validation passed, so Accelera did not start an exception investigation. Recording this instruction does not establish settlement.":"The beneficiary details are missing from, or conflict with, the synthetic reference. Accelera preserves the instruction and raises a case; it does not guess corrected bank details.")+
 '<div class="button-row"><a class="button primary" href="/transactions?view=payments&id='+encodeURIComponent(d.id)+'">View saved record '+icon("arrow")+'</a><button class="button secondary" id="newPayment" type="button">Record another payment</button></div>';
 $("#newPayment").onclick=()=>{receipt.hidden=true;form.hidden=false;form.elements.paymentReference.value="ACC-"+Date.now();form.scrollIntoView({behavior:"smooth",block:"start"});form.elements.payeeName.focus();};
 form.hidden=true;receipt.focus();receipt.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(err){$("#formError").textContent=err.message;$("#formError").hidden=false;$("#formError").scrollIntoView({block:"center"});}
 finally{b.disabled=false;b.textContent="Record payment →";}
});