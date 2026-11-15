import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { test } from "node:test";
const source=readFileSync("src/lib/brilhante-theme.ts","utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {hasBrilhanteTheme}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const now=Date.parse("2026-11-14T12:00:00Z");
const plan={plano:{slug:"ultra"},vencido:false,plano_vencimento:"2026-11-15T12:00:00Z"};
test("Brilhante válido e concessão manual sem vencimento recebem cinza claro",()=>{
 assert.equal(hasBrilhanteTheme(plan,now),true);
 assert.equal(hasBrilhanteTheme({...plan,plano_vencimento:null},now),true);
 assert.equal(hasBrilhanteTheme({...plan,plano:{slug:"premium"}},now),true);
});
test("Free, falta de sessão/plano e datas inválidas não ativam cinza claro",()=>{
 for(const candidate of [null,undefined,{...plan,plano:{slug:"free"}},{...plan,plano:{slug:"tx"}},{...plan,plano_vencimento:"inválida"}])
  assert.equal(hasBrilhanteTheme(candidate,now),false);
});
test("Vencimento remove o tema mesmo se os dados ainda estiverem em cache",()=>{
 assert.equal(hasBrilhanteTheme({...plan,vencido:true},now),false);
 assert.equal(hasBrilhanteTheme(plan,Date.parse(plan.plano_vencimento)),false);
 assert.equal(hasBrilhanteTheme(plan,Date.parse(plan.plano_vencimento)+1),false);
});
test("Contraste dos pares principais é de pelo menos 4,5:1",()=>{
 const css=readFileSync("src/styles.css","utf8").split(":root.brilhante-cinza {")[1].split("}")[0];
 const tokens=Object.fromEntries([...css.matchAll(/--([a-z-]+): (#[0-9a-f]{6});/g)].map(m=>[m[1],m[2]]));
 const lum=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const [bg,fg] of [["background","foreground"],["card","card-foreground"],["popover","popover-foreground"],["primary","primary-foreground"],["muted","muted-foreground"],["destructive","destructive-foreground"],["success","success-foreground"]]){
  const a=lum(tokens[bg]),b=lum(tokens[fg]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${bg}/${fg}`);
 }
});
