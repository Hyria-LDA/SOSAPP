/** Brazilian local numbers include a two-digit DDD. Never infer missing subscriber digits. */
export function normalizeBrazilianWhatsapp(phone: string): string | null {
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("0055") && (digits.length === 14 || digits.length === 15)) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (!/^[1-9][0-9][0-9]{8,9}$/.test(digits)) return null;
  return `55${digits}`;
}

export function waLink(phone: string, message: string) {
  const number = normalizeBrazilianWhatsapp(phone);
  if (!number) throw new Error("Informe um telefone brasileiro com DDD.");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
