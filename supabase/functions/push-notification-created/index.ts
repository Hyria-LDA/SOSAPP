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

function isAuthorizedWebhook(request: Request, serviceRoleKey: string) {
  const authHeader = request.headers.get("Authorization")?.trim() ?? "";
  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET")?.trim() ?? "";
  const webhookHeader = request.headers.get("x-push-webhook-secret")?.trim() ?? "";

  if (authHeader === `Bearer ${serviceRoleKey}`) return true;
  if (webhookSecret && webhookHeader === webhookSecret) return true;

  console.error("[push-notification-created] unauthorized webhook", {
    hasAuthorization: Boolean(authHeader),
    hasWebhookSecretHeader: Boolean(webhookHeader),
    hasWebhookSecretConfigured: Boolean(webhookSecret),
  });
  return false;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!isAuthorizedWebhook(request, serviceRoleKey)) {
      return json({ error: "forbidden_webhook_auth" }, 403);
    }

    const payload = await request.json();
    const notification = getNotificationRecord(payload);

    if (!notification?.id || !notification.user_id || !notification.titulo || !notification.mensagem) {
      console.error("[push-notification-created] invalid payload", payload);
      return json({ error: "invalid_notification_payload" }, 400);
    }

    console.log("[push-notification-created] notification received", {
      id: notification.id,
      user_id: notification.user_id,
      tipo: notification.tipo,
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens, error: tokenError } = await adminClient
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", notification.user_id)
      .eq("active", true);
    if (tokenError) throw tokenError;

    if (!tokens?.length) {
      console.log("[push-notification-created] no active tokens", {
        user_id: notification.user_id,
      });
      return json({ total: 0, sent: 0, failed: 0, reason: "no_active_tokens" });
    }

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
      console.error("[push-notification-created] firebase send failed", {
        token_id: pushToken.id,
        status: result.status,
        data: result.data,
      });
      if (shouldDeactivateToken(result)) inactiveIds.push(pushToken.id);
    }

    if (inactiveIds.length > 0) {
      await adminClient.from("push_tokens").update({ active: false }).in("id", inactiveIds);
    }

    console.log("[push-notification-created] push result", {
      total: tokens.length,
      sent,
      failed,
      deactivated: inactiveIds.length,
    });

    return json({ total: tokens?.length ?? 0, sent, failed });
  } catch (error) {
    console.error("[push-notification-created]", error);
    return json(
      { error: error instanceof Error ? error.message : "push_notification_created_failed" },
      500,
    );
  }
});
