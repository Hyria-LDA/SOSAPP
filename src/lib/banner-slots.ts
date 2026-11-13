import type { BannerTarget } from "./banner-regions";
export type PositionedBanner = BannerTarget & {
  id: string;
  store_banner?: boolean;
  campaign_kind?: string;
};
export function bannerKind(b: PositionedBanner): string {
  if (b.campaign_kind && b.campaign_kind !== "legacy") return b.campaign_kind;
  return b.target_scope === "state" || b.target_scope === "city" ? "regional" : "global";
}
// Input is already audience/date/plan filtered and shuffled. Never widen eligibility.
export function selectHomeSlots<T extends PositionedBanner>(
  items: T[],
  fallbackId?: string | null,
): T[] {
  const seen = new Set<string>();
  const unique = items.filter((b) => {
    const key = `${b.store_banner ? "store" : "legacy"}:${b.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const regional = unique.filter((b) => bannerKind(b) === "regional").slice(0, 4);
  const global =
    unique.find((b) => bannerKind(b) === "global") ??
    unique.find((b) => !b.store_banner && b.id === fallbackId && bannerKind(b) === "institutional");
  return global ? [...regional, global] : regional;
}
