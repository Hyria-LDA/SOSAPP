export function waLink(phone: string, message: string) {
  const onlyDigits = phone.replace(/\D/g, "");
  const number = onlyDigits.startsWith("55") ? onlyDigits : `55${onlyDigits}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
