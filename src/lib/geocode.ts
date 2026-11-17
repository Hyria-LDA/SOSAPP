// Geocodificação gratuita usando ViaCEP (BR) + OpenStreetMap Nominatim.
// Não usa GPS do dispositivo. Sempre baseado no endereço informado.

export type Coords = { lat: number; lng: number };

export type ViaCepResult = {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

export async function lookupCep(cep: string): Promise<ViaCepResult | null> {
  const clean = (cep || "").replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!r.ok) return null;
    const data = (await r.json()) as ViaCepResult;
    if ((data as any).erro) return null;
    return data;
  } catch {
    return null;
  }
}

export type GeocodeInput = {
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
};

function normalizeText(value?: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const brazilStates: Record<string, string> = {
  ac: "acre", al: "alagoas", ap: "amapa", am: "amazonas", ba: "bahia",
  ce: "ceara", df: "distrito federal", es: "espirito santo", go: "goias",
  ma: "maranhao", mt: "mato grosso", ms: "mato grosso do sul", mg: "minas gerais",
  pa: "para", pb: "paraiba", pr: "parana", pe: "pernambuco", pi: "piaui",
  rj: "rio de janeiro", rn: "rio grande do norte", rs: "rio grande do sul",
  ro: "rondonia", rr: "roraima", sc: "santa catarina", sp: "sao paulo",
  se: "sergipe", to: "tocantins",
};
function normalizedState(value?: string) {
  const normalized = normalizeText(value).replace(/^br-/, "");
  return brazilStates[normalized] ?? normalized;
}
function matchesRegion(a: GeocodeInput, country?: string, state?: string, city?: string) {
  return ["br", "brasil", "brazil"].includes(normalizeText(country)) &&
    (!a.estado || normalizedState(state) === normalizedState(a.estado)) &&
    (!a.cidade || normalizeText(city) === normalizeText(a.cidade));
}
function validCoords(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function buildQueries(a: GeocodeInput) {
  const streetWithNumber = [a.endereco, a.numero].filter(Boolean).join(" ").trim();
  const streetOnly = [a.endereco].filter(Boolean).join(" ").trim();

  const queries = [
    [streetWithNumber, a.bairro, a.cidade, a.estado, "Brasil"],
    [streetWithNumber, a.cidade, a.estado, "Brasil"],
    [streetOnly, a.bairro, a.cidade, a.estado, "Brasil"],
    [streetOnly, a.cidade, a.estado, "Brasil"],
    [a.cep, a.cidade, a.estado, "Brasil"],
    [a.cidade, a.estado, "Brasil"],
  ]
    .map((parts) => parts.filter(Boolean).join(", ").trim())
    .filter(Boolean);

  return [...new Set(queries)];
}

export async function geocodeAddress(a: GeocodeInput): Promise<Coords | null> {
  const queries = buildQueries(a);
  if (!queries.length) return null;

  // 1) Photon (komoot) — CORS aberto, sem necessidade de User-Agent custom
  for (const q of queries) {
    try {
      const url = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      if (!r.ok) continue;

      const data = (await r.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            country?: string;
            state?: string;
            city?: string;
            district?: string;
            county?: string;
          };
        }>;
      };

      const features = data.features ?? [];
      const best =
        features.find((feature) => {
          const props = feature.properties;
          const c = feature.geometry?.coordinates;
          return matchesRegion(a, props?.country, props?.state,
            props?.city || props?.county || props?.district) &&
            !!c && c.length === 2 && validCoords(c[1], c[0]);
        });

      const c = best?.geometry?.coordinates;
      if (c && c.length === 2) return { lat: c[1], lng: c[0] };
    } catch {
      /* tenta próxima consulta */
    }
  }

  // 2) Fallback: Nominatim
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=br&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) continue;
      const arr = (await r.json()) as Array<{
        lat: string; lon: string;
        address?: { country_code?: string; state?: string; city?: string; town?: string; municipality?: string; village?: string };
      }>;
      for (const result of arr) {
        const address = result.address;
        const lat = Number(result.lat), lng = Number(result.lon);
        if (matchesRegion(a, address?.country_code, address?.state,
          address?.city || address?.town || address?.municipality || address?.village) && validCoords(lat, lng)) {
          return { lat, lng };
        }
      }
    } catch {
      /* tenta próxima consulta */
    }
  }

  return null;
}

export function osmEmbedUrl({ lat, lng }: Coords, zoom = 16) {
  const d = 0.005;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}
