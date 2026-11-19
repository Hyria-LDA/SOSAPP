export function sortMaterialResults<T extends { id: string; preco: unknown; distancia: number | null; created_at: string }>(rows: T[], order: "preco" | "distancia"): T[] {
  const value = (row: T) => {
    const raw = order === "preco" ? row.preco : row.distancia;
    const number = raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(number) ? number : Infinity;
  };
  return [...rows].sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av !== bv) return av < bv ? -1 : 1;
    return Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id);
  });
}
