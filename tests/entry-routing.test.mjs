import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, options={}) {
 let config;
 const q = table => { const query = { select:()=>query, eq:()=>query, maybeSingle:()=>query,
 then(resolve,reject) { return Promise.resolve(table === 'user_roles' ? {data:(options.roles||[]).map(role=>({role})),error:options.roleError||null} : {data:options.noCompany?null:{onboarded:options.complete||false},error:options.companyError||null}).then(resolve,reject); } }; return query; };
 const supabase={auth:{getUser:async()=>({data:{user:options.logged?{id:'user1'}:null},error:null}),getSession:async()=>({data:{session:options.logged?{user:{id:'user1'}}:null}})},from:q};
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports:{},setTimeout,clearTimeout,require:name=>name==='@tanstack/react-router'?{createFileRoute:()=>value=>{config=value;return value},redirect:value=>({redirect:true,...value})}:name.includes('supabase/client')?{supabase}:{} });
 return config;
}
const guard='src/routes/_authenticated/route.tsx';
async function destination(path, options) { try {await load(guard,options).beforeLoad({location:{pathname:path}});return 'allowed';}catch(e){if(e.redirect)return e.to;throw e;} }
test('root enters the shared app gate, replacing the landing page',()=>{assert.throws(()=>load('src/routes/index.tsx').beforeLoad({location:{hash:'confirmation-token'}}),e=>e.redirect&&e.to==='/app'&&e.replace&&e.search===true&&e.hash==='confirmation-token');});
test('both initial URLs require login',async()=>{for(const path of ['/app','/app/'])assert.equal(await destination(path,{}),'/auth');});
test('logged-in incomplete/missing company opens completion form',async()=>{for(const path of ['/app','/app/']){assert.equal(await destination(path,{logged:true}),'/onboarding');assert.equal(await destination(path,{logged:true,noCompany:true}),'/onboarding');}});
test('completed registration enters home, and leaves onboarding',async()=>{assert.equal(await destination('/app',{logged:true,complete:true}),'allowed');assert.equal(await destination('/onboarding',{logged:true,complete:true}),'/app');});
test('incomplete account can use onboarding without a redirect loop',async()=>{assert.equal(await destination('/onboarding',{logged:true}),'allowed');});
test('stores keep their portal and sellers bypass company onboarding',async()=>{assert.equal(await destination('/app',{logged:true,roles:['store_partner']}),'/lojista');assert.equal(await destination('/app',{logged:true,roles:['vendedor']}),'allowed');assert.equal(await destination('/onboarding',{logged:true,roles:['vendedor']}),'/app/vendedor');});
test('admin who also has store role keeps normal complete-company access',async()=>{assert.equal(await destination('/app',{logged:true,complete:true,roles:['admin','store_partner']}),'allowed');});
test('public ad/search links remain accessible to visitors',async()=>{for(const path of ['/app/material/example','/app/buscar'])assert.equal(await destination(path,{}),'allowed');});
test('database errors do not pretend a completed registration is missing',async()=>{for(const options of [{companyError:new Error('database offline')},{roleError:new Error('database offline')}])await assert.rejects(destination('/app',{logged:true,complete:true,...options}),/database offline/);});
