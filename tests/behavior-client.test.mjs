import assert from 'node:assert/strict';import test from 'node:test';import vm from 'node:vm';import ts from 'typescript';import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync(new URL('../src/lib/behavior-analytics.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){const exports={},sent=[];let user='a',fail=false;const api={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:`token-${user}`}}})},rpc:(_name,payload)=>({setHeader:(_key,token)=>{sent.push({payload,token});return Promise.resolve({error:fail?{}:null});}})};vm.runInNewContext(code,{exports,crypto,window:{location:{pathname:'/app/material/private-id'}},require:n=>n.includes('capacitor')?{Capacitor:{getPlatform:()=> 'web'}}:{supabase:api}});return{api:exports,sent,user:id=>user=id,fail:()=>fail=true};}
test('only authenticated events are queued and no dynamic path data is recorded',async()=>{
 const h=harness();h.api.trackBehavior('page_view');await h.api.flushBehavior();assert.equal(h.sent.length,0);
 h.api.setBehaviorUser('a');h.api.trackBehavior('page_view');await h.api.flushBehavior();
 assert.equal(h.sent[0].payload._events[0].screen,'material');assert.equal(JSON.stringify(h.sent).includes('private-id'),false);assert.equal(h.sent[0].token,'Bearer token-a');
});
test('changing accounts discards the old queue and binds upload to the session token',async()=>{
 const h=harness();h.api.setBehaviorUser('a');h.api.trackBehavior('page_view');h.api.setBehaviorUser('b');h.user('b');await h.api.flushBehavior();assert.equal(h.sent.length,0);
 h.api.trackBehavior('app_open');await h.api.flushBehavior();assert.equal(h.sent[0].token,'Bearer token-b');
});
test('retry preserves event IDs for server deduplication',async()=>{
 const h=harness();h.api.setBehaviorUser('a');h.fail();h.api.trackBehavior('notification_open','push');await h.api.flushBehavior();await h.api.flushBehavior();assert.equal(h.sent[0].payload._events[0].id,h.sent[1].payload._events[0].id);
});
