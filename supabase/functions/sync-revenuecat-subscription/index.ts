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
type PaidPlan = (typeof PLAN_PRIORITY)[number];

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

    const { data: previous } = await admin
      .from("revenuecat_subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

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
    const activePlan = PLAN_PRIORITY.find((plan) => isActive(entitlements[plan]));
    const selected = activePlan ? entitlements[activePlan] : undefined;
    const productId = selected?.product_identifier ?? null;
    const subscription = productId ? rcData.subscriber?.subscriptions?.[productId] : undefined;
    const expiresAt = selected?.expires_date ?? subscription?.expires_date ?? null;

    const { data: empresa } = await admin
      .from("empresas")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (activePlan && empresa) {
      const { data: plan, error: planError } = await admin
        .from("planos")
        .select("id")
        .eq("slug", activePlan)
        .eq("ativo", true)
        .single();
      if (planError || !plan) throw planError ?? new Error("plan_not_found");

      const { error: companyError } = await admin
        .from("empresas")
        .update({
          plano_id: plan.id,
          plano: activePlan,
          plano_inicio: selected?.purchase_date ?? new Date().toISOString(),
          plano_vencimento: expiresAt,
        })
        .eq("id", empresa.id);
      if (companyError) throw companyError;
    } else if (!activePlan && previous?.status === "active" && empresa) {
      const { data: freePlan, error: freePlanError } = await admin
        .from("planos")
        .select("id")
        .eq("slug", "free")
        .single();
      if (freePlanError || !freePlan) throw freePlanError ?? new Error("free_plan_not_found");

      const { error: companyError } = await admin
        .from("empresas")
        .update({
          plano_id: freePlan.id,
          plano: "free",
          plano_inicio: null,
          plano_vencimento: null,
        })
        .eq("id", empresa.id);
      if (companyError) throw companyError;
    }

    const hadEntitlement = PLAN_PRIORITY.some((plan) => Boolean(entitlements[plan]));
    const status = activePlan ? "active" : hadEntitlement ? "expired" : "none";
    const { error: subscriptionError } = await admin.from("revenuecat_subscriptions").upsert(
      {
        user_id: userId,
        empresa_id: empresa?.id ?? null,
        app_user_id: userId,
        entitlement_id: activePlan ?? null,
        product_id: productId,
        status,
        expires_at: expiresAt,
        will_renew: activePlan ? !subscription?.unsubscribe_detected_at : false,
        sandbox: subscription?.is_sandbox ?? null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (subscriptionError) throw subscriptionError;

    return json({
      ok: true,
      active: Boolean(activePlan),
      plan: (activePlan ?? "free") as PaidPlan | "free",
      expiresAt,
    });
  } catch (error) {
    console.error("[sync-revenuecat-subscription]", error);
    return json(
      {
        error: error instanceof Error ? error.message : "subscription_sync_failed",
      },
      500,
    );
  }
});
