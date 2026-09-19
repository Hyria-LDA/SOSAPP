import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href
  : "@electric-sql/pglite");
const root = process.env.SOS_PROJECT_ROOT || process.cwd();
const rollbackPath = process.env.SOS_MODERATION_ROLLBACK || resolve(root, "supabase/manual/20260919_rollback_moderation.sql");
const migrationPath = process.env.SOS_MODERATION_SQL || resolve(root, "supabase/migrations/20260919220000_protect_moderation.sql");
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const admin = "00000000-0000-4000-8000-000000000003";
const reporters = ["00000000-0000-4000-8000-000000000002", ...[5,6,7,8].map(n => `00000000-0000-4000-8000-00000000000${n}`)];
const blockedOwner = "00000000-0000-4000-8000-000000000004";
const company = "10000000-0000-4000-8000-000000000001";
const blockedCompany = "10000000-0000-4000-8000-000000000004";
const active = "20000000-0000-4000-8000-000000000001";
const suspended = "20000000-0000-4000-8000-000000000002";
const review = "20000000-0000-4000-8000-000000000003";
const expired = "20000000-0000-4000-8000-000000000004";
const blockedExpired = "20000000-0000-4000-8000-000000000005";
const rejectedPhoto = "30000000-0000-4000-8000-000000000001";
const approvedPhoto = "30000000-0000-4000-8000-000000000002";
const pendingPhoto = "30000000-0000-4000-8000-000000000003";
const rejectedPath = `${company}/${active}/rejected.webp`;
const thumbnailPath = `${company}/${active}/rejected-thumb.webp`;
let migration;

async function source(name) {
  return readFile(resolve(root, "supabase/migrations", name), "utf8");
}

// Every scenario rolls back, including intentionally rejected writes.
async function asUser(uid, sql, role = "authenticated") {
  await db.exec("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid || ""]);
    await db.exec(`SET LOCAL ROLE ${role}`);
    return await db.exec(sql);
  } finally {
    await db.exec("ROLLBACK");
  }
}

function denied(uid, sql, role) {
  return assert.rejects(asUser(uid, sql, role), (e) => e.code === "42501");
}
function lastRows(results) { return results.at(-1).rows; }

