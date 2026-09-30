import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
// Autocontida para permitir implantação também pelo editor do Supabase.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function failureInfo(error: unknown) {
  // PostgREST pode devolver um objeto comum, sem instanceof Error.
  const value = error && typeof error === "object" ? error as {message?:unknown;code?:unknown} : null;
  const message = typeof value?.message === "string" && value.message.trim()
    ? value.message.slice(0, 500)
    : typeof error === "string" && error.trim()
      ? error.slice(0, 500)
      : "Não foi possível concluir a operação";
  const code = typeof value?.code === "string" ? value.code.slice(0, 80) : undefined;
  return {message, code};
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  let stage = "validar_acesso";
  try {
    const jwt = (request.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const { data: auth, error } = await admin.auth.getUser(jwt);
    if (error || !auth.user) return json({ error: "Sessão inválida" }, 401);
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("role", "admin");
    if (roleError || !roles?.length)
      return json({ error: "Acesso negado" }, 403);
    const input = await request.json();
    if (
      typeof input.password !== "string" ||
      input.password.length < 12 ||
      input.password.length > 128
    )
      return json({ error: "Use uma senha de 12 a 128 caracteres" }, 400);
    if (input.action === "reset_password") {
      const { data: store, error: e } = await admin
        .from("banner_empresas")
        .select("user_id")
        .eq("id", input.store_id)
        .single();
      if (e || !store?.user_id)
        return json({ error: "Loja não encontrada" }, 404);
      const { data: role, error: storeRoleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", store.user_id)
        .eq("role", "store_partner")
        .maybeSingle();
      const { data: privileged, error: adminRoleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", store.user_id)
        .eq("role", "admin")
        .maybeSingle();
      if (storeRoleError || adminRoleError || !role || privileged)
        return json({ error: "Conta não exclusiva de lojista" }, 409);
      stage = "redefinir_senha";
      const { error: resetError } = await admin.auth.admin.updateUserById(
        store.user_id,
        { password: input.password },
      );
      if (resetError) throw resetError;
      return json({ ok: true });
    }
    if (input.action !== "create") return json({ error: "Ação inválida" }, 400);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email =
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const code =
      typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
    if (
      !name ||
      name.length > 120 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      !/^[-A-Z0-9_]{3,40}$/.test(code)
    )
      return json({ error: "Confira nome, login e código do link" }, 400);
    stage = "criar_login";
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
        app_metadata: { store_provisioning: true },
      });
    if (createError) throw createError;
    const userId = created.user.id;
    stage = "vincular_loja";
    const { data: storeId, error: provisionError } = await admin.rpc(
      "store_provision",
      {
        _user: userId,
        _login: email,
        _name: name,
        _code: code,
        _existing: input.existing_store_id || null,
      },
    );
    if (provisionError) {
      // Exclui apenas a conta nova desta tentativa, nunca uma conta pré-existente.
      const { error: cleanup } = await admin.auth.admin.deleteUser(userId);
      if (cleanup) console.error("store provisioning cleanup failed", userId);
      throw provisionError;
    }
    return json({ ok: true, store_id: storeId });
  } catch (error) {
    const failure = failureInfo(error);
    // Não registrar corpo da requisição, senha, token nem detalhes internos do SQL.
    console.error("store-admin failed", {stage, code: failure.code});
    const label = stage === "criar_login" ? "Criar login" : stage === "vincular_loja" ? "Vincular loja" : stage === "redefinir_senha" ? "Redefinir senha" : "Validar acesso";
    return json({error: `${label}: ${failure.message}`, stage, code: failure.code}, 400);
  }
});
