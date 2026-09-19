import { supabase } from "@/integrations/supabase/client";

import type { BannerAudience } from "./banner-regions";
export * from "./banner-regions";

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
