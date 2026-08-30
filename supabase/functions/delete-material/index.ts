import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type DeleteRequest = { material_id?: string };

function storagePath(value: string) {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/materiais\/(.+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const jwt = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "not_authenticated" }, 401);

    const payload = (await request.json()) as DeleteRequest;
    const materialId = typeof payload.material_id === "string" ? payload.material_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(materialId)) return json({ error: "invalid_material" }, 400);

    const [{ data: material, error: materialError }, { data: role, error: roleError }] =
      await Promise.all([
        admin
          .from("materiais")
          .select("id, empresas!inner(owner_id)")
          .eq("id", materialId)
          .maybeSingle(),
        admin
          .from("user_roles")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .eq("role", "admin")
          .maybeSingle(),
      ]);
    if (materialError) throw materialError;
    if (roleError) throw roleError;
    if (!material) return json({ error: "not_found" }, 404);

    const company = Array.isArray(material.empresas) ? material.empresas[0] : material.empresas;
    if (company?.owner_id !== authData.user.id && !role) return json({ error: "forbidden" }, 403);

    const { data: photos, error: photosError } = await admin
      .from("fotos_materiais")
      .select("url")
      .eq("material_id", materialId);
    if (photosError) throw photosError;

    const paths = [
      ...new Set((photos ?? []).map((photo) => storagePath(photo.url)).filter(Boolean)),
    ] as string[];
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from("materiais").remove(paths);
      if (storageError) throw storageError;
    }

    const { error: deleteError } = await admin.from("materiais").delete().eq("id", materialId);
    if (deleteError) throw deleteError;
    return json({ ok: true, removed_files: paths.length });
  } catch (error) {
    console.error("[delete-material]", error);
    return json({ error: "delete_failed" }, 500);
  }
});
