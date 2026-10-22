import ts from 'typescript';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const helper=readFileSync('supabase/functions/_shared/push-audience.ts','utf8').replaceAll('export ','');
const endpoint=readFileSync('supabase/functions/send-push-regional/index.ts','utf8').replace(/import[\s\S]*?from\s+"[^"]+";/g,'');
let handler,sends=[],writes=[],isAdmin=true,valid=true,failTable='';
const companies=Array.from({length:501},(_,i)=>({id:`c${i}`,owner_id:`complete${i}`,onboarded:true}));
companies.push({id:'incomplete',owner_id:'pending',onboarded:false});
const special=[{user_id:'admin',role:'admin'},{user_id:'seller',role:'vendedor'},{user_id:'store',role:'store_partner'}];
const tokens=[...companies.map(c=>({id:c.id,user_id:c.owner_id,token:c.owner_id,active:true})),...['no-company','admin','seller','store','inactive'].map(id=>({id,user_id:id,token:id,active:id!=='inactive'})),{id:'second',user_id:'pending',token:'pending-second',active:true}];
const client={auth:{getUser:async()=>({data:{user:valid?{id:'admin'}:null}})},from(table){let data=table==='empresas'?companies:table==='push_tokens'?tokens:table==='user_roles'?special:[];
const q={select(){return q},eq(k,v){data=data.filter(row=>row[k]===v);if(table==='user_roles'&&k==='user_id'&&!isAdmin)data=[];return q},in(k,values){data=data.filter(row=>values.includes(row[k]));return q},order(){return q},range(a,b){data=data.slice(a,b+1);return q},insert(rows){writes.push({table,rows});return q},update(){return q},then(resolve){return Promise.resolve({data,error:table===failTable?new Error('database unavailable'):null}).then(resolve)}};return q;}};
vm.runInNewContext(ts.transpileModule(helper+'\n'+endpoint,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{Deno:{serve:fn=>handler=fn},createClient:()=>client,getEnv:()=>'',corsHeaders:{},json:(d,status=200)=>new Response(JSON.stringify(d),{status}),sendFirebasePush:async x=>{sends.push(x);return {ok:true}},shouldDeactivateToken:()=>false,Response,URL,console:{error(){}}});
async function call(extra={}){sends=[];writes=[];return handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({target:'no_registration',title:'Finalize seu cadastro',body:'Falta pouco!',...extra})}));}
let r=await call({preview:true});assert.equal(r.status,200);let preview=await r.json();assert.equal(preview.clients,2);assert.equal(preview.total,3);assert.equal(sends.length,0);assert.equal(writes.length,0);
r=await call();assert.equal(r.status,200);assert.deepEqual(sends.map(x=>x.token).sort(),['no-company','pending','pending-second']);assert.ok(sends.every(x=>x.data.path==='/onboarding'));assert.equal(writes.find(x=>x.table==='notificacoes').rows.length,2);assert.equal(writes.find(x=>x.table==='push_broadcasts').rows.target,'no_registration');
// Recompute at send time: a completed registration must no longer receive the message.
companies.find(c=>c.owner_id==='pending').onboarded=true;r=await call();assert.deepEqual(sends.map(x=>x.token),['no-company']);
r=await call({cities:['BH'],uf:'MG'});assert.equal(r.status,400);assert.equal(sends.length,0);
r=await call({external_url:'https://example.com'});assert.equal(r.status,400);assert.equal(sends.length,0);
failTable='empresas';r=await call();assert.equal(r.status,500);assert.equal(sends.length,0);assert.equal(writes.length,0);failTable='';
isAdmin=false;r=await call();assert.equal(r.status,403);assert.equal(sends.length,0);isAdmin=true;valid=false;r=await call();assert.equal(r.status,401);
console.log('PASS: cadastros incompletos e sem empresa, exclusão de perfis especiais/concluídos, paginação 501, prévia sem envio, deduplicação, revalidação e autorização. Nenhum push real.');
