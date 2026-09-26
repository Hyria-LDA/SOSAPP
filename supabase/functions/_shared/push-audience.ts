export type PushAudience = { target: "all" | "cities"; uf: string; cities: string[] };
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
export function normalizeCity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}
export function parseAudience(payload: Record<string, unknown>): PushAudience {
  if (payload.target === "all") {
    if (payload.uf || (payload.cities !== undefined && (!Array.isArray(payload.cities) || payload.cities.length > 0))) throw new Error("invalid_audience");
    return { target: "all", uf: "", cities: [] };
  }
  if (payload.target !== "cities" || typeof payload.uf !== "string" || !Array.isArray(payload.cities)) throw new Error("invalid_audience");
  const uf = payload.uf.trim().toUpperCase();
  if (!UFS.has(uf) || payload.cities.length < 1 || payload.cities.length > 100) throw new Error("invalid_audience");
  const cities = payload.cities.map((city: unknown) => {
    if (typeof city !== "string" || !city.trim() || city.length > 120) throw new Error("invalid_audience");
    return normalizeCity(city);
  });
  return { target: "cities", uf, cities: [...new Set(cities)] };
}
export function companyMatchesAudience(company: { estado: string | null; cidade: string | null }, audience: PushAudience) {
  return audience.target === "all" || (company.estado?.trim().toUpperCase() === audience.uf
    && !!company.cidade && audience.cities.includes(normalizeCity(company.cidade)));
}
