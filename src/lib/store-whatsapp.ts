export const DEFAULT_STORE_INTRO = "Olá vim pelo app SOS MARCENEIROS";
export const STORE_MESSAGE_EXAMPLE = "e quero aproveitar essa promoção X";
const encode = (text: string) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export function storeWhatsappUrl(phone: string, intro: string, message = "") {
  if (!/^[1-9][0-9]{7,14}$/.test(phone))
    throw new Error("Configure um WhatsApp com código do país e DDD.");
  return `https://wa.me/${phone}?text=${encode(intro.trim() + " " + message.trim())}`;
}
export function parseStoreWhatsappUrl(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.hostname !== "wa.me" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/[1-9][0-9]{7,14}$/.test(url.pathname) ||
    [...url.searchParams.keys()].some((k) => k !== "text") ||
    url.searchParams.getAll("text").length !== 1
  )
    throw new Error("Use https://wa.me/NUMERO?text=MENSAGEM, com código do país e DDD.");
  const intro = (url.searchParams.get("text") || "").trim();
  if (!intro || intro.length > 300)
    throw new Error("A mensagem inicial deve ter de 1 a 300 caracteres.");
  return { phone: url.pathname.slice(1), intro };
}
