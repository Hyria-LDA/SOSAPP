import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const old=readFileSync(new URL('../supabase/migrations/20260911100000_active_companies_only_ad_whatsapp.sql',import.meta.url),'utf8');
const patch=readFileSync(new URL('../supabase/migrations/20261002213000_secure_empresas_publica_view.sql',import.meta.url),'utf8');
test('unused company view is closed while public profile RPC and WhatsApp gate remain unchanged',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TYPE empresa_status AS ENUM ('ativa','pendente','suspensa');
 CREATE TABLE user_roles(user_id uuid,role text);
 CREATE FUNCTION has_role(_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_id AND role=_role)$$;
 CREATE TABLE planos(id uuid PRIMARY KEY,slug text,nome text);
 CREATE TABLE empresas(id uuid PRIMARY KEY,owner_id uuid,nome_empresa text,responsavel text,whatsapp text,telefone text,cidade text,estado text,latitude double precision,longitude double precision,logo_url text,avaliacao numeric,status empresa_status,created_at timestamptz DEFAULT now(),onboarded boolean,plano_id uuid,plano_vencimento timestamptz);
 ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own ON empresas FOR SELECT TO authenticated USING(owner_id=auth.uid());
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 GRANT SELECT ON empresas TO anon,authenticated;
 INSERT INTO empresas(id,owner_id,nome_empresa,whatsapp,status,onboarded) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Loja A','551111111111','ativa',true),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000022','Loja B','552222222222','ativa',true),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000033','Suspensa','553333333333','suspensa',true);`);
 // Use the exact legacy definitions of the view, public RPC and contact predicate.
 const endMarker='GRANT EXECUTE ON FUNCTION public.empresa_publica(uuid) TO anon, authenticated;';
 assert.ok(old.includes(endMarker));
 await db.exec(old.slice(0,old.indexOf(endMarker)+endMarker.length));
 const profileDefinition=(await db.query("SELECT pg_get_functiondef('empresa_publica(uuid)'::regprocedure) AS def")).rows[0].def;
 await db.exec('SET ROLE anon');
 assert.equal((await db.query('SELECT * FROM empresas')).rows.length,0);
 assert.equal((await db.query('SELECT * FROM empresas_publica')).rows.length,2);
 const profileBefore=(await db.query("SELECT * FROM empresa_publica('00000000-0000-0000-0000-000000000001')")).rows;
 assert.equal(profileBefore[0].whatsapp,null);
 await db.exec('RESET ROLE');await db.exec(patch);await db.exec(patch);
 assert.ok((await db.query("SELECT reloptions FROM pg_class WHERE oid='empresas_publica'::regclass")).rows[0].reloptions.includes('security_invoker=true'));
 assert.equal((await db.query("SELECT pg_get_functiondef('empresa_publica(uuid)'::regprocedure) AS def")).rows[0].def,profileDefinition);
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query('SELECT * FROM empresas_publica'),e=>e.code==='42501');
  assert.deepEqual((await db.query("SELECT * FROM empresa_publica('00000000-0000-0000-0000-000000000001')")).rows,profileBefore);
  assert.equal((await db.query("SELECT * FROM empresa_publica('00000000-0000-0000-0000-000000000003')")).rows.length,0);
  await db.exec('RESET ROLE');
 }
 // Even if read permission is granted again, invoker mode respects RLS.
 await db.exec('GRANT SELECT ON empresas_publica TO authenticated');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['00000000-0000-0000-0000-000000000011']);
 await db.exec('SET ROLE authenticated');
 const rows=(await db.query('SELECT * FROM empresas_publica')).rows;assert.equal(rows.length,1);assert.equal(rows[0].nome_empresa,'Loja A');
 assert.equal((await db.query("SELECT * FROM empresa_publica('00000000-0000-0000-0000-000000000002')")).rows[0].whatsapp,'552222222222');
 await db.exec('RESET ROLE');await db.exec(patch);
 await db.exec('DROP VIEW empresas_publica');await db.exec(patch);
 }finally{await db.close()}
});
