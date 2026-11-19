import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/session-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('logout and account switching discard old queries, same-user refresh does not',()=>{
 let clears=0;const guard=exports.createSessionCacheGuard(()=>clears++);
 guard('INITIAL_SESSION','a');guard('SIGNED_IN','a');guard('TOKEN_REFRESHED','a');assert.equal(clears,0);
 guard('SIGNED_IN','b');assert.equal(clears,1);
 guard('SIGNED_OUT',null);assert.equal(clears,2);
 guard('SIGNED_IN','c');assert.equal(clears,3);
});
test('initial sign-in without initial session also discards existing cache',()=>{
 let cleared=false;exports.createSessionCacheGuard(()=>cleared=true)('SIGNED_IN','a');assert.equal(cleared,true);
});

test('same-account confirmations do not reload every page or discard useful queries',()=>{
 const guard=exports.createSessionCacheGuard(()=>{});
 assert.equal(guard('INITIAL_SESSION','a'),false);
 for(let i=0;i<20;i++)assert.equal(guard('SIGNED_IN','a'),false);
 assert.equal(guard('TOKEN_REFRESHED','a'),false);
 assert.equal(guard('USER_UPDATED','a'),true);
 assert.equal(guard('SIGNED_IN','b'),true);
 assert.equal(guard('SIGNED_OUT',null),true);
 assert.equal(guard('SIGNED_IN','b'),true);
});
