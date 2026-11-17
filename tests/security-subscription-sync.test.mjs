import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const user='00000000-0000-4000-8000-000000000001';
const db=new PGlite();
const migration=readFileSync(new URL('../supabase/migrations/20261117120000_secure_subscription_sync.sql',import.meta.url),'utf8');
const subscription={status:'active',sandbox:false,expires_at:'2099-01-01',entitlement_id:'ultra',product_id:'test',will_renew:true};
const sync=async(data=subscription)=>(await db.query('SELECT apply_revenuecat_subscription($1,$2::jsonb) AS result',[user,JSON.stringify(data)])).rows[0].result;
const company=async()=>(await db.query('SELECT * FROM empresas')).rows[0];
async function scenario(run){await db.exec('BEGIN');try{await run()}finally{await db.exec('ROLLBACK')}}
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
 CREATE TABLE planos(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,slug text UNIQUE,ativo boolean DEFAULT true);
 INSERT INTO planos(slug) VALUES('free'),('ultra');
 CREATE TABLE empresas(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,owner_id uuid UNIQUE,plano_id uuid,plano text DEFAULT 'free',plano_inicio timestamptz,plano_vencimento timestamptz);
 INSERT INTO empresas(owner_id) VALUES('${user}');
 CREATE TABLE revenuecat_subscriptions(user_id uuid PRIMARY KEY,empresa_id uuid,app_user_id text,entitlement_id text,product_id text,status text,expires_at timestamptz,will_renew boolean,sandbox boolean,last_synced_at timestamptz,updated_at timestamptz);
 `);
 await db.exec(migration);
});
after(()=>db.close());
test('real purchase grants; expiration removes only the store grant',()=>scenario(async()=>{
 assert.equal((await sync()).plan,'ultra');assert.equal((await company()).plano_origem,'revenuecat');
 assert.equal((await sync({status:'expired'})).plan,'free');
}));
test('sandbox and unknown environment cannot grant a paid plan',async()=>{
 for(const sandbox of [true,null])await scenario(async()=>{
  await assert.rejects(sync({...subscription,sandbox}),/production_purchase_required/);
 });assert.equal((await company()).plano,'free');
});
test('manual grant survives store renewal and expiry; expired manual grant permits real purchase',()=>scenario(async()=>{
 await db.exec("UPDATE empresas SET plano='ultra',plano_origem='manual',plano_vencimento='2100-01-01'");
 await sync();assert.match((await company()).plano_vencimento.toISOString(),/^2100/);
 await sync({status:'expired'});assert.equal((await company()).plano,'ultra');
 await db.exec("UPDATE empresas SET plano_vencimento='2020-01-01'");
 await sync();assert.equal((await company()).plano_origem,'revenuecat');
}));
test('manual free plan does not block a genuine purchase',()=>scenario(async()=>{
 await db.exec("UPDATE empresas SET plano='free',plano_origem='manual',plano_vencimento=NULL");
 assert.equal((await sync()).plan,'ultra');
}));
test('only admin edits can mark a plan as manual; owner cannot forge origin',()=>scenario(async()=>{
 await db.exec(`SET LOCAL test.uid='${user}'; SET LOCAL test.admin='false'; UPDATE empresas SET plano_origem='manual'`);
 assert.equal((await company()).plano_origem,'legacy');
 await db.exec("SET LOCAL test.admin='true'; UPDATE empresas SET plano='ultra'");
 assert.equal((await company()).plano_origem,'manual');
}));
test('authenticated clients cannot call the privileged sync RPC',()=>scenario(async()=>{
 await db.exec('SET LOCAL ROLE authenticated');
 await assert.rejects(sync(),/permission denied/);
}));
test('subscription persistence failure rolls back the plan update',()=>scenario(async()=>{
 await db.exec("ALTER TABLE revenuecat_subscriptions ADD CONSTRAINT reject_test CHECK (product_id <> 'test')");
 await assert.rejects(sync(),/reject_test/);
}));
test('failed transaction leaves company unchanged and migration is repeatable',async()=>{
 assert.equal((await company()).plano,'free');await db.exec(migration);
 assert.equal((await company()).plano,'free');
});
const edge=ts.transpileModule(readFileSync(new URL('../supabase/functions/sync-revenuecat-subscription/index.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function invoke({sandbox=false,authenticated=true,rcStatus=200}={}){
 let handler;let calls=0;
 vm.runInNewContext(edge,{exports:{},Response,console:{error(){}},Deno:{serve:f=>handler=f},require:n=>n.includes('supabase-js')?{createClient:()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:user}:null}})},rpc:async()=>{calls++;return{data:{active:true,plan:'ultra'}}}})}:{corsHeaders:{},getEnv:()=> 'fake',json:(data,status=200)=>new Response(JSON.stringify(data),{status})},fetch:async()=>new Response(JSON.stringify({subscriber:{entitlements:{ultra:{expires_date:'2099-01-01',product_identifier:'test'}},subscriptions:{test:{is_sandbox:sandbox}}}}),{status:rcStatus})});
 const result=await handler(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer fictional'}}));
 return{status:result.status,calls};
}
test('edge rejects sandbox/unknown purchases and invalid sessions before any mutation',async()=>{
 for(const sandbox of [true,null])assert.deepEqual(await invoke({sandbox}),{status:409,calls:0});
 assert.deepEqual(await invoke({authenticated:false}),{status:401,calls:0});
 assert.deepEqual(await invoke({rcStatus:503}),{status:502,calls:0});
 assert.deepEqual(await invoke(),{status:200,calls:1});
});
