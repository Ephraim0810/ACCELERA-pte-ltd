import test from "node:test";
import assert from "node:assert/strict";
import * as shared from "../public/shared.js";
test("guided queue follows pagination so older urgent records are retained",async()=>{
 assert.equal(typeof shared.loadGuidedRecords,"function","A complete guided-record loader is required.");
 const first=Array.from({length:200},(_,i)=>({id:"NEW-"+i}));const calls=[];
 const items=await shared.loadGuidedRecords(async path=>{const offset=Number(new URL(path,"http://test").searchParams.get("offset")||0);calls.push(offset);return offset===0?{items:first,total:201}:{items:[{id:"OLD-BLOCKED",workflow:{status:"manual"}}],total:201};});
 assert.equal(items.length,201);assert.equal(items.at(-1).id,"OLD-BLOCKED");assert.deepEqual(calls,[0,200]);
});
test("an incomplete paginated queue reports an error instead of silently hiding records",async()=>{
 assert.equal(typeof shared.loadGuidedRecords,"function");
 let page=0;await assert.rejects(shared.loadGuidedRecords(async()=>++page===1?{items:[{id:"A"}],total:2}:{items:[],total:2}),/incomplete|changed|reload/i);
});