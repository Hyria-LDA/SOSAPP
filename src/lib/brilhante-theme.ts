import type { PlanStatus } from "@/hooks/use-plan-status";
export function hasBrilhanteTheme(plan: PlanStatus | null | undefined, now = Date.now()): boolean {
  if (!plan || plan.vencido || !["ultra", "premium", "brilhante"].includes(plan.plano?.slug?.toLowerCase())) return false;
  if (!plan.plano_vencimento) return true;
  const expires = Date.parse(plan.plano_vencimento);
  return Number.isFinite(expires) && expires > now;
}
