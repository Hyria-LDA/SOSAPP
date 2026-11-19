import { formatBRL } from "@/lib/whatsapp";
import { hasReducedPrice } from "@/lib/material-price";
export function PreviousMaterialPrice({ current, previous }: { current: number; previous?: number | null }) {
  if (!hasReducedPrice(current, previous)) return null;
  return <div className="text-xs font-normal text-muted-foreground"><span className="sr-only">Preço anterior: </span><del>{formatBRL(previous!)}</del></div>;
}
