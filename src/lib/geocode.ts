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

      const wantedState = normalizeText(a.estado);
      const wantedCity = normalizeText(a.cidade);
      const features = data.features ?? [];
      const best =
        features.find((feature) => {
          const props = feature.properties;
          const country = normalizeText(props?.country);
          const state = normalizeText(props?.state);
          const city = normalizeText(props?.city || props?.district || props?.county);

          const isBrazil = !country || country.includes("brasil") || country.includes("brazil");
          const stateMatches = !wantedState || state.includes(wantedState);
          const cityMatches = !wantedCity || city.includes(wantedCity);

          return isBrazil && stateMatches && cityMatches;
        }) ?? features[0];

      const c = best?.geometry?.coordinates;
      if (c && c.length === 2) return { lat: c[1], lng: c[0] };
    } catch {
      /* tenta próxima consulta */
    }
  }

  // 2) Fallback: Nominatim
  for (const q of queries) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) continue;
      const arr = (await r.json()) as Array<{ lat: string; lon: string }>;
      if (!arr.length) continue;
      return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
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
