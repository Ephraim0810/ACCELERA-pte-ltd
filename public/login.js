import {$,$$,brand,api,saveToken,token} from "/shared.js";
$$("[data-brand]").forEach(x=>x.innerHTML=brand);
function destination(){const next=new URLSearchParams(location.search).get("next");return next&&/^\/(transactions|admin|overview)(\?|$)/.test(next)?next:"/overview";}
if(token())api("/api/demo/session").then(x=>{if(x.authenticated)location.replace(destination());}).catch(()=>{});
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();const b=e.target.querySelector("button"),f=new FormData(e.target);b.disabled=true;b.textContent="Opening workspace…";$("#loginError").hidden=true;try{const r=await api("/api/demo/login",{method:"POST",body:JSON.stringify({username:f.get("username"),password:f.get("password")})});saveToken(r.token);location.href=destination();}catch(err){$("#loginError").textContent=err.message;$("#loginError").hidden=false;b.disabled=false;b.textContent="Open workspace →";}});
api("/api/demo/accounts").then(meta=>{
 if(!meta.localDemo)return;
 const label=document.createElement("label");label.className="field";label.innerHTML='<span>Local synthetic demo account</span><select id="demoAccount">'+meta.accounts.map(a=>'<option value="'+a.username+'">'+a.label+'</option>').join('')+'</select>';
 const form=$("#loginForm");form.querySelector(".field").before(label);
 const demoPasswords={admin:"casepilot",agent:"agent-demo",reviewer:"reviewer-demo","risk-reviewer":"risk-demo",owner:"owner-demo"};
 $("#demoAccount").onchange=e=>{form.elements.username.value=e.target.value;form.elements.password.value=demoPasswords[e.target.value]||"";};
}).catch(()=>{});
