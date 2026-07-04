/**
 * In-App Purchase (IAP) — placeholder para integração nativa futura.
 *
 * Fluxo esperado em produção (apps nativos):
 *   1. Usuário toca em "Assinar" na tela de planos.
 *   2. App chama startInAppPurchase(planId).
 *   3. A loja (Apple/Google) abre o sheet de pagamento nativo.
 *   4. Loja retorna recibo (iOS) ou purchase token (Android).
 *   5. Frontend envia esse recibo/token ao backend.
 *      - iOS: backend valida com a App Store (verifyReceipt / App Store Server API).
 *      - Android: backend valida com Google Play Developer API (purchases.subscriptions.get).
 *   6. Backend atualiza o plano do usuário no banco.
 *   7. Frontend chama refreshUserSubscription() para recarregar o estado.
 *
 * Não usar Stripe, PayPal, Mercado Pago, checkout web ou WhatsApp para pagamento.
 */

import type { QueryClient } from "@tanstack/react-query";

// IDs internos dos planos — devem bater com os productIds configurados
// na App Store Connect e no Google Play Console no futuro.
export type PlanId =
  | "premium_monthly"
  | "premium_yearly"
  // IDs legados (slugs no banco) — mantidos por compatibilidade
  | "plus"
  | "standard"
  | "premium";

export type PurchaseResult =
  | { status: "success"; planId: PlanId; receipt?: string; token?: string }
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "unsupported"; message: string };

function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // Quando empacotado por Capacitor / outro wrapper nativo, expomos essas globals.
  const w = window as any;
  return Boolean(w?.Capacitor?.isNativePlatform?.() || w?.cordova || w?.ReactNativeWebView);
}

/**
 * Placeholder do fluxo de compra in-app.
 * Será conectado a Apple IAP (StoreKit 2) e Google Play Billing futuramente.
 */
export async function startInAppPurchase(planId: PlanId): Promise<PurchaseResult> {
  if (!isNativeApp()) {
    return {
      status: "unsupported",
      message:
        "As compras dentro do app estarão disponíveis na versão instalada pela App Store ou Google Play.",
    };
  }

  // TODO (nativo): integrar com plugin de IAP (ex.: @capacitor-community/in-app-purchases
  // ou RevenueCat) — chamar purchase(planId), aguardar recibo/token e enviar ao backend
  // para validação antes de marcar a assinatura como ativa.
  return {
    status: "error",
    message: "Integração de compra in-app ainda não está disponível.",
  };
}

/**
 * Restaurar compras anteriores — obrigatório para a App Store.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isNativeApp()) {
    return {
      status: "unsupported",
      message:
        "Restaurar compras está disponível apenas na versão instalada pela App Store ou Google Play.",
    };
  }
  // TODO (nativo): chamar restorePurchases() do plugin de IAP, reenviar recibo
  // ao backend para revalidação e então chamar refreshUserSubscription().
  return {
    status: "error",
    message: "Restauração de compras ainda não está disponível.",
  };
}

/**
 * Recarrega plano/assinatura do usuário a partir do backend.
 */
export async function refreshUserSubscription(queryClient?: QueryClient): Promise<void> {
  try {
    await queryClient?.invalidateQueries();
  } catch {
    // ignore
  }
}
