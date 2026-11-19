import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/material-search-order.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('numeric prices, zero distance, absent distances and deterministic ties',()=>{
 const rows=[{id:'a',preco:'100',distancia:null,created_at:'2026-01-01'},{id:'b',preco:'9',distancia:0,created_at:'2026-01-01'},{id:'c',preco:0,distancia:2,created_at:'2026-01-01'}];
 assert.equal(exports.sortMaterialResults(rows,'preco').map(r=>r.id).join(','),'c,b,a');
 assert.equal(exports.sortMaterialResults(rows,'distancia').map(r=>r.id).join(','),'b,c,a');
 assert.equal(rows[0].id,'a');
});
test('orders all matching ads before limit, applies radius/dimensions and respects RLS',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE materiais(id uuid PRIMARY KEY,preco numeric,created_at timestamptz,status text,latitude double precision,longitude double precision,fabricante_id uuid,padrao_id uuid,espessura_mm numeric,comprimento_cm numeric,largura_cm numeric);
 INSERT INTO materiais SELECT md5(i::text)::uuid,100,now(),'ativo',1,0,NULL,NULL,18,100,50 FROM generate_series(1,130) i;
 INSERT INTO materiais VALUES('00000000-0000-0000-0000-000000000001',1,now(),'ativo',0,0,NULL,NULL,18,200,100);
 INSERT INTO materiais VALUES('00000000-0000-0000-0000-000000000002',0,now(),'oculto',0,0,NULL,NULL,18,200,100);
 ALTER TABLE materiais ENABLE ROW LEVEL SECURITY;
 CREATE POLICY visible ON materiais FOR SELECT TO anon,authenticated USING(status='ativo' AND preco>0);
 GRANT SELECT ON materiais TO anon,authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261119140000_material_search_order.sql',import.meta.url),'utf8'));
 await db.exec('SET ROLE authenticated');
 const cheap=(await db.query("SELECT * FROM material_search_order('preco',_radius=>0)")).rows;
 assert.equal(cheap.length,120);assert.equal(cheap[0].id,'00000000-0000-0000-0000-000000000001');
 const near=(await db.query("SELECT * FROM material_search_order('distancia',0,0,50)")).rows;
 assert.equal(near.length,1);assert.equal(near[0].id,cheap[0].id);
 assert.equal((await db.query("SELECT * FROM material_search_order('preco',_length=>150,_width=>75)")).rows.length,1);
 assert.equal((await db.query("SELECT * FROM material_search_order('preco',_length=>75,_width=>150)")).rows.length,0);
 assert.equal((await db.query("SELECT * FROM material_search_order('preco',_length=>75,_width=>150,_rotate=>true)")).rows.length,1);
 assert.equal((await db.query("SELECT * FROM material_search_order('preco',_thickness=>ARRAY[25]::numeric[])")).rows.length,0);
 await db.exec('RESET ROLE');
 await db.exec("UPDATE materiais SET preco=0 WHERE id='00000000-0000-0000-0000-000000000001'; SET ROLE anon");
 assert.equal((await db.query("SELECT * FROM material_search_order('distancia',0,0,50)")).rows.length,0);
 } finally {await db.close();}
});
