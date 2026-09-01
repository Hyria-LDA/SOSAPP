import type { QueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type PlanId = "tx" | "ultra" | "premium";

export type PurchaseResult =
  | { status: "success"; planId: PlanId }
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "unsupported"; message: string };

const ANDROID_PRODUCT_IDS: Record<PlanId, string> = {
  tx: "br.com.sosmarceneiros.tx.monthly",
  ultra: "br.com.sosmarceneiros.ultra.monthly",
  premium: "br.com.sosmarceneiros.brilhante.monthly",
};

const IOS_PRODUCT_IDS: Record<PlanId, string> = {
  tx: "br.com.sosmarceneiros.tx.monthly.v2",
  ultra: "br.com.sosmarceneiros.ultra.monthly.v2",
  premium: "br.com.sosmarceneiros.brilhante.monthly.v2",
};

function expectedProductId(planId: PlanId) {
  return Capacitor.getPlatform() === "ios"
    ? IOS_PRODUCT_IDS[planId]
    : ANDROID_PRODUCT_IDS[planId];
}

function matchesPlanPackage(
  item: { identifier: string; product: { identifier: string } },
  planId: PlanId,
) {
  const packageId = item.identifier.trim().toLowerCase();
  const storeProductId = item.product.identifier.trim().toLowerCase();
  const productId = expectedProductId(planId).toLowerCase();

  return (
    packageId === planId ||
    storeProductId === productId ||
    storeProductId.startsWith(`${productId}:`)
  );
}

let configuredUserId: string | null = null;

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

function publicApiKey() {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return import.meta.env.VITE_REVENUECAT_IOS_API_KEY?.trim();
  if (platform === "android") return import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY?.trim();
  return undefined;
}

function friendlyError(error: unknown) {
  const candidate = error as {
    message?: string;
    underlyingErrorMessage?: string;
    userCancelled?: boolean | null;
  };

  return {
    cancelled: candidate?.userCancelled === true,
    message:
      candidate?.underlyingErrorMessage ||
      candidate?.message ||
      "Nao foi possivel concluir a compra. Tente novamente.",
  };
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Entre na sua conta antes de assinar um plano.");
  return data.user;
}

async function configureRevenueCat() {
  if (!isNativeApp()) return null;

  const apiKey = publicApiKey();
  if (!apiKey) {
    throw new Error(
      `RevenueCat nao configurado para ${Capacitor.getPlatform()}. Adicione a chave publica da loja.`,
    );
  }

  const user = await requireAuthenticatedUser();
  const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
  const { isConfigured } = await Purchases.isConfigured();

  if (!isConfigured) {
    if (import.meta.env.DEV) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey, appUserID: user.id });
  } else {
    const { appUserID } = await Purchases.getAppUserID();
    if (appUserID !== user.id) await Purchases.logIn({ appUserID: user.id });
  }

  configuredUserId = user.id;
  return { Purchases, user };
}

async function syncValidatedSubscription() {
  const { data, error } = await supabase.functions.invoke("sync-revenuecat-subscription", {
    method: "POST",
  });

  if (error) throw new Error(error.message || "Falha ao validar a assinatura.");
  if (!data?.ok) throw new Error(data?.error || "Falha ao validar a assinatura.");
  return data as { ok: true; active: boolean; plan: PlanId | "free" };
}

async function hasPartnerStoreTrialEligibility() {
  const { data, error } = await supabase.rpc(
    "get_partner_store_trial_eligibility" as never,
  );

  if (error) throw new Error("Nao foi possivel validar a promocao do parceiro.");

  const result = data as { eligible?: boolean } | null;
  return result?.eligible === true;
}

export async function startInAppPurchase(planId: PlanId): Promise<PurchaseResult> {
  if (!isNativeApp()) {
    return {
      status: "unsupported",
      message: "As assinaturas estao disponiveis no aplicativo instalado pela loja.",
    };
  }

  try {
    const context = await configureRevenueCat();
    if (!context) throw new Error("Loja indisponivel neste dispositivo.");

    const offerings = await context.Purchases.getOfferings();
    const offering = offerings.current ?? offerings.all.planos ?? Object.values(offerings.all)[0];
    if (!offering) throw new Error("Os planos ainda nao estao disponiveis na App Store.");

    const selectedPackage = offering.availablePackages.find((item) =>
      matchesPlanPackage(item, planId),
    );
    if (!selectedPackage) {
      throw new Error(`O plano ${planId} nao foi encontrado na oferta atual do RevenueCat.`);
    }

    let purchaseResult;
    if (Capacitor.getPlatform() === "android") {
      const isPartnerEligible = await hasPartnerStoreTrialEligibility();
      const options = selectedPackage.product.subscriptionOptions ?? [];
      const selectedOption = isPartnerEligible
        ? options.find((option) =>
            option.tags.some((tag) => tag.trim().toLowerCase() === "partner-30d"),
          )
        : options.find((option) => option.isBasePlan);

      if (!selectedOption) {
        throw new Error(
          isPartnerEligible
            ? "Sua promocao foi validada, mas a oferta de 30 dias ainda nao esta disponivel na Google Play. Tente novamente mais tarde."
            : "O plano-base ainda nao esta disponivel na Google Play. Tente novamente mais tarde.",
        );
      }

      purchaseResult = await context.Purchases.purchaseSubscriptionOption({
        subscriptionOption: selectedOption,
      });
    } else {
      purchaseResult = await context.Purchases.purchasePackage({
        aPackage: selectedPackage,
      });
    }

    const { customerInfo } = purchaseResult;
    if (!customerInfo.entitlements.active[planId]) {
      throw new Error("A loja concluiu a compra, mas o acesso ainda nao foi confirmado.");
    }

    const synced = await syncValidatedSubscription();
    if (!synced.active || synced.plan !== planId) {
      throw new Error("A compra foi recebida, mas o plano ainda nao foi validado pelo servidor.");
    }

    return { status: "success", planId };
  } catch (error) {
    const parsed = friendlyError(error);
    if (parsed.cancelled) return { status: "cancelled" };
    console.error("[RevenueCat] purchase failed", error);
    return { status: "error", message: parsed.message };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNativeApp()) {
    return {
      status: "unsupported",
      message: "Restaurar compras esta disponivel apenas no aplicativo instalado pela loja.",
    };
  }

  try {
    const context = await configureRevenueCat();
    if (!context) throw new Error("Loja indisponivel neste dispositivo.");

    const { customerInfo } = await context.Purchases.restorePurchases();
    const activePlan = (["premium", "ultra", "tx"] as const).find(
      (plan) => customerInfo.entitlements.active[plan],
    );
    const synced = await syncValidatedSubscription();

    if (!activePlan || !synced.active) {
      return { status: "error", message: "Nenhuma assinatura ativa foi encontrada nesta conta." };
    }

    return { status: "success", planId: activePlan };
  } catch (error) {
    const parsed = friendlyError(error);
    if (parsed.cancelled) return { status: "cancelled" };
    console.error("[RevenueCat] restore failed", error);
    return { status: "error", message: parsed.message };
  }
}

export async function syncInAppPurchaseState(): Promise<void> {
  if (!isNativeApp()) return;

  const context = await configureRevenueCat();
  if (!context || configuredUserId !== context.user.id) return;

  await context.Purchases.getCustomerInfo();
  await syncValidatedSubscription();
}

export async function refreshUserSubscription(queryClient?: QueryClient): Promise<void> {
  await queryClient?.invalidateQueries({ queryKey: ["plan-status"] });
  await queryClient?.invalidateQueries({ queryKey: ["empresa"] });
}
