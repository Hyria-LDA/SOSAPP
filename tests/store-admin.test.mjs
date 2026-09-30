import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/store-admin/index.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
async function invoke(input={},options={}){
 let handler;const operations=[];
 const admin={auth:{getUser:async()=>({data:{user:options.invalid?null:{id:'admin'}},error:options.invalid?'invalid':null}),admin:{
 createUser:async v=>{operations.push(['create',v]);return {data:{user:{id:'new-store-user'}},error:options.duplicate?'existing login':null}},
 deleteUser:async id=>{operations.push(['delete',id]);return {}},
 updateUserById:async(id,v)=>{operations.push(['reset',id,v]);return {}}
 }},rpc:async(name,args)=>{operations.push(['rpc',name,args]);return {data:options.provisionError?null:'new-store',error:options.provisionError||null}},
 from(table){const filters={};let single=false;const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},single:()=>{single=true;return q},maybeSingle:()=>{single=true;return q},then(resolve,reject){let data;if(table==='banner_empresas')data={user_id:'existing-store-user'};else if(filters.user_id==='admin')data=options.notAdmin?[]:[{role:'admin'}];else data=filters.role==='store_partner'?{role:'store_partner'}:options.targetAdmin?{role:'admin'}:null;return Promise.resolve({data,error:options.roleError&&table==='user_roles'&&filters.user_id!=='admin'?'unavailable':null}).then(resolve,reject)}};return q}};
 vm.runInNewContext(outputText,{exports:{},Response,console:{error(){}},Deno:{env:{get:()=> 'test-only'},serve:cb=>handler=cb},require:()=>({createClient:()=>admin})});
 const response=await handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'create',name:'Loja',email:'loja@example.com',password:'Test-password-123!',code:'LOJA001',...input})}));
 return {status:response.status,body:await response.json(),operations};
}
test('store admin rejects invalid sessions and nonadmins before creating credentials',async()=>{for(const o of [{invalid:true},{notAdmin:true}]){const r=await invoke({},o);assert.ok([401,403].includes(r.status));assert.equal(r.operations.length,0)}});
test('store admin validates password and referral code',async()=>{for(const input of [{password:'short'},{code:'bad code'}]){const r=await invoke(input);assert.equal(r.status,400);assert.equal(r.operations.length,0)}});
test('store admin creates a confirmed internal login and provisions only the new user',async()=>{const r=await invoke();assert.equal(r.status,200);assert.equal(r.operations[0][1].email_confirm,true);assert.equal(r.operations[0][1].app_metadata.store_provisioning,true);assert.equal(r.operations[1][2]._user,'new-store-user');assert.equal(r.body.store_id,'new-store')});
test('failed provisioning removes only the newly created login',async()=>{const r=await invoke({},{provisionError:true});assert.equal(r.status,400);assert.deepEqual(r.operations.at(-1),['delete','new-store-user'])});
test('an existing login is never deleted on create failure',async()=>{const r=await invoke({},{duplicate:true});assert.equal(r.status,400);assert.equal(r.operations.some(x=>x[0]==='delete'),false)});
test('password reset is restricted to exclusive store accounts and fails closed',async()=>{for(const o of [{targetAdmin:true},{roleError:true}]){const r=await invoke({action:'reset_password',store_id:'store'},o);assert.equal(r.status,409);assert.equal(r.operations.length,0)}const r=await invoke({action:'reset_password',store_id:'store'});assert.equal(r.status,200);assert.equal(r.operations[0][1],'existing-store-user')});

test('preserves structured PostgREST failures and identifies the failed step',async()=>{const r=await invoke({},{provisionError:{code:'23502',message:'null value in column user_id violates not-null constraint',details:'private details'}});assert.equal(r.status,400);assert.equal(r.body.stage,'vincular_loja');assert.equal(r.body.code,'23502');assert.match(r.body.error,/null value in column user_id/);assert.equal(JSON.stringify(r.body).includes('private details'),false);assert.deepEqual(r.operations.at(-1),['delete','new-store-user'])});
test('preserves string errors from credential creation',async()=>{const r=await invoke({},{duplicate:true});assert.equal(r.body.stage,'criar_login');assert.match(r.body.error,/existing login/)});
