import { X, Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { planColor, planEmoji } from "@/hooks/use-plan-status";
import {
  startInAppPurchase,
  restorePurchases,
  refreshUserSubscription,
  type PlanId,
} from "@/lib/in-app-purchase";

type Plano = {
  id: string;
  slug: string;
  // ID técnico usado pelas lojas (App Store / Google Play)
  storeProductId?: PlanId;
  nome: string;
  preco: number;
  cor: string;
  recursos: string[];
};

const PLANOS: Plano[] = [
  {
    id: "free",
    slug: "free",
    nome: "Free",
    preco: 0,
    cor: "gray",
    recursos: ["Visualização de propaganda", "Até 10 anúncios ativos", "1 busca automática"],
  },
  {
    id: "tx",
    slug: "tx",
    storeProductId: "tx",
    nome: "TX",
    preco: 19.9,
    cor: "blue",
    recursos: ["Visualização de propaganda", "Até 25 anúncios ativos", "3 buscas automáticas"],
  },
  {
    id: "ultra",
    slug: "ultra",
    storeProductId: "ultra",
    nome: "Ultra",
    preco: 29.9,
    cor: "purple",
    recursos: ["Sem propaganda", "Até 50 anúncios ativos", "10 buscas automáticas"],
  },
  {
    id: "premium",
    slug: "premium",
    storeProductId: "premium_monthly",
    nome: "Brilhante",
    preco: 39.9,
    cor: "yellow",
    recursos: [
      "Sem propaganda",
      "Anúncio na tela inicial",
      "Anúncios ilimitados",
      "50 buscas automáticas",
      "Destaque visual nos resultados",
      "Selo Premium",
      "Possibilidade de aparecer na Home",
      "Sorteio de brindes exclusivos",
    ],
  },
];

export function UpgradeModal({
  open,
  onClose,
  currentSlug,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  currentSlug?: string;
  reason?: string;
}) {
  const queryClient = useQueryClient();
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  if (!open) return null;

  // Inicia compra via Apple IAP / Google Play Billing.
  // NÃO usar checkout externo, Stripe, PayPal, link de pagamento ou WhatsApp.
  const handlePlanUpgrade = async (planId: PlanId, slug: string) => {
    setLoadingSlug(slug);
    try {
      const result = await startInAppPurchase(planId);
      if (result.status === "success") {
        // TODO: enviar result.receipt / result.token ao backend para validação
        // (iOS: App Store / Android: Google Play Developer API) antes de
        // considerar a assinatura ativa.
        await refreshUserSubscription(queryClient);
        toast.success("Assinatura ativada!");
        onClose();
      } else if (result.status === "cancelled") {
        toast("Compra cancelada.");
      } else if (result.status === "unsupported") {
        toast(result.message);
      } else {
        toast.error("Não foi possível iniciar a compra. Tente novamente.");
      }
    } catch {
      toast.error("Não foi possível iniciar a compra. Tente novamente.");
    } finally {
      setLoadingSlug(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.status === "success") {
        await refreshUserSubscription(queryClient);
        toast.success("Compras restauradas!");
      } else if (result.status === "unsupported") {
        toast(result.message);
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background pt-2 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-base font-black">⬆️ Fazer Upgrade</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {reason && (
          <div className="mx-5 mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {reason}
          </div>
        )}

        <div className="space-y-3 px-5 pb-3">
          {PLANOS.map((p) => {
            const atual = p.slug === currentSlug;
            const isLoading = loadingSlug === p.slug;
            return (
              <div
                key={p.id}
                className={`rounded-2xl border-2 p-4 shadow-card transition ${atual ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${planColor(p.cor)}`}
                      >
                        {planEmoji(p.slug)} {p.nome}
                      </span>
                      {atual && (
                        <span className="text-[11px] font-bold text-primary">Plano atual</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black">
                      {p.preco > 0
                        ? `R$ ${Number(p.preco).toFixed(2).replace(".", ",")}`
                        : "Grátis"}
                    </div>
                    {p.preco > 0 && <div className="text-[10px] text-muted-foreground">/mês</div>}
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-xs">
                  {p.recursos.map((r, i) => (
                    <Bullet key={i}>{r}</Bullet>
                  ))}
                </ul>

                {!atual && p.slug !== "free" && p.storeProductId && (
                  <button
                    onClick={() => handlePlanUpgrade(p.storeProductId!, p.slug)}
                    disabled={loadingSlug !== null || restoring}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLoading ? "A iniciar compra..." : `Assinar ${p.nome}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-6">
          <p className="mb-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            Assine com segurança pela loja de aplicativos.
            <br />
            Gerencie ou cancele sua assinatura pela App Store ou Google Play.
            <br />
            Se você já assinou, toque em <strong>Restaurar compras</strong>.
          </p>
          <button
            onClick={handleRestore}
            disabled={restoring || loadingSlug !== null}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-xs font-bold text-foreground disabled:opacity-60"
          >
            {restoring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {restoring ? "A restaurar..." : "Restaurar compras"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}
