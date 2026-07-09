import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import {
  corsHeaders,
  getEnv,
  json,
  sendFirebasePush,
  shouldDeactivateToken,
} from "../_shared/firebase-push.ts";

type NotificationRecord = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  material_id?: string | null;
  pedido_id?: string | null;
};

type PushToken = {
  id: string;
  token: string;
};

function getNotificationRecord(payload: any): NotificationRecord | null {
  return payload?.record ?? payload?.new ?? payload?.data?.record ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization") ?? "";

    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      return json({ error: "forbidden" }, 403);
    }

    const payload = await request.json();
    const notification = getNotificationRecord(payload);

    if (!notification?.id || !notification.user_id || !notification.titulo || !notification.mensagem) {
      return json({ error: "invalid_notification_payload" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", notification.user_id)
      .eq("active", true);
    if (tokenError) throw tokenError;

    let sent = 0;
    let failed = 0;
    const inactiveIds: string[] = [];

    for (const pushToken of (tokens ?? []) as PushToken[]) {
      const result = await sendFirebasePush({
        token: pushToken.token,
        title: notification.titulo,
        body: notification.mensagem,
        data: {
          type: notification.tipo,
          notification_id: notification.id,
          material_id: notification.material_id ?? "",
          pedido_id: notification.pedido_id ?? "",
          path: "/app/notificacoes",
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

    return json({ total: tokens?.length ?? 0, sent, failed });
  } catch (error) {
    console.error("[push-notification-created]", error);
    return json(
      { error: error instanceof Error ? error.message : "push_notification_created_failed" },
      500,
    );
  }
});
