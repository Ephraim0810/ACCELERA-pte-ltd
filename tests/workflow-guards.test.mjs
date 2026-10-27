import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflow, transitionWorkflow } from "../src/workflow.mjs";
const payment={id:"GUARD-1",paymentReference:"ACC-GUARD",payerName:"Northstar Supplies Pte Ltd",payeeName:"Apex Industrial Parts Pte Ltd",beneficiaryAccount:"0123456789",bankCountry:"Singapore",amount:2500,currency:"SGD",rail:"FAST",case:{exceptionType:"beneficiary_not_recognized"}};
test("a missing beneficiary reference is not described as conflicting evidence",()=>{
 const w=createWorkflow(payment);assert.equal(w.scenario,"unrecognised_beneficiary");assert.equal(w.source.conflict,false);
 const investigated=transitionWorkflow(w,payment,"investigate");assert.equal(investigated.status,"manual");assert.match(investigated.question,/reference|confirmation/i);
});
test("an advisory uncertainty pauses an otherwise eligible controlled action",()=>{
 const w=createWorkflow(payment,"status");
 const result=transitionWorkflow(w,payment,"investigate",{analysis:{provider:"groq",riskRecommendation:"uncertain",summary:"An additional record needs review."}});
 assert.equal(result.status,"manual");assert.equal(result.proposal,null);
});
test("changed evidence invalidates an approved allocation proposal",()=>{
 let w=transitionWorkflow(createWorkflow(payment,"allocation"),payment,"investigate");
 w=transitionWorkflow(w,payment,"approve",{note:"Checked existing mandate and balances."});
 w.source.mandate.split[0].amountMinor=190000;
 assert.throws(()=>transitionWorkflow(w,payment,"execute"),/no longer match|authority|evidence/i);
});
test("expired authority cannot execute a previously eligible proposal",()=>{
 let w=transitionWorkflow(createWorkflow(payment,"status"),payment,"investigate");
 w.source.authority.validUntil="2000-01-01T00:00:00Z";
 assert.throws(()=>transitionWorkflow(w,payment,"execute"),/no longer match|authority|evidence/i);
});
