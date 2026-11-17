import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const uid='00000000-0000-4000-8000-000000000001';
const source=readFileSync(new URL('../supabase/migrations/20261117230000_behavior_analytics.sql',import.meta.url),'utf8');
// PGlite has no pg_cron: execute the complete schema/RPCs, excluding only scheduling.
const migration=source.split('-- Retention scheduler')[0]+'COMMIT;';
const event=(extra={})=>({id:crypto.randomUUID(),session:crypto.randomUUID(),event:'page_view',screen:'buscar',action:'',platform:'web',at:new Date().toISOString(),...extra});
const record=async events=>(await db.query('SELECT record_behavior_events($1::jsonb) AS n',[JSON.stringify(events)])).rows[0].n;
async function scenario(run){await db.exec('BEGIN');try{await run()}finally{await db.exec('ROLLBACK')}}
before(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${uid}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
 CREATE TABLE user_roles(user_id uuid,role text);CREATE TABLE empresas(owner_id uuid,cidade text,estado text);
 INSERT INTO empresas VALUES('${uid}','Belo Horizonte','MG');SET test.uid='${uid}';`);
 await db.exec(migration);
});
after(()=>db.close());
test('server derives account and region; repeated delivery is idempotent',()=>scenario(async()=>{
 const e=event({estado:'SP',cidade:'fake',user_id:'fake'});assert.equal(await record([e]),1);assert.equal(await record([e]),0);
 const r=(await db.query('SELECT user_id,estado,cidade FROM behavior_events')).rows[0];
 assert.deepEqual(r,{user_id:uid,estado:'MG',cidade:'Belo Horizonte'});
}));
test('rejects arbitrary content and stale/invalid timestamps; roles are excluded',()=>scenario(async()=>{
 assert.equal(await record([event({screen:'secret?email=private'}),event({event:'password'}),event({at:'invalid'}),event({at:'2020-01-01'})]),0);
 await db.exec(`INSERT INTO user_roles VALUES('${uid}','admin')`);assert.equal(await record([event()]),0);
}));
test('only admin sees aggregated report and region filters are applied',()=>scenario(async()=>{
 await record([event({event:'notification_open',action:'push'}),event()]);
 await db.exec("SAVEPOINT denied");await assert.rejects(db.query('SELECT admin_behavior_report()'),/not_authorized/);await db.exec('ROLLBACK TO denied');
 await db.exec("SET LOCAL test.admin='true'");
 const r=(await db.query("SELECT admin_behavior_report(30,'MG','Belo Horizonte') AS r")).rows[0].r;
 assert.equal(r.users,1);assert.equal(r.notification_opens,1);assert.equal(r.notification_users,1);
 assert.equal(JSON.stringify(r).includes(uid),false);
 assert.equal((await db.query("SELECT admin_behavior_report(30,'SP','') AS r")).rows[0].r.users,0);
}));
test('authenticated role cannot select raw records or run purge',()=>scenario(async()=>{
 await db.exec('SET LOCAL ROLE authenticated; SAVEPOINT denied');
 await assert.rejects(db.query('SELECT * FROM behavior_events'),/permission denied/);await db.exec('ROLLBACK TO denied; SAVEPOINT denied2');
 await assert.rejects(db.query('SELECT purge_behavior_events()'),/permission denied/);await db.exec('ROLLBACK TO denied2');
 assert.equal(await record([event()]),1);
}));
test('bounded batches and rate limit protect storage',()=>scenario(async()=>{
 for(let i=0;i<4;i++)assert.equal(await record(Array.from({length:30},()=>event())),30);
 assert.equal(await record([event()]),0);
}));
test('purge deletes old events and migration can be reapplied',async()=>{
 await record([event()]);await db.exec("UPDATE behavior_events SET occurred_at=now()-interval '91 days'; SELECT purge_behavior_events()");
 assert.equal((await db.query('SELECT count(*)::int AS n FROM behavior_events')).rows[0].n,0);
 await db.exec(migration);
});
