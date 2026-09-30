import { supabase } from "@/integrations/supabase/client";
export type LiveBanner = {
  id: string;
  store_banner?: boolean;
  data_inicio?: string;
  data_fim?: string;
  exibir_abertura?: boolean;
  [key: string]: unknown;
};
export async function getStoreLiveBanners(): Promise<LiveBanner[]> {
  const { data, error } = await supabase.rpc("store_live_banners" as never);
  // Implantação gradual: a ausência da nova migração não interrompe os banners atuais.
  if (error) return [];
  return Array.isArray(data) ? (data as unknown as LiveBanner[]) : [];
}
export function trackBanner(
  b: { id: string; store_banner?: boolean },
  click = false,
) {
  return b.store_banner
    ? supabase.rpc(
        "store_banner_event" as never,
        { _banner: b.id, _click: click } as never,
      )
    : supabase.rpc(
        (click ? "increment_banner_click" : "increment_banner_view") as never,
        { _banner_id: b.id } as never,
      );
}
export function bannerInDate(b: { data_inicio?: string; data_fim?: string }) {
  const now = Date.now();
  return (
    (!b.data_inicio || Date.parse(b.data_inicio) <= now) &&
    (!b.data_fim || Date.parse(b.data_fim) > now)
  );
}
