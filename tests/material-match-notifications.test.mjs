import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const buyer = "00000000-0000-4000-8000-000000000001";
const seller = "00000000-0000-4000-8000-000000000002";
const company = "00000000-0000-4000-8000-000000000003";
const source = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const fix = () => source("20261024120000_fix_material_match_notifications.sql");
async function scalar(sql) { return Object.values((await db.query(sql)).rows[0])[0]; }
async function material(overrides = {}) {
  const row = { empresa_id: company, padrao: "Branco", fabricante: "Marca", espessura_mm: 18,
    comprimento_cm: 100, largura_cm: 50, status: "ativo", ...overrides };
  const keys = Object.keys(row);
  return (await db.query(`INSERT INTO materiais (${keys.join(",")}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(",")}) RETURNING id`, Object.values(row))).rows[0].id;
}
async function scenario(run) {
  await db.exec("BEGIN");
  try { await run(); } finally { await db.exec("ROLLBACK"); }
}
before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE planos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
    CREATE TABLE empresas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid,
      plano_id uuid, plano text, plano_vencimento timestamptz, latitude float8, longitude float8);
    CREATE TABLE materiais(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid,
      padrao text, fabricante text, espessura_mm numeric, comprimento_cm numeric, largura_cm numeric,
      status text DEFAULT 'ativo', created_at timestamptz DEFAULT now());
    CREATE TABLE pedidos_material(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      padrao text, fabricante text, espessura_mm numeric, comprimento_min_cm numeric, largura_min_cm numeric,
      medidas_invertiveis boolean DEFAULT false, status text DEFAULT 'ativo', latitude float8, longitude float8, raio_km numeric DEFAULT 50);
    CREATE TABLE notificacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, tipo text,
      titulo text, mensagem text, material_id uuid, pedido_id uuid);
    INSERT INTO auth.users VALUES ('${buyer}'), ('${seller}');
    INSERT INTO planos(slug) VALUES ('ultra');
    INSERT INTO empresas(owner_id,plano_id,plano) SELECT '${buyer}',id,'ultra' FROM planos;
    INSERT INTO empresas(id,owner_id) VALUES ('${company}','${seller}');
    INSERT INTO pedidos_material(user_id,padrao,fabricante,espessura_mm,comprimento_min_cm,largura_min_cm)
      VALUES ('${buyer}','Branco','Marca',18,100,50);
  `);
  const original = await source("20260612160616_917766be-a6b1-4699-81f2-bb04d2d91ad4.sql");
  await db.exec(original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public.haversine_km"), original.indexOf("-- Match trigger")));
  // pg_cron is unavailable in PGlite. Only scheduling is excluded; real queue/functions run.
  const priority = await source("20260830190000_prioritize_brilhante_match_notifications.sql");
  await db.exec(priority.replace("CREATE EXTENSION IF NOT EXISTS pg_cron;", "").split("DO $$")[0]);
  await db.exec(await source("20260830213000_reduce_match_notification_delay_to_30_minutes.sql"));
  await db.exec(await source("20260830230000_match_renewed_materials.sql"));
  await db.exec(`CREATE TRIGGER trg_match_materiais AFTER INSERT ON pedidos_material
    FOR EACH ROW EXECUTE FUNCTION match_materiais_on_pedido()`);
  // Reproduce both regressions before applying the fix.
  await scenario(async () => {
    assert.equal(await scalar(`SELECT is_brilhante_user('${buyer}')`), false);
    await material();
    assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
    assert.equal(await scalar("SELECT count(*) FROM match_notifications_queue"), 1);
  });
  await scenario(async () => {
    const id = await material({status:"em_revisao"});
    await db.query("UPDATE materiais SET status='ativo' WHERE id=$1", [id]);
    assert.equal(await scalar("SELECT count(*) FROM match_notifications_queue"), 0);
  });
  await db.exec(await fix());
});
after(() => db.close());

test("medidas iguais e maiores avisam imediatamente o Brilhante atual", () => scenario(async () => {
  await material(); await material({comprimento_cm:120,largura_cm:70});
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 2);
  assert.equal(await scalar("SELECT count(*) FROM match_notifications_queue"), 0);
}));
test("medidas menores, espessura e padrao diferentes nao avisam", () => scenario(async () => {
  await material({comprimento_cm:99}); await material({largura_cm:49});
  await material({espessura_mm:15}); await material({padrao:"Preto"});
  await material({fabricante:"Outra"});
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
}));
test("giro depende da autorizacao na busca", () => scenario(async () => {
  await material({comprimento_cm:50,largura_cm:100});
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
  await db.exec("UPDATE pedidos_material SET medidas_invertiveis=true");
  await material({comprimento_cm:50,largura_cm:100});
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 1);
}));
test("ativacao gera aviso; edicao comum nao repete", () => scenario(async () => {
  const id = await material({status:"em_revisao"});
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
  await db.query("UPDATE materiais SET status='ativo' WHERE id=$1", [id]);
  await db.query("UPDATE materiais SET status='ativo', comprimento_cm=110, created_at=now() WHERE id=$1", [id]);
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 1);
}));
test("renovacao de anuncio vencido continua avisando", () => scenario(async () => {
  const id = await material({created_at:"2020-01-01"});
  await db.exec("DELETE FROM notificacoes");
  await db.query("UPDATE materiais SET created_at=now() WHERE id=$1", [id]);
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 1);
}));
test("Free e Brilhante vencido aguardam 30 minutos e fila entrega", () => scenario(async () => {
  await db.exec(`UPDATE empresas SET plano_vencimento=now()-interval '1 day' WHERE owner_id='${buyer}'`);
  await material();
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
  assert.equal(await scalar("SELECT bool_and(deliver_at=created_at+interval '30 minutes') FROM match_notifications_queue"), true);
  assert.equal(await scalar("SELECT release_due_match_notifications()"), 0);
  await db.exec("UPDATE match_notifications_queue SET deliver_at=now()-interval '1 second'");
  assert.equal(await scalar("SELECT release_due_match_notifications()"), 1);
  assert.equal(await scalar("SELECT release_due_match_notifications()"), 0);
  await db.exec(`UPDATE empresas SET plano_id=null,plano='free',plano_vencimento=null WHERE owner_id='${buyer}'`);
  await material();
  assert.equal(await scalar("SELECT count(*) FROM match_notifications_queue"), 1);
}));
test("busca nova encontra sobra existente", () => scenario(async () => {
  await db.exec("DELETE FROM pedidos_material"); await material();
  await db.exec(`INSERT INTO pedidos_material(user_id,padrao,fabricante,espessura_mm,comprimento_min_cm,largura_min_cm)
    VALUES ('${buyer}','Branco','Marca',18,100,50)`);
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 1);
}));
test("nao avisa dono da sobra, busca cancelada ou fora do raio", () => scenario(async () => {
  await db.exec(`UPDATE empresas SET owner_id='${buyer}' WHERE id='${company}'`);
  await material();
  await db.exec(`UPDATE empresas SET owner_id='${seller}',latitude=0,longitude=0 WHERE id='${company}';
    UPDATE pedidos_material SET latitude=20,longitude=20`);
  await material();
  await db.exec("UPDATE pedidos_material SET status='cancelado',latitude=null,longitude=null");
  await material();
  assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
}));
test("fila descarta material indisponivel", () => scenario(async () => {
  await db.exec(`UPDATE empresas SET plano_id=null,plano='free' WHERE owner_id='${buyer}'`);
  await material();
  await db.exec("UPDATE materiais SET status='vendido'; UPDATE match_notifications_queue SET deliver_at=now()");
  assert.equal(await scalar("SELECT release_due_match_notifications()"), 0);
}));
test("migracao pode ser reaplicada e funcoes permanecem privadas", async () => {
  await db.exec(await fix());
  assert.equal(await scalar("SELECT has_function_privilege('authenticated','public.is_brilhante_user(uuid)','EXECUTE')"), false);
  assert.equal(await scalar("SELECT has_function_privilege('anon','public.match_pedidos_on_material()','EXECUTE')"), false);
});


test("aceita a funcao exata exportada do Supabase e preserva os filtros", async () => {
  await db.exec(await readFile(new URL("./fixtures/material-match-production.sql", import.meta.url), "utf8"));
  await db.exec(await fix());
  await scenario(async () => {
    await material({comprimento_cm:99});
    assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 0);
    const id = await material({status:"em_revisao"});
    await db.query("UPDATE materiais SET status='ativo' WHERE id=$1", [id]);
    await db.query("UPDATE materiais SET status='ativo' WHERE id=$1", [id]);
    assert.equal(await scalar("SELECT count(*) FROM notificacoes"), 1);
    await db.exec(`UPDATE empresas SET plano_id=null,plano='free' WHERE owner_id='${buyer}'`);
    await material();
    assert.equal(await scalar("SELECT count(*) FROM match_notifications_queue"), 1);
    assert.equal(await scalar("SELECT bool_and(deliver_at=created_at+interval '30 minutes') FROM match_notifications_queue"), true);
  });
  await db.exec(await fix());
});
