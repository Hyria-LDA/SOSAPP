import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlanStatus = {
  plano: {
    id: string;
    slug: string;
    nome: string;
    cor: string;
    preco: number;
    descricao: string | null;
    recursos: string[];
    max_anuncios: number;
    max_buscas: number;
    max_alertas: number;
    max_fotos: number;
  };
  vencido: boolean;
  plano_inicio: string | null;
  plano_vencimento: string | null;
  uso: { anuncios: number; alertas: number; buscas: number };
  proxima_liberacao: string | null;
  liberacoes_proximas_7d: number;
};

export function usePlanStatus() {
  return useQuery<PlanStatus | null>({
    queryKey: ["plan-status"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.rpc("get_user_plan_status" as any, {
        _user_id: u.user.id,
      });
      if (error) throw error;
      return data as unknown as PlanStatus;
    },
    staleTime: 30_000,
  });
}

export async function checkPlanLimit(resource: "anuncios" | "alertas" | "buscas") {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { allowed: false, unlimited: false, atual: 0, limite: 0, plano: "Free" };
  const { data, error } = await supabase.rpc("check_plan_limit" as any, {
    _user_id: u.user.id,
    _resource: resource,
  });
  if (error) throw error;
  return data as {
    allowed: boolean;
    unlimited: boolean;
    atual?: number;
    limite?: number;
    plano?: string;
  };
}

export function planColor(cor: string): string {
  switch (cor) {
    case "blue":
      return "bg-blue-500 text-white";
    case "orange":
      return "bg-orange-500 text-white";
    case "purple":
      return "bg-purple-600 text-white";
    case "yellow":
      return "bg-yellow-400 text-yellow-950";
    case "gray":
    default:
      return "bg-secondary text-foreground";
  }
}

export function planEmoji(slug: string): string {
  switch (slug) {
    case "plus":
      return "🔵";
    case "standard":
      return "🟣";
    case "premium":
      return "🟡";
    default:
      return "🟢";
  }
}
