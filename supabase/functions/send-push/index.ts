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
};

type PushRequest = {
  title?: string;
  body?: string;
  imageUrl?: string;
  path?: string;
  target?: "all";
};

const ALLOWED_PATHS = new Set([
  "/app",
  "/app/anunciar",
  "/app/buscar",
  "/app/perfil?upgrade=1",
]);

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
    const title = payload.title?.trim().slice(0, 80);
    const body = payload.body?.trim().slice(0, 180);
    const imageUrl = payload.imageUrl?.trim();
    const path = payload.path?.trim() || "/app";
    if (!title || !body) return json({ error: "missing_title_or_body" }, 400);
    if (!ALLOWED_PATHS.has(path)) return json({ error: "invalid_path" }, 400);
    if (imageUrl) {
      const url = new URL(imageUrl);
      if (url.protocol !== "https:") return json({ error: "invalid_image_url" }, 400);
    }

    const { data: tokens, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("id, token")
      .eq("active", true);
    if (tokenError) throw tokenError;

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];

    for (const pushToken of (tokens ?? []) as PushToken[]) {
      const result = await sendFirebasePush({
        token: pushToken.token,
        title,
        body,
        imageUrl,
        data: {
          type: "admin_broadcast",
          path,
          image_url: imageUrl ?? "",
        },
      });

      if (result.ok) {
        sent += 1;
        continue;
      }

      failed += 1;
      if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
    }

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    await adminClient.from("push_broadcasts").insert({
      title,
      body,
      target: payload.target ?? "all",
      sent_by: userData.user.id,
      image_url: imageUrl ?? null,
      total_tokens: tokens?.length ?? 0,
      success_count: sent,
      failure_count: failed,
    });

    return json({ total: tokens?.length ?? 0, sent, failed });
  } catch (error) {
    console.error("[send-push]", error);
    return json({ error: error instanceof Error ? error.message : "send_push_failed" }, 500);
  }
});
