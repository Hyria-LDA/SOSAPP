import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type TrackRequest = { codigo?: string; referer?: string };

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = (await request.json()) as TrackRequest;
    const codigo = clean(payload.codigo, 40).toUpperCase().replace(/\s+/g, "");
    if (!codigo || !/^[A-Z0-9_-]+$/.test(codigo)) return json({ ok: false });

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: partner, error: partnerError } = await admin
      .from("vendedores_parceiros")
      .select("id,codigo")
      .ilike("codigo", codigo)
      .eq("ativo", true)
      .maybeSingle();
    if (partnerError) throw partnerError;
    if (!partner) return json({ ok: false });

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ip = request.headers.get("cf-connecting-ip") ?? forwarded;
    const userAgent = clean(request.headers.get("user-agent"), 500);
    const referer = clean(payload.referer || request.headers.get("referer"), 1000) || null;
    const visitDay = new Date().toISOString().slice(0, 10);
    const visitorHash = await sha256(`${serviceRoleKey}:${ip || "unknown"}`);

    const { error: insertError } = await admin.from("vendedor_cliques").insert({
      codigo: partner.codigo,
      vendedor_id: partner.id,
      referer,
      user_agent: userAgent || null,
      visitor_hash: visitorHash,
      visit_day: visitDay,
    });

    if (insertError && insertError.code !== "23505") throw insertError;
    return json({ ok: true, counted: !insertError });
  } catch (error) {
    console.error("[track-partner-click]", error);
    return json({ ok: false }, 500);
  }
});
