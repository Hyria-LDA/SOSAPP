import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/whatsapp.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
test('Brazil country code and DDD are distinguished by number length',()=>{
 for(const [input,expected] of [['3496568962','553496568962'],['(34) 99656-8962','5534996568962'],['+55 (34) 99656-8962','5534996568962'],['005534996568962','5534996568962'],['55999998888','5555999998888'],['5532345678','555532345678']])assert.equal(exports.normalizeBrazilianWhatsapp(input),expected);
 for(const input of ['', '96568962','123456789012345','+1 123456789012'])assert.equal(exports.normalizeBrazilianWhatsapp(input),null);
 const message='Olá! Quero a peça & preço?';
 const url=new URL(exports.waLink('3496568962',message));
 assert.equal(url.pathname,'/553496568962');assert.equal(url.searchParams.get('text'),message);
});
