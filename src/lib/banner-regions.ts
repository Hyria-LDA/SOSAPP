export type BannerTargetScope = "all" | "state" | "city" | "all_except";

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
  if (scope === "all_except") {
    if (!normalizeCity(audience?.city) || !audience?.uf?.trim()) return false;
    try {
      const excluded = parseExcludedCities(banner.target_city);
      if (!excluded.length) return false;
      return !excluded.some((place) => place.uf === audience.uf!.trim().toUpperCase()
        && normalizeCity(place.city) === normalizeCity(audience.city));
    } catch { return false; }
  }
  if (
    !audience?.uf ||
    audience.uf.trim().toUpperCase() !== banner.target_uf?.trim().toUpperCase()
  ) {
    return false;
  }
  if (scope === "state") return true;
  const city = normalizeCity(audience.city);
  return scope === "city" && !!city && parseBannerCities(banner.target_city)
    .some((target) => normalizeCity(target) === city);
}

export function parseBannerCities(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  return (value ?? "").split(/[,;\n]+/).map((city) => city.trim().replace(/\s+/g, " "))
    .filter((city) => {
      const key = normalizeCity(city);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseExcludedCities(value: string | null | undefined): { city: string; uf: string }[] {
  const ufs = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
  const seen = new Set<string>();
  return (value ?? "").split(/[,;\n]+/).filter((part) => part.trim()).map((part) => {
    const pieces = part.trim().split("/");
    const city = (pieces[0] ?? "").trim().replace(/\s+/g, " ");
    const uf = (pieces[1] ?? "").trim().toUpperCase();
    if (pieces.length !== 2 || !city || !ufs.has(uf)) throw new Error("Use Cidade/UF, por exemplo: Belo Horizonte/MG.");
    return { city, uf };
  }).filter(({ city, uf }) => {
    const key = `${normalizeCity(city)}/${uf}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
