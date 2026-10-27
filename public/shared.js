export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const money=(n,c="SGD")=>new Intl.NumberFormat("en-SG",{style:"currency",currency:c,currencyDisplay:"code"}).format(n/100);
export const when=v=>new Date(v).toLocaleString("en-SG",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Singapore"});
export const labels={not_required:"No exception",detected:"Ready to investigate",ready:"Ready for action",waiting:"Waiting for evidence",review:"Approval needed",executed:"Verify saved result",verified:"Resolved & verified",manual:"Human attention",verification_failed:"Verification failed"};
export const badge=s=>'<span class="badge '+esc(s)+'"><i></i>'+esc(labels[s]||s)+'</span>';
const paths={grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',layers:'<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',file:'<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/>',chevron:'<path d="m9 5 7 7-7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
export const icon=n=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[n]||paths.file)+'</svg>';
export const brand='<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-name">accelera<span>PAYMENT OPERATIONS</span></span>';
export function token(){return localStorage.getItem("accelera-admin-token")||localStorage.getItem("casepilot-admin-token")||"";}
export function saveToken(t){localStorage.setItem("accelera-admin-token",t);localStorage.removeItem("casepilot-admin-token");document.cookie="casepilot_session="+encodeURIComponent(t)+"; path=/; SameSite=Strict";}
export function clearToken(){localStorage.removeItem("accelera-admin-token");localStorage.removeItem("casepilot-admin-token");document.cookie="casepilot_session=; Max-Age=0; path=/; SameSite=Strict";}
export async function api(path,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
 try{const r=await fetch(path,{...options,signal:controller.signal,headers:{"content-type":"application/json","x-admin-token":token(),...options.headers}});
 const d=await r.json().catch(()=>({error:"The server returned an unreadable response."}));
 if(r.status===401){clearToken();throw Error("Your demo session ended. Sign in to continue.");}
 if(!r.ok)throw Error(d.error||"The action could not be completed.");return d;
 }catch(e){if(e.name==="AbortError")throw Error("The request timed out. Refresh the saved record before repeating an action.");throw e;}finally{clearTimeout(timeout);}
}
export function notice(message,type="info"){let el=$("#toast");if(!el){el=document.createElement("div");el.id="toast";el.setAttribute("role","status");document.body.append(el);}el.className="toast show "+type;el.textContent=message;clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove("show"),6500);}
export const roles={System:"Detect the exception and distinguish it from normal processing.",Agent:"Assemble evidence, identify the gap and prepare a permitted action.",Reviewer:"Approve the exact authorised proposal, take over or escalate.",Administrator:"Inspect who did what and the saved verification result.","Process Owner":"Measure actual prototype outcomes and identify unresolved cases."};
export function shell(view){
 const nav=[["overview","/overview","grid","Overview"],["payments","/transactions?view=payments","layers","Payments"],["cases","/transactions","file","Exception workspace"],["outcomes","/admin","shield","Audit & outcomes"]];
 document.body.innerHTML='<a class="skip-link" href="#content">Skip to content</a><aside class="sidebar"><a class="brand" href="/overview" aria-label="Accelera overview">'+brand+'</a><div class="workspace-label"><span class="status-dot"></span> IGNITE / Student prototype</div><div class="nav-label">WORKSPACE</div><nav aria-label="Main navigation">'+nav.map(([key,url,i,text])=>'<a class="nav-item '+(view===key?'active':'')+'" href="'+url+'">'+icon(i)+'<span>'+text+'</span>'+(view===key?'<b></b>':'')+'</a>').join('')+'</nav><div class="sidebar-note">'+icon("shield")+'<b>Resolve with evidence.</b><p>Only defined updates to synthetic internal records are permitted.</p><a href="/guide">Explore the guide '+icon("arrow")+'</a></div><div class="sidebar-bottom"><button class="help-link" id="helpButton">'+icon("help")+' How Accelera works</button><div class="profile"><span class="avatar">OP</span><div><b>Operations workspace</b><small>Demo role views</small></div><button id="logout" aria-label="Sign out">↗</button></div></div></aside><div class="app-main"><header class="topbar"><div class="breadcrumb">Workspace '+icon("chevron")+' <b>'+esc(nav.find(n=>n[0]===view)?.[3]||"Overview")+'</b></div><div class="top-actions"><span class="prototype-pill"><i></i> Synthetic environment</span><label class="role-control"><span>Role view</span><select id="roleSelect" aria-label="Role view">'+Object.keys(roles).map(r=>'<option>'+r+'</option>').join('')+'</select></label><button class="icon-button" id="refresh" aria-label="Refresh workspace">'+icon("refresh")+'</button></div></header><main id="content" class="content"><div class="skeleton"><span></span><span></span><span></span><p>Loading saved workspace…</p></div></main><footer class="app-footer"><span>ACCELERA · THE 4TH DIMENSION</span><span>Synthetic data. Mock actions. No money movement.</span></footer></div><dialog id="helpDialog"><div class="dialog-head"><span class="eyebrow">YOUR WORKFLOW GUIDE</span><button id="closeHelp" class="icon-button" aria-label="Close guide">×</button></div><h2>From exception to verified outcome.</h2><p>Accelera investigates a defined operational case and checks what action is permitted.</p><ol class="help-steps"><li><b>Detect</b> Separate normal processing from an exception.</li><li><b>Investigate</b> Link records and name the missing evidence.</li><li><b>Authorise</b> Check the exact action, authority and current state.</li><li><b>Act</b> Apply only the permitted mock record update.</li><li><b>Verify</b> Read the saved result before closing the case.</li></ol><div class="info-box">A recorded payment is not proof of settlement. A timeout is not proof of failure. An acknowledgement is not proof an update was saved.</div><a class="button primary" href="/guide">Read the full guide '+icon("arrow")+'</a></dialog><div id="toast" class="toast" role="status"></div>';
 const saved=localStorage.getItem("accelera-role")||"Agent";$("#roleSelect").value=saved;
 $("#roleSelect").onchange=e=>{localStorage.setItem("accelera-role",e.target.value);notice(roles[e.target.value]);document.dispatchEvent(new CustomEvent("rolechange",{detail:e.target.value}));};
 $("#helpButton").onclick=()=>$("#helpDialog").showModal();$("#closeHelp").onclick=()=>$("#helpDialog").close();
 $("#logout").onclick=async()=>{try{await api("/api/demo/logout",{method:"POST",body:"{}"});}catch{}clearToken();location.href="/login";};
}
export function guide(eyebrow,title,body,extra=""){return '<details class="guide-panel" open><summary><span class="guide-icon">'+icon("help")+'</span><span><small>'+esc(eyebrow)+'</small><b>'+esc(title)+'</b></span><span class="guide-toggle">Guide <span>⌃</span></span></summary><div class="guide-body"><p>'+esc(body)+'</p>'+extra+'</div></details>';}

export async function loadGuidedRecords(request=api){
 const collected=new Map();let offset=0,total=Infinity;
 while(offset<total){
  const page=await request("/api/payments?limit=200&guided=1&offset="+offset);
  if(!Array.isArray(page.items)||!Number.isFinite(page.total))throw Error("The queue response was incomplete. Reload the workspace.");
  total=page.total;
  if(!page.items.length&&offset<total)throw Error("The queue changed or was incomplete. Reload the workspace.");
  for(const item of page.items)collected.set(item.id,item);
  offset+=page.items.length;
 }
 return [...collected.values()];
}
