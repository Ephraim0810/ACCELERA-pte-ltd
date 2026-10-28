import { spawn } from "node:child_process";
import { openSync, closeSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const port=Number(process.env.PORT||4174);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("PORT must be an integer between 1024 and 65535.");
const origin="http://127.0.0.1:"+port;
async function ready(){try{const r=await fetch(origin+"/api/health",{signal:AbortSignal.timeout(650)});const d=await r.json();return r.ok&&d.name==="Accelera"&&d.workflowVersion>=5;}catch{return false;}}
if(!await ready()){
 mkdirSync(join(root,"data"),{recursive:true});
 const out=openSync(join(root,"data","accelera.stdout.log"),"a"),err=openSync(join(root,"data","accelera.stderr.log"),"a");
 const child=spawn(process.execPath,["src/server.mjs"],{cwd:root,detached:true,windowsHide:true,stdio:["ignore",out,err],env:{...process.env,PORT:String(port),HOST:"127.0.0.1"}});
 child.unref();closeSync(out);closeSync(err);
 let ok=false;
 for(let i=0;i<60;i++){if(await ready()){ok=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ok){console.error("Accelera could not start on "+origin+". Check data/accelera.stderr.log and whether another application is using this port.");process.exit(1);}
}
console.log("Accelera is ready: "+origin);
if(process.platform==="win32"){
 const browser=spawn("cmd.exe",["/d","/c","start","",origin],{detached:true,windowsHide:true,stdio:"ignore"});browser.unref();
}else console.log("Open the address above in your browser.");
