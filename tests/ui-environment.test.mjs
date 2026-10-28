import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvironmentFile, resolvePageAsset, createCasePilotServer } from "../src/server.mjs";
test("login is the root page and protected workspaces are distinct pages",()=>{assert.equal(resolvePageAsset("/"),"login.html");assert.equal(resolvePageAsset("/transactions"),"transactions.html");assert.equal(resolvePageAsset("/admin"),"admin.html")});
test("local environment file loads model key and demo admin credentials without replacing existing values",()=>{const dir=mkdtempSync(join(tmpdir(),"casepilot-env-"));const file=join(dir,".env");const target={EXISTING_VALUE:"keep"};writeFileSync(file,"GROQ_API_KEY=\"abc123\"\nAI_MODEL=openai/gpt-oss-20b\nDEMO_ADMIN_USER=reviewer\nDEMO_ADMIN_PASSWORD='long-secret'\nEXISTING_VALUE=replace\n");try{loadEnvironmentFile(file,target);assert.deepEqual(target,{EXISTING_VALUE:"keep",GROQ_API_KEY:"abc123",AI_MODEL:"openai/gpt-oss-20b",DEMO_ADMIN_USER:"reviewer",DEMO_ADMIN_PASSWORD:"long-secret"})}finally{rmSync(dir,{recursive:true,force:true})}});
test("admin workspace metrics require an authenticated session",async t=>{const dir=mkdtempSync(join(tmpdir(),"casepilot-metrics-"));const app=await createCasePilotServer({dbPath:join(dir,"app.sqlite"),env:{}});t.after(async()=>{await app.close();try{await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100})}catch(error){if(process.platform!=="win32"||error.code!=="EBUSY")throw error}});assert.equal((await app.dispatch("GET","/api/metrics")).status,401)});

test("checked-in environment template parses the admin password and server port separately",()=>{const config={};loadEnvironmentFile(new URL("../.env.example",import.meta.url),config);assert.equal(config.DEMO_ADMIN_PASSWORD,"casepilot");assert.equal(config.PORT,"4174")});
