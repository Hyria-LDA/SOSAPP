import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type CreatePartnerRequest = {
  nome?: string;
  email?: string;
  telefone?: string;
  senha?: string;
  codigo?: string;
  comissao_valor?: number;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let createdUserId: string | null = null;

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwt = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "not_authenticated" }, 401);

    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) return json({ error: "forbidden" }, 403);

    const payload = (await request.json()) as CreatePartnerRequest;
    const nome = cleanText(payload.nome, 120);
    const email = cleanText(payload.email, 254).toLowerCase();
    const telefone = cleanText(payload.telefone, 30) || null;
    const senha = typeof payload.senha === "string" ? payload.senha : "";
    const codigo = cleanText(payload.codigo, 40).toUpperCase().replace(/\s+/g, "");
    const comissao = Number(payload.comissao_valor ?? 0);

    if (!nome || !email || !senha || !codigo) {
      return json({ ok: false, error: "Preencha todos os campos obrigatórios." });
    }
    if (!email.includes("@")) return json({ ok: false, error: "E-mail inválido." });
    if (senha.length < 8) {
      return json({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." });
    }
    if (!/^[A-Z0-9_-]+$/.test(codigo)) {
      return json({
        ok: false,
        error: "O código aceita apenas letras, números, hífen e sublinhado.",
      });
    }
    if (!Number.isFinite(comissao) || comissao < 0 || comissao > 100000) {
      return json({ ok: false, error: "Valor de comissão inválido." });
    }

    const { data: existingCode, error: codeError } = await admin
      .from("vendedores_parceiros")
      .select("id")
      .ilike("codigo", codigo)
      .maybeSingle();
    if (codeError) throw codeError;
    if (existingCode) return json({ ok: false, error: "Este código já está em uso." });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome },
    });
    if (createError) {
      const duplicate = /already|registered|exists/i.test(createError.message);
      return json({
        ok: false,
        error: duplicate ? "Já existe um usuário com este e-mail." : createError.message,
      });
    }
    createdUserId = created.user.id;

    const { error: partnerError } = await admin.from("vendedores_parceiros").insert({
      user_id: createdUserId,
      nome,
      email,
      telefone,
      codigo,
      comissao_valor: comissao,
    });
    if (partnerError) throw partnerError;

    const { error: userRoleError } = await admin.from("user_roles").insert({
      user_id: createdUserId,
      role: "vendedor",
    });
    if (userRoleError) throw userRoleError;

    return json({ ok: true, user_id: createdUserId });
  } catch (error) {
    if (createdUserId) {
      try {
        const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await admin.auth.admin.deleteUser(createdUserId);
      } catch (cleanupError) {
        console.error("[admin-create-partner] cleanup failed", cleanupError);
      }
    }

    console.error("[admin-create-partner]", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível criar o parceiro.",
    });
  }
});
