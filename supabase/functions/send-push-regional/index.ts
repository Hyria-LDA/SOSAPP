import { parseAudience, companyMatchesAudience } from "../_shared/push-audience.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import {
  corsHeaders,
  getEnv,
  json,
  sendFirebasePush,
  shouldDeactivateToken,
} from "../_shared/firebase-push.ts";

type PushToken = {
  id: string;
  token: string;
  platform: string | null;
  user_id: string;
};

type PushRequest = {
  title?: string;
  body?: string;
  path?: string;
  external_url?: string;
  target?: "all" | "cities";
  uf?: string;
  cities?: string[];
  preview?: boolean;
};

type PushFailure = {
  platform: string;
  status: number;
  code: string;
  message: string;
};

const ALLOWED_PATHS = new Set(["/app", "/app/anunciar", "/app/buscar", "/app/perfil?upgrade=1"]);

function validExternalUrl(value: string) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "not_authenticated" }, 401);

    const { data: roles, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin");
    if (roleError) throw roleError;
    if (!roles?.length) return json({ error: "forbidden" }, 403);

    const payload = (await request.json()) as PushRequest;
    let audience;
    try { audience = parseAudience(payload as Record<string, unknown>); }
    catch { return json({ error: "invalid_audience" }, 400); }
    if (payload.preview !== undefined && typeof payload.preview !== "boolean") return json({ error: "invalid_preview" }, 400);
    const title = payload.title?.trim().slice(0, 80);
    const body = payload.body?.trim().slice(0, 180);
    const path = payload.path?.trim() || "/app";
    const requestedExternalUrl = payload.external_url?.trim() ?? "";
    const externalUrl = requestedExternalUrl ? validExternalUrl(requestedExternalUrl) : null;
    if (!payload.preview && (!title || !body)) return json({ error: "missing_title_or_body" }, 400);
    if (requestedExternalUrl && !externalUrl) return json({ error: "invalid_external_url" }, 400);
    if (!ALLOWED_PATHS.has(path)) return json({ error: "invalid_path" }, 400);
    let eligibleUsers: Set<string> | null = null;
    if (audience.target === "cities") {
      eligibleUsers = new Set<string>();
      for (let offset = 0; ; offset += 500) {
        const { data: companies, error } = await adminClient.from("empresas")
          .select("id, owner_id, cidade, estado").order("id").range(offset, offset + 499);
        if (error) throw error;
        for (const company of companies ?? []) {
          if (companyMatchesAudience(company, audience)) eligibleUsers.add(company.owner_id);
        }
        if ((companies ?? []).length < 500) break;
      }
    }
    const tokens: PushToken[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await adminClient.from("push_tokens")
        .select("id, token, platform, user_id").eq("active", true).order("id").range(offset, offset + 499);
      if (error) throw error;
      for (const token of (page ?? []) as PushToken[]) {
        if (!eligibleUsers || eligibleUsers.has(token.user_id)) tokens.push(token);
      }
      if ((page ?? []).length < 500) break;
    }

    const recipientIds = [
      ...new Set(((tokens ?? []) as PushToken[]).map((token) => token.user_id)),
    ];
    if (payload.preview) return json({ total: tokens.length, clients: recipientIds.length, sent: 0, failed: 0 });
    if (recipientIds.length > 0) {
      const { error: notificationError } = await adminClient.from("notificacoes").insert(
        recipientIds.map((userId) => ({
          user_id: userId,
          tipo: "admin_broadcast",
          titulo: title!,
          mensagem: body!,
        })),
      );
      if (notificationError) throw notificationError;
    }

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];
    const failures: PushFailure[] = [];

    for (const pushToken of (tokens ?? []) as PushToken[]) {
      const result = await sendFirebasePush({
        token: pushToken.token,
        platform: pushToken.platform,
        title: title!,
        body: body!,
        data: {
          type: "admin_broadcast",
          path,
          ...(externalUrl ? { external_url: externalUrl } : {}),
        },
      });

      if (result.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      const firebaseError = result.data?.error;
      const code =
        firebaseError?.details?.find((detail) => detail.errorCode)?.errorCode ??
        firebaseError?.status ??
        "firebase_send_failed";
      const failure = {
        platform: pushToken.platform ?? "unknown",
        status: result.status,
        code,
        message: firebaseError?.message ?? "O Firebase recusou a notificacao.",
      };
      failures.push(failure);
      console.error("[send-push] firebase send failed", {
        token_id: pushToken.id,
        ...failure,
      });
      if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
    }

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    await adminClient.from("push_broadcasts").insert({
      title,
      body,
      target: audience.target === "all" ? "all" : `cities:${audience.uf}:${audience.cities.join(";")}`,
      sent_by: userData.user.id,
      image_url: null,
      total_tokens: tokens?.length ?? 0,
      success_count: sent,
      failure_count: failed,
    });

    return json({ total: tokens?.length ?? 0, sent, failed, failures: failures.slice(0, 5) });
  } catch (error) {
    console.error("[send-push]", error);
    return json({ error: error instanceof Error ? error.message : "send_push_failed" }, 500);
  }
});
