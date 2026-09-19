import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";
import { collectOwnedStoragePaths } from "../_shared/storage-cleanup.ts";

type DeleteRequest = { material_id?: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const jwt = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const supabaseUrl = getEnv("SUPABASE_URL");
    const admin = createClient(supabaseUrl, getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
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
          .select("id, empresa_id, empresas!inner(owner_id)")
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
      .select("url,thumbnail_url")
      .eq("material_id", materialId);
    if (photosError) throw photosError;

    const { paths, skipped } = collectOwnedStoragePaths(
      (photos ?? []).flatMap((photo) => [photo.url, photo.thumbnail_url]),
      {
        bucket: "materiais",
        supabaseUrl,
        companyId: material.empresa_id,
        materialId: material.id,
      },
    );
    if (skipped)
      console.warn("[delete-material] skipped unsafe file references", {
        materialId,
        skipped,
      });
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from("materiais").remove(paths);
      if (storageError) throw storageError;
    }

    const { error: deleteError } = await admin.from("materiais").delete().eq("id", materialId);
    if (deleteError) throw deleteError;
    return json({
      ok: true,
      removed_files: paths.length,
      cleanup_warnings: skipped ? ["unsafe_file_references"] : [],
    });
  } catch (error) {
    console.error("[delete-material]", error);
    return json({ error: "delete_failed" }, 500);
  }
});
