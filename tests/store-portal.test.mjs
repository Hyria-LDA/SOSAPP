import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',ADM='00000000-0000-0000-0000-000000000003',USER='00000000-0000-0000-0000-000000000004';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb DEFAULT '{}');
CREATE TYPE public.app_role AS ENUM ('admin','user','vendedor');
CREATE TABLE public.user_roles(user_id uuid REFERENCES auth.users,role app_role, UNIQUE(user_id,role));
CREATE FUNCTION public.has_role(_u uuid,_r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_u AND role=_r)$$;
CREATE TABLE public.banner_empresas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nome text NOT NULL,created_at timestamptz DEFAULT now());
ALTER TABLE public.banner_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY old_admin ON banner_empresas TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE vendedores_parceiros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,nome text,email text,codigo text UNIQUE,comissao_valor numeric,ativo boolean);
CREATE TABLE empresas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,onboarded boolean DEFAULT false,cidade text,estado text);
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;CREATE POLICY own ON empresas TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE TABLE cadastro_origens(empresa_id uuid,vendedor_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE indicacoes(empresa_id uuid,vendedor_id uuid,created_at timestamptz DEFAULT now(),primeira_conversao_em timestamptz);
CREATE TABLE vendedor_cliques(vendedor_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE materiais(empresa_id uuid);
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Intentionally broad legacy storage policies must not open the new bucket.
CREATE POLICY legacy ON storage.objects TO anon,authenticated USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA auth,public,storage TO authenticated,anon,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO authenticated,service_role;
GRANT SELECT ON storage.objects TO anon;
INSERT INTO auth.users(id,raw_app_meta_data) VALUES ('${A}','{"store_provisioning":true}'),('${B}','{"store_provisioning":true}'),('${ADM}','{}'),('${USER}','{}');
INSERT INTO user_roles VALUES ('${ADM}','admin'),('${USER}','user');`);
await db.exec(readFileSync('supabase/migrations/20260930100000_store_partner_role.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260930101000_store_portal.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261001100000_store_multiple_referrals.sql','utf8'));
// Freeze São Paulo business date for deterministic boundary checks.
await db.exec("CREATE OR REPLACE FUNCTION store_today() RETURNS date LANGUAGE sql STABLE AS $$SELECT '2026-10-01'::date$$");
async function who(id,role='authenticated'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`SET ROLE ${role}`)}
async function call(sql,args=[]){return (await db.query(sql,args)).rows[0]?.v}
async function fails(sql,args=[]){await assert.rejects(db.query(sql,args));}
await who(null,'service_role');
const sa=await call('SELECT store_provision($1,$2,$3,$4) v',[A,'a@example.com','Loja A','LOJAA']);const sb=await call('SELECT store_provision($1,$2,$3,$4) v',[B,'b@example.com','Loja B','LOJAB']);
await fails('SELECT store_provision($1,$2,$3,$4)',[USER,'normal@example.com','Normal','NORMAL']);
await who(A);assert.equal((await call('SELECT store_snapshot() v')).store.id,sa);await fails('SELECT store_snapshot($1)',[sb]);await fails('SELECT store_admin_list()');await fails('SELECT store_provision($1,$2,$3,$4)',[USER,'x@x.com','X','XXX']);
assert.equal((await db.query('SELECT * FROM banner_empresas')).rows.length,1);
await fails('SELECT store_save_profile($1,$2)',[sa,{cnpj:'forged'}]);await call('SELECT store_save_profile($1,$2) v',[sa,{phone:'123'}]);await fails('SELECT store_save_profile($1,$2)',[sb,{phone:'123'}]);
await fails("INSERT INTO empresas(owner_id) VALUES(auth.uid())");
await fails('SELECT store_save_contract($1,$2)',[sa,{}]);
await who(ADM);
const contract={name:'Outubro',start_date:'2026-10-01',end_date:'2026-10-31',segment:'MDF',region:'BH',cities:['Belo Horizonte/MG'],states:[],banners_per_week:1,status:'enabled'};
const ca=await call('SELECT store_save_contract($1,$2) v',[sa,contract]);const cb=await call('SELECT store_save_contract($1,$2) v',[sb,{...contract,name:'B'}]);
const future=await call('SELECT store_save_contract($1,$2) v',[sa,{...contract,start_date:'2026-11-01',end_date:'2026-11-30'}]);
await who(A);const snap=await call('SELECT store_snapshot() v');assert.equal(snap.contracts.find(c=>c.id===ca).weeks.length,5);assert.equal(snap.contracts.find(c=>c.id===ca).weeks[4].end_date,'2026-10-31');
await fails('SELECT store_reserve_banner($1,1)',[cb]);await fails('SELECT store_reserve_banner($1,1)',[future]);await fails('SELECT store_reserve_banner($1,null)',[ca]);await fails('SELECT store_reserve_banner($1,6)',[ca]);
const b=await call('SELECT to_jsonb(store_reserve_banner($1,1)) v',[ca]);await fails('SELECT store_reserve_banner($1,1)',[ca]);await fails("UPDATE store_banners SET approval='approved' WHERE id=$1",[b.id]);
await fails('SELECT store_submit_banner($1,$2,$3,$4)',[b.id,'Arte','https://example.com','horizontal']);
await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['store-media',b.image_path]);
await fails('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['store-media',sb+'/logo/forged.png']);
await call('SELECT store_submit_banner($1,$2,$3,$4) v',[b.id,'Arte','https://example.com','horizontal']);
await fails('SELECT store_review_banner($1,$2)',[b.id,{approval:'approved'}]);
await who(B);assert.equal((await db.query('SELECT * FROM store_banners')).rows.length,0);assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);await fails('SELECT store_metrics($1)',[sa]);
await who(null,'anon');assert.deepEqual(await call('SELECT store_live_banners() v'),[]);assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);await fails('SELECT store_snapshot($1)',[sa]);
await who(ADM);await fails('SELECT store_review_banner($1,$2)',[b.id,{approval:'rejected'}]);await fails('SELECT store_review_banner($1,$2)',[b.id,{approval:'approved',end_date:'2026-10-08'}]);await call('SELECT store_review_banner($1,$2) v',[b.id,{approval:'rejected',rejection_reason:'Ajustar texto'}]);
await who(A);const replacement=await call('SELECT to_jsonb(store_reserve_banner($1,1,$2)) v',[ca,b.id]);assert.equal(replacement.id,b.id);assert.notEqual(replacement.image_path,b.image_path);await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['store-media',replacement.image_path]);await call('SELECT store_submit_banner($1,$2,$3,$4) v',[b.id,'Arte corrigida','','horizontal']);
await who(ADM);await call('SELECT store_review_banner($1,$2) v',[b.id,{approval:'approved'}]);await fails('SELECT store_save_contract($1,$2)',[sa,{...contract,id:ca,banners_per_week:2}]);
await who(A);await fails('SELECT store_reserve_banner($1,1,$2)',[ca,b.id]);await db.exec('RESET ROLE');await db.query('INSERT INTO empresas(owner_id,onboarded,cidade,estado) VALUES($1,true,$2,$3)',[USER,'Belo Horizonte','MG']);
await who(USER);const live=await call('SELECT store_live_banners() v');assert.equal(live.length,1);assert.equal(live[0].titulo,null);assert.equal(live[0].data_fim,'2026-10-08T03:00:00Z');
await call('SELECT store_banner_event($1,true) v',[b.id]);
await db.exec('RESET ROLE');await db.query('UPDATE empresas SET cidade=$1 WHERE owner_id=$2',['Juiz de Fora',USER]);
await who(USER);assert.equal((await call('SELECT store_live_banners() v')).length,0);
// Aggregates count each referred company once even when both origin tables contain it.
await db.exec('RESET ROLE');
const pid=await call('SELECT partner_id v FROM banner_empresas WHERE id=$1',[sa]);
const eid=await call('SELECT id v FROM empresas WHERE owner_id=$1',[USER]);
await db.query("INSERT INTO cadastro_origens VALUES($1,$2,'2026-10-01T12:00:00Z')",[eid,pid]);
await db.query("INSERT INTO indicacoes VALUES($1,$2,'2026-10-01T12:00:00Z','2026-10-01T13:00:00Z')",[eid,pid]);
await db.query("INSERT INTO vendedor_cliques VALUES($1,'2026-10-01T12:00:00Z')",[pid]);
await db.query('INSERT INTO materiais VALUES($1)',[eid]);
await who(A);const metrics=await call('SELECT store_metrics($1) v',[sa]);assert.equal(metrics.registrations,1);assert.equal(metrics.completed,1);assert.equal(metrics.publishers,1);assert.equal(metrics.subscriptions,1);assert.equal(metrics.today,1);assert.equal(metrics.daily.at(-1).registrations,1);
assert.equal((await db.query('UPDATE storage.objects SET name=$1 WHERE name=$2 RETURNING name',['changed',replacement.image_path])).rows.length,0);
// Multiple requests for the same slot cannot both reserve it.
const attempts=await Promise.allSettled([db.query('SELECT store_reserve_banner($1,2)',[ca]),db.query('SELECT store_reserve_banner($1,2)',[ca])]);assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);
await who(ADM);await call('SELECT store_save_contract($1,$2) v',[sa,{...contract,id:ca,status:'suspended'}]);assert.equal(await call('SELECT store_banner_live($1) v',[b.id]),false);await call('SELECT store_save_contract($1,$2) v',[sa,{...contract,id:ca}]);await call('SELECT store_admin_settings($1,$2,$3,$4) v',[sa,'Loja A','inactive',['phone']]);
await who(A);await fails('SELECT store_snapshot()');await fails('SELECT store_reserve_banner($1,2)',[ca]);assert.equal((await db.query('SELECT * FROM storage.objects')).rows.length,0);
await who(ADM);await call('SELECT store_admin_settings($1,$2,$3,$4) v',[sa,'Loja A','active',['phone']]);await db.exec('RESET ROLE');await db.exec("CREATE OR REPLACE FUNCTION store_today() RETURNS date LANGUAGE sql STABLE AS $$SELECT '2026-11-01'::date$$");assert.equal(await call('SELECT store_banner_live($1) v',[b.id]),false);
await who(A);await fails('SELECT store_reserve_banner($1,2)',[ca]);assert.equal((await call('SELECT store_snapshot() v')).banners.find(x=>x.id===b.id).effective_status,'expired');

// Multiple referral links: isolated reports and distinct combined registrations.
await db.exec('RESET ROLE');
const p2=await call("INSERT INTO vendedores_parceiros(codigo,nome,ativo) VALUES('EXTRA2','Filial 2',true) RETURNING id v");
const p3=await call("INSERT INTO vendedores_parceiros(codigo,nome,ativo) VALUES('EXTRA3','Filial 3',true) RETURNING id v");
const eb=await call("INSERT INTO empresas(owner_id,onboarded) VALUES(gen_random_uuid(),true) RETURNING id v");
await db.query("INSERT INTO cadastro_origens VALUES($1,$2,'2026-10-01T12:00:00Z'),($3,$2,'2026-10-01T12:00:00Z')",[eid,p2,eb]);
await db.query("INSERT INTO vendedor_cliques VALUES($1,'2026-10-01T12:00:00Z'),($2,'2026-10-01T12:00:00Z')",[p2,p3]);
await who(A);await fails('SELECT store_link_referral($1,$2)',[sa,'EXTRA2']);
await who(ADM);await call('SELECT store_link_referral($1,$2) v',[sa,'EXTRA2']);await call('SELECT store_link_referral($1,$2) v',[sa,'EXTRA3']);
await fails('SELECT store_link_referral($1,$2)',[sb,'EXTRA2']);await fails('SELECT store_link_referral($1,$2)',[sa,'LOJAB']);await fails('SELECT store_link_referral($1,$2,true)',[sa,'LOJAA']);
await who(A);assert.equal((await call('SELECT store_referrals($1) v',[sa])).length,3);assert.equal((await db.query('SELECT * FROM store_referral_links')).rows.length,2);
const allLinks=await call('SELECT store_metrics($1) v',[sa]);assert.equal(allLinks.clicks,3);assert.equal(allLinks.registrations,2);
const oneLink=await call('SELECT store_referral_metrics($1,$2) v',[sa,p2]);assert.equal(oneLink.clicks,1);assert.equal(oneLink.registrations,2);
assert.equal((await call('SELECT store_snapshot() v')).metrics.clicks,3);
await who(B);await fails('SELECT store_referrals($1)',[sa]);await fails('SELECT store_referral_metrics($1,$2)',[sb,p2]);assert.equal((await db.query('SELECT * FROM store_referral_links')).rows.length,0);
await who(null,'anon');await fails('SELECT store_referrals($1)',[sa]);
await who(ADM);await call('SELECT store_link_referral($1,$2,true) v',[sa,'EXTRA2']);
await who(A);await fails('SELECT store_referral_metrics($1,$2)',[sa,p2]);assert.equal((await call('SELECT store_metrics($1) v',[sa])).clicks,2);
await db.exec('RESET ROLE');assert.equal(await call('SELECT count(*)::int v FROM vendedor_cliques WHERE vendedor_id=$1',[p2]),1);
console.log('PASS: três links por loja, relatório individual/consolidado, cadastros sem duplicação, vínculo exclusivo, bloqueio entre lojas e desvínculo sem apagar histórico.');

console.log('PASS: migrações executadas em PostgreSQL/PGlite; provisionamento, RLS, isolamento, arquivos, permissões, quotas, semanas, substituição, aprovação, região, suspensão e expiração.');await db.close();
