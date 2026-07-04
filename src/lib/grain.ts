// Determina se um padrão é amadeirado (mostra sentido do veio)
const WOOD_KEYWORDS = [
  "carvalho",
  "freij",
  "nogueira",
  "cumaru",
  "pau ferro",
  "pau-ferro",
  "louro",
  "castanheira",
  "castanho",
  "ipê",
  "ipe",
  "imbuia",
  "cerejeira",
  "jequitibá",
  "jequitiba",
  "canela",
  "mogno",
  "teca",
  "cedro",
  "amend",
  "marfim",
  "damasco",
  "hanover",
  "munique",
  "berlin",
  "malva",
  "avelã",
  "avela",
  "batur",
  "eterno",
  "luar",
  "cadiz",
  "persa",
  "atenna",
  "reali",
  "frevo",
  "jalapão",
  "jalapao",
  "ipê real",
  "ipe real",
  "carbalho",
  "madeir",
  "amadeir",
];

const NON_WOOD_KEYWORDS = [
  "branco",
  "preto",
  "grafite",
  "cinza",
  "carbono",
  "titânio",
  "titanio",
  "titanium",
  "cristal",
  "cristallo",
  "cimento",
  "concreto",
  "areia",
  "duna",
  "linho",
  "fendi",
  "cashmere",
  "areal",
  "kashmir",
  "beton",
  "ártico",
  "artico",
  "azul",
  "verde",
  "amarelo",
  "vermelho",
  "rosa",
  "lavanda",
  "sálvia",
  "salvia",
  "oceano",
  "jade",
  "sereno",
  "puro",
  "supremo",
  "diamante",
  "pedra",
  "metál",
  "metal",
  "ouro",
  "prata",
  "bronze",
  "cobre",
  "tecido",
];

export function isAmadeirado(nome?: string | null, categoria?: string | null): boolean {
  const n = (nome ?? "").toLowerCase();
  const c = (categoria ?? "").toLowerCase();
  if (c.includes("madeir") || c.includes("amadeir")) return true;
  if (
    c.includes("unicolor") ||
    c.includes("pedra") ||
    c.includes("metal") ||
    c.includes("concreto") ||
    c.includes("cimento") ||
    c.includes("tecid")
  )
    return false;
  if (WOOD_KEYWORDS.some((k) => n.includes(k))) return true;
  if (NON_WOOD_KEYWORDS.some((k) => n.includes(k))) return false;
  return false;
}

export type Grain = "vertical" | "horizontal" | null | undefined;

export function grainArrow(g: Grain): string {
  if (g === "vertical") return "↕";
  if (g === "horizontal") return "↔";
  return "";
}

export function grainLabel(g: Grain): string {
  if (g === "vertical") return "Vertical";
  if (g === "horizontal") return "Horizontal";
  return "Não informado";
}
