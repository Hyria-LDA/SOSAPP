import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";
import { collectOwnedStoragePaths } from "../_shared/storage-cleanup.ts";

type DeleteCompanyRequest = { empresa_id?: string };

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

    const { data: role, error: roleError } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) return json({ error: "forbidden" }, 403);

    const payload = (await request.json()) as DeleteCompanyRequest;
    const empresaId = typeof payload.empresa_id === "string" ? payload.empresa_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return json({ error: "invalid_company" }, 400);

    const { data: company, error: companyError } = await admin
      .from("empresas")
      .select("id,owner_id,logo_url")
      .eq("id", empresaId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return json({ error: "not_found" }, 404);
    if (company.owner_id === authData.user.id) {
      return json({ error: "cannot_delete_own_admin_account" }, 409);
    }

    const { data: photos, error: photosError } = await admin
      .from("fotos_materiais")
      .select("material_id,url,thumbnail_url,materiais!inner(empresa_id)")
      .eq("materiais.empresa_id", empresaId);
    if (photosError) throw photosError;

    const materialPathSet = new Set<string>();
    let skipped = 0;
    for (const photo of photos ?? []) {
      const result = collectOwnedStoragePaths([photo.url, photo.thumbnail_url], {
        bucket: "materiais",
        supabaseUrl,
        companyId: company.id,
        materialId: photo.material_id,
      });
      for (const path of result.paths) materialPathSet.add(path);
      skipped += result.skipped;
    }
    const materialPaths = [...materialPathSet];
    const logos = collectOwnedStoragePaths([company.logo_url], {
      bucket: "logos",
      supabaseUrl,
      ownerId: company.owner_id,
    });
    skipped += logos.skipped;
    if (skipped)
      console.warn("[admin-delete-company] skipped unsafe file references", {
        empresaId,
        skipped,
      });

    // Excluir o usuário dispara os ON DELETE CASCADE da empresa e dos dados relacionados.
    const { error: deleteError } = await admin.auth.admin.deleteUser(company.owner_id);
    if (deleteError) throw deleteError;

    const cleanupWarnings: string[] = skipped ? ["unsafe_file_references"] : [];
    let removedFiles = 0;
    if (materialPaths.length) {
      const { error } = await admin.storage.from("materiais").remove(materialPaths);
      if (error) cleanupWarnings.push("material_files");
      else removedFiles += materialPaths.length;
    }
    if (logos.paths.length) {
      const { error } = await admin.storage.from("logos").remove(logos.paths);
      if (error) cleanupWarnings.push("logo_file");
      else removedFiles += logos.paths.length;
    }

    return json({
      ok: true,
      removed_files: removedFiles,
      cleanup_warnings: cleanupWarnings,
    });
  } catch (error) {
    console.error("[admin-delete-company]", error);
    return json({ error: "delete_failed" }, 500);
  }
});
