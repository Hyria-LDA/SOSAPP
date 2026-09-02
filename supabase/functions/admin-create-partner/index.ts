import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type CreatePartnerRequest = {
  nome?: string;
  email?: string;
  telefone?: string;
  codigo?: string;
  comissao_valor?: number;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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
    const email = cleanText(payload.email, 254).toLowerCase() || null;
    const telefone = cleanText(payload.telefone, 30) || null;
    const codigo = cleanText(payload.codigo, 40).toUpperCase().replace(/\s+/g, "");
    const comissao = Number(payload.comissao_valor ?? 0);

    if (!nome || !codigo) {
      return json({ ok: false, error: "Preencha todos os campos obrigatórios." });
    }
    if (email && !email.includes("@")) return json({ ok: false, error: "E-mail inválido." });
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

    const { data: partner, error: partnerError } = await admin
      .from("vendedores_parceiros")
      .insert({
        user_id: null,
        nome,
        email,
        telefone,
        codigo,
        comissao_valor: comissao,
      })
      .select("id")
      .single();
    if (partnerError) throw partnerError;

    return json({ ok: true, partner_id: partner.id });
  } catch (error) {
    console.error("[admin-create-partner]", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível criar o parceiro.",
    });
  }
});