before(async () => {
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean NOT NULL);
    INSERT INTO storage.buckets VALUES ('materiais',false);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT string_to_array($1, '/') $$;
    GRANT USAGE ON SCHEMA auth, public, storage TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
    GRANT SELECT ON storage.objects TO anon;
  `);
  // Real application schemas, policies, admin RPCs and report automation.
  await db.exec(await source("20260612123614_8ad51b80-2abb-4dd2-8241-5b4beac29c61.sql"));
  await db.exec(`CREATE TABLE public.notificacoes(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, tipo text,
    titulo text, mensagem text, material_id uuid
  );`);
  await db.exec(await source("20260621140950_9ecee62c-8a7f-47d9-9476-d64b6dc6986a.sql"));
  await db.exec(await source("20260623171227_558e5f3b-5496-4df3-9adf-a4012e250a1b.sql"));
  await db.exec(await source("20260901200000_material_photo_thumbnails.sql"));
  await db.exec(`
    ALTER TABLE public.materiais ADD COLUMN valor_vendido numeric;
    ALTER TABLE public.empresas ADD COLUMN plano_id uuid;
    ALTER TABLE public.empresas ADD COLUMN premium_trial_fim timestamptz;
    ALTER TABLE public.planos ADD COLUMN slug text;
    UPDATE public.planos SET slug='free' WHERE nome='Free';
    CREATE FUNCTION public.get_user_plan_status(uuid) RETURNS jsonb LANGUAGE sql AS
      $$ SELECT '{"plano":{"max_anuncios":10,"nome":"Free"},"uso":{"anuncios":1}}'::jsonb $$;
  `);
  const pedidoSchema = await source("20260612160616_917766be-a6b1-4699-81f2-bb04d2d91ad4.sql");
  await db.exec(pedidoSchema.slice(pedidoSchema.indexOf("CREATE OR REPLACE FUNCTION public.haversine_km"), pedidoSchema.indexOf("CREATE OR REPLACE FUNCTION public.match_pedidos_on_material")));
  await db.exec(await source("20260830173000_expire_and_renew_materials.sql"));
  // The nearby RPC's body also refers to this pure distance helper.
  // It is not called by the moderation tests.
  await db.exec(`
    INSERT INTO auth.users(id,email) VALUES
      ('${owner}','owner@example.test'), ('${other}','other@example.test'),
      ('${admin}','admin@example.test'), ('${blockedOwner}','blocked@example.test');
    UPDATE public.empresas SET id='${company}', status='ativa', onboarded=true WHERE owner_id='${owner}';
    UPDATE public.empresas SET id='${blockedCompany}', status='bloqueada', onboarded=true WHERE owner_id='${blockedOwner}';
    UPDATE public.empresas SET status='ativa', onboarded=true WHERE owner_id IN ('${other}','${admin}');
    INSERT INTO public.user_roles(user_id,role) VALUES ('${admin}','admin');
    INSERT INTO public.materiais(id,empresa_id,padrao,espessura_mm,comprimento_cm,largura_cm,preco,status,created_at) VALUES
      ('${active}','${company}','Teste',18,100,50,20,'ativo',now()),
      ('${suspended}','${company}','Teste',18,100,50,20,'suspenso',now()),
      ('${review}','${company}','Teste',18,100,50,20,'em_revisao',now()),
      ('${expired}','${company}','Teste',18,100,50,20,'ativo',now()-interval '31 days'),
      ('${blockedExpired}','${blockedCompany}','Teste',18,100,50,20,'ativo',now()-interval '31 days');
    INSERT INTO public.fotos_materiais(id,material_id,url,thumbnail_url,ai_status) VALUES
      ('${rejectedPhoto}','${active}','${rejectedPath}','${thumbnailPath}','rejected'),
      ('${approvedPhoto}','${active}','${company}/${active}/approved.webp',null,'approved'),
      ('${pendingPhoto}','${active}','${company}/${active}/pending.webp',null,'pending');
    INSERT INTO storage.objects(bucket_id,name,owner) VALUES
      ('materiais','${rejectedPath}','${owner}'), ('materiais','${thumbnailPath}','${owner}'),
      ('materiais','${company}/${active}/approved.webp','${owner}'),
      ('logos','other-logo.webp','${other}');
    GRANT SELECT ON public.fotos_materiais TO anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public, storage TO service_role;
  `);
  for (const uid of reporters.slice(1)) {
    await db.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [uid, `${uid}@example.test`]);
  }
  await db.exec(`REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated;`);
  migration = await readFile(migrationPath, "utf8");
  await db.exec(migration);
});
after(async () => { await db.close(); });

test("owner can publish normally", async () => {
  const r = await asUser(owner, `INSERT INTO public.materiais(empresa_id,padrao,espessura_mm,comprimento_cm,largura_cm,preco)
    VALUES ('${company}','Normal',18,100,50,10) RETURNING status;`);
  assert.equal(lastRows(r)[0].status, "ativo");
});
test("owner can mark an active material as sold", async () => {
  const r = await asUser(owner, `UPDATE public.materiais SET status='vendido',valor_vendido=25 WHERE id='${active}' RETURNING status,valor_vendido;`);
  assert.equal(lastRows(r)[0].status, "vendido");
});
test("owner can pause an active material", async () => {
  const r = await asUser(owner, `UPDATE public.materiais SET status='pausado' WHERE id='${active}' RETURNING status;`);
  assert.equal(lastRows(r)[0].status, "pausado");
});
test("official renewal still works", async () => {
  const r = await asUser(owner, `SELECT public.renew_material('${expired}') AS result;`);
  assert.equal(lastRows(r)[0].result.ok, true);
});
for (const id of [suspended, review]) {
  test(`owner cannot reactivate moderated material ${id}`, () => denied(owner,
    `UPDATE public.materiais SET status='ativo' WHERE id='${id}';`));
  test(`owner cannot hide moderation by marking sold ${id}`, () => denied(owner,
    `UPDATE public.materiais SET status='vendido' WHERE id='${id}';`));
}
test("blocked company cannot create an active material", () => denied(blockedOwner,
  `INSERT INTO public.materiais(empresa_id,padrao,espessura_mm,comprimento_cm,largura_cm,preco)
   VALUES ('${blockedCompany}','Bloqueado',18,100,50,10);`));
test("official renewal cannot bypass a company block", () => denied(blockedOwner,
  `SELECT public.renew_material('${blockedExpired}');`));
test("admin RPC can reactivate a suspended material", async () => {
  const r = await asUser(admin, `SELECT public.admin_acao_anuncio('${suspended}','reativar'); SELECT status FROM public.materiais WHERE id='${suspended}';`);
  assert.equal(lastRows(r)[0].status, "ativo");
});
test("non-admin RPC still cannot reactivate a material", async () => {
  const r = await asUser(owner, `SELECT public.admin_acao_anuncio('${suspended}','reativar') AS result;`);
  assert.equal(lastRows(r)[0].result.error, "forbidden");
});
test("normal company profile edits continue", async () => {
  const r = await asUser(owner, `UPDATE public.empresas SET nome_empresa='Minha oficina' WHERE id='${company}' RETURNING nome_empresa;`);
  assert.equal(lastRows(r)[0].nome_empresa, "Minha oficina");
});
test("company owner cannot remove a block", () => denied(blockedOwner,
  `UPDATE public.empresas SET status='ativa' WHERE id='${blockedCompany}';`));
for (const assignment of ["pontos_penalidade=99", "advertencias=99", "suspensa_ate=now()", `id='${other}'`]) {
  test(`company moderation fields are protected: ${assignment}`, () => denied(owner,
    `UPDATE public.empresas SET ${assignment} WHERE id='${company}';`));
}
test("admin company suspension RPC continues", async () => {
  const r = await asUser(admin, `SELECT public.admin_acao_empresa('${company}','suspender'); SELECT status FROM public.empresas WHERE id='${company}';`);
  assert.equal(lastRows(r)[0].status, "suspensa");
});
test("new photos always start pending even with forged approval", async () => {
  const r = await asUser(owner, `INSERT INTO public.fotos_materiais(material_id,empresa_id,url,ai_status,reviewed_by,needs_ai_analysis)
    VALUES ('${active}','${blockedCompany}','${company}/${active}/new.webp','approved','${admin}',false)
    RETURNING ai_status,reviewed_by,needs_ai_analysis,empresa_id;`);
  assert.deepEqual(lastRows(r)[0], { ai_status: "pending", reviewed_by: null, needs_ai_analysis: true, empresa_id: company });
});
for (const assignment of ["ai_status='approved'", "ai_score=1", "needs_ai_analysis=false", `reviewed_by='${owner}'`, "url='replacement.webp'", "thumbnail_url='replacement.webp'"]) {
  test(`owner cannot forge a review or replace its file: ${assignment}`, () => denied(owner,
    `UPDATE public.fotos_materiais SET ${assignment} WHERE id='${pendingPhoto}';`));
}
test("photo order can still be edited", async () => {
  const r = await asUser(owner, `UPDATE public.fotos_materiais SET ordem=5 WHERE id='${approvedPhoto}' RETURNING ordem;`);
  assert.equal(lastRows(r)[0].ordem, 5);
});
test("owner cannot erase rejection by deleting the photo row", () => denied(owner,
  `DELETE FROM public.fotos_materiais WHERE id='${rejectedPhoto}';`));
test("rollback of an unsuccessful upload can delete a pending photo", async () => {
  const r = await asUser(owner, `DELETE FROM public.fotos_materiais WHERE id='${pendingPhoto}' RETURNING id;`);
  assert.equal(lastRows(r)[0].id, pendingPhoto);
});
test("cannot attach new photos to a suspended material", () => denied(owner,
  `INSERT INTO public.fotos_materiais(material_id,url) VALUES ('${suspended}','new.webp');`));
test("admin can reject a photo through the existing RPC", async () => {
  const r = await asUser(admin, `SELECT public.admin_moderar_foto('${pendingPhoto}','rejected','Teste'); SELECT ai_status FROM public.fotos_materiais WHERE id='${pendingPhoto}';`);
  assert.equal(lastRows(r)[0].ai_status, "rejected");
});
test("other users cannot read rejected photos but keep pending/approved photos", async () => {
  const r = await asUser(other, `SELECT ai_status FROM public.fotos_materiais ORDER BY ai_status::text;`);
  assert.deepEqual(lastRows(r).map(x => x.ai_status), ["approved", "pending"]);
});
test("owner and admin can inspect rejection", async () => {
  for (const uid of [owner, admin]) {
    const r = await asUser(uid, `SELECT id FROM public.fotos_materiais WHERE id='${rejectedPhoto}';`);
    assert.equal(lastRows(r).length, 1);
  }
});
test("storage blocks rejected image and thumbnail despite old public policy", async () => {
  const r = await asUser(other, `SELECT name FROM storage.objects WHERE bucket_id='materiais';`);
  assert.deepEqual(lastRows(r).map(x => x.name), [`${company}/${active}/approved.webp`]);
});
test("anonymous storage access cannot retrieve rejected files", async () => {
  const r = await asUser(null, `SELECT name FROM storage.objects WHERE name='${rejectedPath}';`, "anon");
  assert.equal(lastRows(r).length, 0);
});
test("restriction does not affect other storage buckets", async () => {
  await db.exec(`CREATE POLICY test_logo_access ON storage.objects FOR SELECT USING (bucket_id='logos');`);
  try {
    const r = await asUser(other, `SELECT name FROM storage.objects WHERE bucket_id='logos';`);
    assert.equal(lastRows(r).length, 1);
  } finally { await db.exec('DROP POLICY test_logo_access ON storage.objects'); }
});
test("service-role account deletion still cascades through rejected photos", async () => {
  const r = await asUser(null, `DELETE FROM public.empresas WHERE id='${company}'; SELECT count(*)::int AS n FROM public.fotos_materiais;`, "service_role");
  assert.equal(lastRows(r)[0].n, 0);
});
test("automatic reports still move a material to review and suspension", async () => {
  const report = (uid) => `SELECT set_config('request.jwt.claim.sub','${uid}',true);
    INSERT INTO public.denuncias(denunciante_id,target_type,target_id,material_id,categoria)
    VALUES ('${uid}','anuncio','${active}','${active}','spam');`;
  const r = await asUser(other, reporters.slice(0,3).map(report).join('') +
    `SET LOCAL ROLE postgres; SELECT status AS review_state FROM public.materiais WHERE id='${active}'; SET LOCAL ROLE authenticated;` +
    reporters.slice(3).map(report).join('') +
    `SET LOCAL ROLE postgres; SELECT status AS final_state FROM public.materiais WHERE id='${active}';
     SELECT count(*)::int AS n FROM public.notificacoes WHERE material_id='${active}';`);
  assert.equal(r.flatMap(x => x.rows).find(x => x.review_state)?.review_state, "em_revisao");
  assert.equal(r.flatMap(x => x.rows).find(x => x.final_state)?.final_state, "suspenso");
  assert.equal(lastRows(r)[0].n, 1);
});
test("onboarding and profile edits remain compatible with the previous plan protection", async (context) => {
  let previousProtection;
  try {
    previousProtection = await source("20260913211500_protect_company_plan_fields.sql");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    context.skip("Optional previous plan migration is not present in this checkout");
    return;
  }
  await db.exec(previousProtection);
  try {
    const r = await asUser(other, `SET LOCAL ROLE postgres;
      UPDATE public.empresas SET status='pendente',onboarded=false WHERE owner_id='${other}';
      SET LOCAL ROLE authenticated;
      UPDATE public.empresas SET status='ativa',onboarded=true,nome_empresa='Onboarding'
      WHERE owner_id='${other}' RETURNING status,onboarded;`);
    assert.deepEqual(lastRows(r)[0], {status: "ativa", onboarded: true});
    const profile = await asUser(owner, `UPDATE public.empresas SET nome_empresa='Perfil' WHERE id='${company}' RETURNING nome_empresa;`);
    assert.equal(lastRows(profile)[0].nome_empresa, "Perfil");
  } finally {
    await db.exec('DROP TRIGGER protect_company_plan_fields_before_write ON public.empresas; DROP FUNCTION public.protect_company_plan_fields();');
  }
});
test("migration can be applied twice", async () => { await db.exec(migration); });

test("admin can inspect a suspended announcement with the older scoped storage policy", async () => {
  const oldStorage = await source("20260615221924_cbde53b2-bcf0-4325-93cc-a9976cd4b76c.sql");
  await db.exec('DROP POLICY "Materiais bucket público leitura" ON storage.objects;');
  await db.exec(oldStorage.slice(0, oldStorage.indexOf('-- 2) Realtime')));
  try {
    const path = `${company}/${suspended}/moderation.webp`;
    const r = await asUser(admin, `SET LOCAL ROLE postgres;
      INSERT INTO public.fotos_materiais(material_id,url,ai_status) VALUES ('${suspended}','${path}','rejected');
      INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('materiais','${path}','${owner}');
      SET LOCAL ROLE authenticated; SELECT name FROM storage.objects WHERE name='${path}';`);
    assert.equal(lastRows(r)[0].name, path);
  } finally {
    await db.exec(`DROP POLICY "Materiais bucket read scoped" ON storage.objects; CREATE POLICY "Materiais bucket público leitura" ON storage.objects FOR SELECT USING (bucket_id='materiais');`);
  }
});
test("legacy signed URL references also block new storage reads", async () => {
  const r = await asUser(other, `SET LOCAL ROLE postgres;
    UPDATE public.fotos_materiais SET url='https://project.supabase.co/storage/v1/object/sign/materiais/${rejectedPath}?token=legacy' WHERE id='${rejectedPhoto}';
    SET LOCAL ROLE authenticated; SELECT name FROM storage.objects WHERE name='${rejectedPath}';`);
  assert.equal(lastRows(r).length, 0);
});
test("preflight fails atomically for a public materials bucket", async () => {
  await db.exec("UPDATE storage.buckets SET public=true WHERE id='materiais'");
  try {
    await assert.rejects(db.exec(migration), /bucket materiais precisa existir e ser privado/);
    await db.exec('ROLLBACK');
    const r = await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='sos_guard_photo_moderation'");
    assert.equal(r.rows[0].n, 1);
  } finally {
    await db.exec("ROLLBACK; UPDATE storage.buckets SET public=false WHERE id='materiais'");
  }
});
test("rollback removes only this stage and preserves data, then migration reapplies", async () => {
  const counts = () => db.query('SELECT (SELECT count(*) FROM public.empresas) AS companies, (SELECT count(*) FROM public.materiais) AS materials, (SELECT count(*) FROM public.fotos_materiais) AS photos');
  const before = (await counts()).rows;
  await db.exec(await readFile(rollbackPath, 'utf8'));
  assert.deepEqual((await counts()).rows, before);
  const guards = await db.query("SELECT tgname FROM pg_trigger WHERE tgname LIKE 'sos_guard_%'");
  assert.equal(guards.rows.length, 0);
  const existing = await db.query("SELECT tgname FROM pg_trigger WHERE tgname='denuncias_auto_suspende'");
  assert.equal(existing.rows.length, 1);
  await db.exec(migration);
  await denied(owner, `UPDATE public.materiais SET status='ativo' WHERE id='${suspended}'`);
});

test("backend service-role can still create and moderate records without a user session", async () => {
  const r = await asUser(null, `UPDATE public.materiais SET status='ativo' WHERE id='${suspended}';
    INSERT INTO public.materiais(empresa_id,padrao,espessura_mm,comprimento_cm,largura_cm,preco)
    VALUES ('${company}','Backend',18,100,50,10) RETURNING status;`, 'service_role');
  assert.equal(lastRows(r)[0].status, 'ativo');
});
