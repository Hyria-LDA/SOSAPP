export function parseMaterialPrice(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 && amount <= 99999999.99 ? amount : null;
}
export function hasReducedPrice(current: number, previous: number | null | undefined) {
  return previous != null && Number.isFinite(previous) && Number.isFinite(current) && previous > current;
}
