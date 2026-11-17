import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync(new URL('../src/lib/geocode.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const feature=(country,state,city,coordinates)=>({properties:{country,state,city},geometry:{coordinates}});
async function locate(features,nominatim=[]){const exports={};vm.runInNewContext(code,{exports,fetch:async url=>({ok:true,json:async()=>url.includes('photon')?{features}:nominatim})});return exports.geocodeAddress({cidade:'Belo Horizonte',estado:'MG'});}
test('MG matches Minas Gerais and rejects a foreign first result',async()=>{
 const r=await locate([feature('Portugal','Lisboa','Lisboa',[-9,38]),feature('Brasil','Minas Gerais','Belo Horizonte',[-43,-19])]);
 assert.equal(r.lat,-19);assert.equal(r.lng,-43);
});
test('wrong city, missing country and invalid coordinates cannot be used as fallback',async()=>{
 assert.equal(await locate([feature('Brasil','Minas Gerais','Belo Horizonte do Norte',[-43,-19]),feature(undefined,'MG','Belo Horizonte',[-43,-19]),feature('Brasil','MG','Belo Horizonte',[400,200])]),null);
});
test('Nominatim also validates exact region before accepting coordinates',async()=>{
 const wrong={lat:'38',lon:'-9',address:{country_code:'pt',state:'Lisboa',city:'Lisboa'}};
 assert.equal(await locate([], [wrong]),null);
 const right={lat:'-19',lon:'-43',address:{country_code:'br',state:'Minas Gerais',city:'Belo Horizonte'}};
 assert.equal((await locate([], [wrong,right])).lat,-19);
});
