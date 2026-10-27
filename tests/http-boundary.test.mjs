import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { createCasePilotServer } from "../src/server.mjs";
test("malformed request targets return 400 and leave the server available",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"accelera-http-"));const app=await createCasePilotServer({dbPath:join(dir,"http.sqlite"),env:{}});
 await new Promise(r=>app.server.listen(0,"127.0.0.1",r));const port=app.server.address().port;
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await app.close();await rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:100}).catch(()=>{});});
 const raw=await new Promise((resolve,reject)=>{
  const socket=createConnection({host:"127.0.0.1",port},()=>socket.write("GET //% HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"));
  let result="";socket.setEncoding("utf8");socket.on("data",d=>result+=d);socket.on("end",()=>resolve(result));socket.on("error",reject);
  socket.setTimeout(2000,()=>{socket.destroy();resolve(result);});
 });
 assert.match(raw,/HTTP\/1\.1 400/);
 assert.equal((await fetch("http://127.0.0.1:"+port+"/api/health")).status,200);
 const invalid=await fetch("http://127.0.0.1:"+port+"/api/demo/login",{method:"POST",headers:{"content-type":"application/json"},body:"null"});
 assert.equal(invalid.status,422);
 const protectedPage=await fetch("http://127.0.0.1:"+port+"/transactions?view=payments&id=record-1",{redirect:"manual"});
 assert.equal(protectedPage.status,302);
 assert.equal(new URL(protectedPage.headers.get("location"),"http://test").searchParams.get("next"),"/transactions?view=payments&id=record-1");
});