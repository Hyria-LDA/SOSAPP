import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type DeleteCompanyRequest = { empresa_id?: string };

function storagePath(value: string, bucket: string) {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  try {
    const pathname = new URL(value).pathname;
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];
    const marker = markers.find((candidate) => pathname.includes(candidate));
    if (!marker) return null;
    const path = pathname.split(marker)[1];
    return path ? decodeURIComponent(path) : null;
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
      .select("url,thumbnail_url,materiais!inner(empresa_id)")
      .eq("materiais.empresa_id", empresaId);
    if (photosError) throw photosError;

    const materialPaths = [
      ...new Set(
        (photos ?? [])
          .flatMap((photo) => [photo.url, photo.thumbnail_url])
          .map((value) => storagePath(value ?? "", "materiais"))
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    const logoPath = storagePath(company.logo_url ?? "", "logos");

    // Excluir o usuário dispara os ON DELETE CASCADE da empresa e dos dados relacionados.
    const { error: deleteError } = await admin.auth.admin.deleteUser(company.owner_id);
    if (deleteError) throw deleteError;

    const cleanupWarnings: string[] = [];
    if (materialPaths.length) {
      const { error } = await admin.storage.from("materiais").remove(materialPaths);
      if (error) cleanupWarnings.push("material_files");
    }
    if (logoPath) {
      const { error } = await admin.storage.from("logos").remove([logoPath]);
      if (error) cleanupWarnings.push("logo_file");
    }

    return json({
      ok: true,
      removed_files: materialPaths.length + (logoPath ? 1 : 0),
      cleanup_warnings: cleanupWarnings,
    });
  } catch (error) {
    console.error("[admin-delete-company]", error);
    return json({ error: "delete_failed" }, 500);
  }
});
