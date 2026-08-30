import { supabase } from "@/integrations/supabase/client";

export type BannerTargetScope = "all" | "state" | "city";

export type BannerTarget = {
  target_scope?: BannerTargetScope | null;
  target_uf?: string | null;
  target_city?: string | null;
};

export type BannerAudience = {
  uf: string | null;
  city: string | null;
};

export function normalizeCity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function bannerMatchesAudience(
  banner: BannerTarget,
  audience: BannerAudience | null,
): boolean {
  const scope = banner.target_scope ?? "all";
  if (scope === "all") return true;
  if (
    !audience?.uf ||
    audience.uf.trim().toUpperCase() !== banner.target_uf?.trim().toUpperCase()
  ) {
    return false;
  }
  return scope === "state" || normalizeCity(audience.city) === normalizeCity(banner.target_city);
}

export async function getCurrentBannerAudience(): Promise<BannerAudience | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("empresas")
    .select("estado, cidade")
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (error || !data?.estado) return null;
  return { uf: data.estado, city: data.cidade ?? null };
}
