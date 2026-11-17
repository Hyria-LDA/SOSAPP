import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";
import { corsHeaders, getEnv, json } from "../_shared/firebase-push.ts";

type RevenueCatEntitlement = {
  expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

type RevenueCatSubscription = {
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  is_sandbox?: boolean;
};

type RevenueCatSubscriber = {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
    subscriptions?: Record<string, RevenueCatSubscription>;
  };
};

const PLAN_PRIORITY = ["premium", "ultra", "tx"] as const;

function isActive(entitlement: RevenueCatEntitlement | undefined) {
  if (!entitlement) return false;
  if (!entitlement.expires_date) return true;
  return new Date(entitlement.expires_date).getTime() > Date.now();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const revenueCatSecret = getEnv("REVENUECAT_SECRET_API_KEY");
    const jwt = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "not_authenticated" }, 401);
    const userId = authData.user.id;

    const rcResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${revenueCatSecret}`,
          Accept: "application/json",
        },
      },
    );

    let rcData: RevenueCatSubscriber = {};
    if (rcResponse.ok) {
      rcData = (await rcResponse.json()) as RevenueCatSubscriber;
    } else if (rcResponse.status !== 404) {
      const details = await rcResponse.text();
      console.error("[RevenueCat] subscriber lookup failed", rcResponse.status, details);
      return json({ error: "revenuecat_validation_failed" }, 502);
    }

    const entitlements = rcData.subscriber?.entitlements ?? {};
    const storePlan = PLAN_PRIORITY.find((plan) => isActive(entitlements[plan]));
    // Compras legadas de TX e Brilhante continuam válidas, mas recebem o plano único Ultra.
    const activePlan: "ultra" | undefined = storePlan ? "ultra" : undefined;
    const selected = storePlan ? entitlements[storePlan] : undefined;
    const productId = selected?.product_identifier ?? null;
    const subscription = productId ? rcData.subscriber?.subscriptions?.[productId] : undefined;
    const expiresAt = selected?.expires_date ?? subscription?.expires_date ?? null;

    // Never convert a sandbox purchase into a production entitlement. Unknown
    // purchase environments also fail closed; no existing plan is changed.
    if (activePlan && subscription?.is_sandbox !== false) {
      return json({ error: "production_purchase_required" }, 409);
    }

    const hadEntitlement = PLAN_PRIORITY.some((plan) => Boolean(entitlements[plan]));
    const { data, error } = await admin.rpc("apply_revenuecat_subscription", {
      _user_id: userId,
      _subscription: {
        entitlement_id: storePlan ?? null,
        product_id: productId,
        status: activePlan ? "active" : hadEntitlement ? "expired" : "none",
        expires_at: expiresAt,
        purchase_date: selected?.purchase_date ?? null,
        will_renew: activePlan ? !subscription?.unsubscribe_detected_at : false,
        sandbox: subscription?.is_sandbox ?? null,
      },
    });
    if (error) throw error;
    return json({ ok: true, ...data });
  } catch (error) {
    console.error("[sync-revenuecat-subscription]", error);
    return json(
      {
        error: "subscription_sync_failed",
      },
      500,
    );
  }
});
