import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('a late Passport response cannot install case A controls in case B',async()=>{
 const source=(await readFile(new URL('../public/upgrade-ui.js',import.meta.url),'utf8')).replace('from "/shared.js"','from '+JSON.stringify(new URL('../public/shared.js',import.meta.url).href));
 const saved=Object.fromEntries(['document','location','localStorage','fetch'].map(k=>[k,globalThis[k]]));
 let zone={innerHTML:'Case A UI'},release,started;
 const waiting=new Promise(r=>{release=r;}),seen=new Promise(r=>{started=r;});
 globalThis.location={search:'?id=A'};
 globalThis.localStorage={getItem:()=>''};
 globalThis.document={querySelector:s=>s==='#upgradeZone'?zone:null,querySelectorAll:()=>[]};
 globalThis.fetch=async path=>{if(path.endsWith('/passport')){started();await waiting;}return {ok:true,status:200,json:async()=>({})};};
 try{
  const {mountCaseUpgrade}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const pending=mountCaseUpgrade({id:'A',workflow:{investigationRequired:true}},[],()=>{});
  await seen;
  const caseB={innerHTML:'Case B UI'};zone=caseB;globalThis.location.search='?id=B';
  release();await pending;
  assert.equal(caseB.innerHTML,'Case B UI');assert.equal(caseB.onclick,undefined);
 }finally{for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
