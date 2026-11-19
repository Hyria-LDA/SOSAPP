import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";
import { collectOwnedStoragePaths } from "../_shared/storage-cleanup.ts";

type DeleteRequest = { material_id?: string; action?: string; reason?: string };

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

    if (payload.action === "reject") {
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
      if (reason.length < 3 || reason.length > 1000)
        return json({ error: "Informe um motivo entre 3 e 1000 caracteres." }, 400);
      const { data: result, error } = await admin.rpc("reject_material_with_reason", {
        _actor: authData.user.id,
        _material: materialId,
        _reason: reason,
      });
      if (error) {
        console.error("[delete-material] rejection failed", error.code);
        return json(
          {
            error:
              "Não foi possível excluir e registrar o aviso. Confira sua permissão e a atualização do banco.",
          },
          400,
        );
      }
      if (!result?.ok) return json({ error: "rejection_not_confirmed" }, 500);
      let cleanupPending = !!result.cleanup_pending;
      if (cleanupPending) {
        const { paths, skipped } = collectOwnedStoragePaths(
          (result.photos ?? []).flatMap((p: { url?: string; thumbnail_url?: string }) => [
            p.url,
            p.thumbnail_url,
          ]),
          { bucket: "materiais", supabaseUrl, companyId: result.empresa_id, materialId },
        );
        try {
          const cleanup = paths.length
            ? await admin.storage.from("materiais").remove(paths)
            : { error: null };
          if (!cleanup.error && !skipped) {
            const saved = await admin
              .from("material_rejections")
              .update({ cleanup_pending: false, photos: [] })
              .eq("material_id", materialId);
            cleanupPending = !!saved.error;
          }
        } catch {
          /* The deletion and notification already committed; retain paths for retry. */
        }
      }
      return json({ ok: true, notified: true, cleanup_pending: cleanupPending });
    }
    if (payload.action && payload.action !== "delete")
      return json({ error: "invalid_action" }, 400);

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
