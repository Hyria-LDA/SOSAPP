import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await request.json();
    const code = String(body.code ?? "")
      .trim()
      .toUpperCase();
    const installationId = String(body.installationId ?? "").trim();
    const platform = String(body.platform ?? "").toLowerCase();
    if (!/^[A-Z0-9_-]{1,40}$/.test(code)) return json({ ok: false }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(installationId)) return json({ ok: false }, 400);
    if (!["android", "ios"].includes(platform)) return json({ ok: false }, 400);

    const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: partner, error: partnerError } = await admin
      .from("vendedores_parceiros")
      .select("id")
      .ilike("codigo", code)
      .eq("ativo", true)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner) return json({ ok: false }, 404);

    const { error } = await admin.from("vendedor_instalacoes").insert({
      vendedor_id: partner.id,
      codigo: code,
      installation_id: installationId,
      plataforma: platform,
    });
    if (error && error.code !== "23505") throw error;
    return json({ ok: true, counted: !error });
  } catch (error) {
    console.error("[record-partner-install]", error);
    return json({ ok: false }, 500);
  }
});
