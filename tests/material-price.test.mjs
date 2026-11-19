import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/material-price.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('Brazilian currency validation and discount visibility',()=>{
 for(const [text,expected] of [['80,50',80.5],['1.200,50',1200.5],['0',0],['',null],['-1',null],['1e3',null],['10,123',null],['NaN',null]])assert.equal(exports.parseMaterialPrice(text),expected);
 assert.equal(exports.hasReducedPrice(80,100),true);
 assert.equal(exports.hasReducedPrice(100,80),false);
 assert.equal(exports.hasReducedPrice(80,null),false);
});
test('only owner edits available ads; prior price is derived, concurrency guarded, dates preserved',async()=>{
 const db=new PGlite();
 const owner='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE empresas(id uuid PRIMARY KEY,owner_id uuid);
 CREATE TABLE materiais(id uuid PRIMARY KEY,empresa_id uuid,preco numeric(10,2),status text,created_at timestamptz DEFAULT now(),area_m2 numeric DEFAULT 2,valor_m2 numeric GENERATED ALWAYS AS (preco/area_m2) STORED);
 INSERT INTO empresas VALUES('${owner}','${owner}');
 INSERT INTO materiais(id,empresa_id,preco,status) VALUES('${owner}','${owner}',100,'ativo');
 ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
 CREATE POLICY visible ON materiais FOR SELECT USING(true);
 CREATE POLICY own_update ON materiais FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM empresas e WHERE e.id=empresa_id AND e.owner_id=auth.uid()));
 GRANT SELECT,UPDATE ON materiais TO authenticated; GRANT SELECT ON empresas TO authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261119150000_edit_material_price.sql',import.meta.url),'utf8'));
 const update=(price,expected)=>db.query('SELECT update_my_material_price($1,$2,$3)',[owner,price,expected]);
 await db.exec('SET ROLE anon');await assert.rejects(update(80,100),/permission denied/);
 await db.exec('RESET ROLE;SET ROLE authenticated');
 await db.query("SELECT set_config('test.uid',$1,false)",[other]);await assert.rejects(update(80,100),/indisponível/);
 await db.query("SELECT set_config('test.uid',$1,false)",[owner]);
 const before=(await db.query('SELECT created_at FROM materiais')).rows[0].created_at;
 for(const v of [-1,1.234,'NaN',null])await assert.rejects(update(v,100),/válido/);
 await update(80,100);
 let row=(await db.query('SELECT * FROM materiais')).rows[0];
 assert.equal(Number(row.preco_anterior),100);assert.equal(Number(row.valor_m2),40);assert.equal(row.created_at.getTime(),before.getTime());
 await assert.rejects(update(50,100),/preço alterado/);
 await db.exec('UPDATE materiais SET preco_anterior=9999');
 assert.equal(Number((await db.query('SELECT preco_anterior FROM materiais')).rows[0].preco_anterior),100);
 await update(60,80);assert.equal(Number((await db.query('SELECT preco_anterior FROM materiais')).rows[0].preco_anterior),80);
 await update(70,60);assert.equal((await db.query('SELECT preco_anterior FROM materiais')).rows[0].preco_anterior,null);
 await db.exec("UPDATE materiais SET status='vendido'");await assert.rejects(update(50,70),/indisponível/);
 } finally {await db.close();}
});
