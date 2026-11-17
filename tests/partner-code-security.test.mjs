import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
for(const name of ['record-partner-install','track-partner-click'])test(`${name}: underscore is literal rather than a SQL wildcard`,async()=>{
 let handler,pattern;
 const q={select:()=>q,ilike:(_column,p)=>{pattern=p;return q},eq:()=>q,maybeSingle:async()=>({data:null})};
 const code=ts.transpileModule(readFileSync(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:{},Response,console:{error(){}},Deno:{serve:f=>handler=f},require:n=>n.includes('supabase-js')?{createClient:()=>({from:()=>q})}:{getEnv:()=> 'fake',corsHeaders:{},json:(data,status=200)=>new Response(JSON.stringify(data),{status})}});
 await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({code:'LOJA_1',codigo:'LOJA_1',installationId:'00000000-0000-4000-8000-000000000001',platform:'ios'})}));
 assert.equal(pattern,'LOJA\\_1');
});
