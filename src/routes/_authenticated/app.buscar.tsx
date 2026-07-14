import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Search, X, MapPin, Check, ChevronDown } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/use-geolocation";
import { haversineKm, formatDistance } from "@/lib/distance";
import { formatBRL } from "@/lib/whatsapp";
import { formatDimensions } from "@/lib/material-dimensions";
import { GrainBadge } from "@/components/grain";
import { PlanoBadge } from "@/components/premium-badge";
import { Slider } from "@/components/ui/slider";
import { pushRecentSearch } from "@/hooks/use-recent-searches";
import { toast } from "sonner";
import { sortByNome } from "@/lib/sort";

const MAX_COMPRIMENTO_CM = 275;
const MAX_LARGURA_CM = 185;

const searchSchema = z.object({
  q: z.string().optional().default(""),
  fabricante_id: z.string().optional().default(""),
  padrao_id: z.string().optional().default(""),
  espessuras: z.string().optional().default(""), // CSV de valores em mm
  cidade: z.string().optional().default(""),
  estado: z.string().optional().default(""),
  raio: z.coerce.number().optional().default(50),
  area_min: z.coerce.number().optional().default(0),
  area_max: z.coerce.number().optional().default(0),
  preco_min: z.coerce.number().optional().default(0),
  preco_max: z.coerce.number().optional().default(0),
  qtd_min: z.coerce.number().optional().default(0),
  grain: z.enum(["", "vertical", "horizontal"]).optional().default(""),
  ordem: z.string().optional().default(""),
  comp_min: z.coerce.number().optional().default(0),
  larg_min: z.coerce.number().optional().default(0),
});

function clampDimensionInput(value: string, max: number) {
  if (value === "") return "";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return value;
  if (numericValue > max) return String(max);
  if (numericValue < 0) return "0";
  return value;
}

export const Route = createFileRoute("/_authenticated/app/buscar")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Buscar,
});

type AutoItem = { id: string; nome: string; fabricante: string; fabricante_id: string };

function Buscar() {
  const navigate = useNavigate({ from: "/app/buscar" });
  const params = Route.useSearch();
  const { coords: gpsCoords } = useGeolocation();

  // Localização de referência = a marcenaria cadastrada do usuário (fallback: GPS)
  const { data: minhaEmpresa } = useQuery({
    queryKey: ["minha-empresa-coords"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("empresas")
        .select("latitude, longitude, cidade, estado")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });
  const coords =
    minhaEmpresa?.latitude && minhaEmpresa?.longitude
      ? { lat: minhaEmpresa.latitude, lng: minhaEmpresa.longitude }
      : gpsCoords;

  const raioBusca = Math.min(params.raio, 50);

  const [showFabPicker, setShowFabPicker] = useState(false);
  const [showPadraoPicker, setShowPadraoPicker] = useState(false);
  const [compMinInput, setCompMinInput] = useState(() =>
    params.comp_min > 0 ? String(params.comp_min) : "",
  );
  const [largMinInput, setLargMinInput] = useState(() =>
    params.larg_min > 0 ? String(params.larg_min) : "",
  );
  const compInputRef = useRef<HTMLInputElement>(null);
  const largInputRef = useRef<HTMLInputElement>(null);
  // Seed estável por montagem → rotação muda a cada nova visita à busca,
  // mas mantém ordem consistente enquanto o usuário interage com filtros.
  const rotationSeedRef = useRef<string>("");
  if (!rotationSeedRef.current) {
    rotationSeedRef.current = Math.random().toString(36).slice(2);
  }
  const rotationSeed = rotationSeedRef.current;

  const espessurasSel = useMemo(
    () => (params.espessuras ? params.espessuras.split(",").filter(Boolean).map(Number) : []),
    [params.espessuras],
  );

  // Catálogo
  const { data: fabricantes } = useQuery({
    queryKey: ["fabricantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fabricantes")
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });
  const { data: espessuras } = useQuery({
    queryKey: ["espessuras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("espessuras")
        .select("id, valor_mm")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as { id: string; valor_mm: number }[];
    },
  });

  // Espessuras comuns para busca (até 25mm)
  const espessurasBusca = useMemo(
    () => (espessuras ?? []).filter((e) => Number(e.valor_mm) <= 25),
    [espessuras],
  );

  const fabricanteSel = fabricantes?.find((f) => f.id === params.fabricante_id) ?? null;

  // Padrão selecionado (para chip)
  const { data: padraoSel } = useQuery({
    queryKey: ["padrao-sel", params.padrao_id],
    enabled: !!params.padrao_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("padroes")
        .select("id, nome, fabricante_id, fabricantes:fabricante_id(nome)")
        .eq("id", params.padrao_id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? ({
            id: data.id,
            nome: data.nome,
            fabricante_id: data.fabricante_id,
            fabricante: (data as any).fabricantes?.nome ?? "",
          } as AutoItem)
        : null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["buscar", params.fabricante_id, params.padrao_id, params.espessuras],
    queryFn: async () => {
      let query = supabase
        .from("materiais")
        .select(
          "id, padrao, fabricante, fabricante_id, padrao_id, espessura_mm, comprimento_cm, largura_cm, preco, area_m2, valor_m2, cidade, estado, latitude, longitude, created_at, grain_direction, quantidade, fotos_materiais(url, ordem)",
        )
        .eq("status", "ativo");
      if (params.padrao_id) query = query.eq("padrao_id", params.padrao_id);
      if (params.fabricante_id) query = query.eq("fabricante_id", params.fabricante_id);
      if (espessurasSel.length) query = query.in("espessura_mm", espessurasSel);
      const { data, error } = await query.limit(120);
      if (error) throw error;
      const { attachFirstFoto } = await import("@/lib/material-photos");
      const list = await attachFirstFoto((data ?? []) as any[]);
      const ids = list.map((m: any) => m.id);
      if (ids.length) {
        const { data: planos } = await supabase.rpc("materiais_planos" as any, { _ids: ids });
        const map = new Map<string, { slug: string; vigente: boolean }>();
        (planos as any[] | null)?.forEach((p) =>
          map.set(p.material_id, { slug: p.plano_slug, vigente: p.plano_vigente }),
        );
        return list.map((m: any) => {
          const p = map.get(m.id);
          return {
            ...m,
            plano_slug: p?.slug ?? null,
            plano_vigente: p?.vigente ?? null,
          };
        });
      }
      return list;
    },
  });

  const effectiveCompMin = Number(compMinInput) || 0;
  const effectiveLargMin = Number(largMinInput) || 0;

  const results = useMemo(() => {
    let list = (data ?? []).map((m: any) => {
      const dist =
        coords && m.latitude && m.longitude
          ? haversineKm(coords, { lat: m.latitude, lng: m.longitude })
          : null;
      return { ...m, distancia: dist };
    });
    if (raioBusca > 0) {
      list = list.filter((m) => m.distancia == null || m.distancia <= raioBusca);
    }
    if (effectiveCompMin > 0) {
      list = list.filter((m) => Number(m.comprimento_cm) >= effectiveCompMin);
    }
    if (effectiveLargMin > 0) {
      list = list.filter((m) => Number(m.largura_cm) >= effectiveLargMin);
    }
    const hasSel = !!(params.fabricante_id || params.padrao_id);
    const planRank = (m: any) => {
      const slug = m.plano_vigente === false ? "free" : (m.plano_slug ?? "free");
      switch (slug) {
        case "premium":
          return 0;
        case "ultra":
          return 1;
        case "tx":
          return 2;
        default:
          return 3;
      }
    };
    // Hash determinístico por id + seed da sessão → rotação estável dentro do plano
    const hash = (s: string) => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h;
    };
    if (hasSel) {
      list.sort((a, b) => {
        const pa = planRank(a);
        const pb = planRank(b);
        if (pa !== pb) return pa - pb;
        // Mesmo plano → rotação pseudo-aleatória por sessão
        return hash(a.id + rotationSeed) - hash(b.id + rotationSeed);
      });
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      list = list.slice(0, 20);
    }
    return list;
  }, [data, coords, params, effectiveCompMin, effectiveLargMin, raioBusca, rotationSeed]);

  const hasSelection = !!(params.fabricante_id || params.padrao_id);

  const update = useCallback(
    (patch: Partial<typeof params>) =>
      navigate({
        search: (prev: any) => ({ ...prev, ...patch }) as any,
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );

  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === compInputRef.current) return;
    const next = params.comp_min > 0 ? String(params.comp_min) : "";
    setCompMinInput((current) => (current === next ? current : next));
  }, [params.comp_min]);

  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === largInputRef.current) return;
    const next = params.larg_min > 0 ? String(params.larg_min) : "";
    setLargMinInput((current) => (current === next ? current : next));
  }, [params.larg_min]);

  useEffect(() => {
    const compMin = Number(compMinInput) || 0;
    const largMin = Number(largMinInput) || 0;
    if (compMin === params.comp_min && largMin === params.larg_min) return;

    const timer = window.setTimeout(() => {
      update({ comp_min: compMin, larg_min: largMin });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [compMinInput, largMinInput, params.comp_min, params.larg_min, update]);

  // Salva a busca recente quando há termo, padrão ou fabricante selecionado
  useEffect(() => {
    const label = padraoSel?.nome || (params.q && params.q.trim()) || fabricanteSel?.nome || "";
    if (!label) return;
    const t = setTimeout(() => {
      pushRecentSearch({
        label,
        params: {
          q: params.q || undefined,
          padrao_id: params.padrao_id || undefined,
          fabricante_id: params.fabricante_id || undefined,
          espessuras: params.espessuras || undefined,
        },
      });
    }, 800);
    return () => clearTimeout(t);
  }, [
    params.q,
    params.padrao_id,
    params.fabricante_id,
    params.espessuras,
    padraoSel?.nome,
    fabricanteSel?.nome,
  ]);

  const toggleEspessura = (v: number) => {
    const set = new Set<number>(espessurasSel);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    const arr: number[] = Array.from(set);
    arr.sort((a, b) => a - b);
    update({ espessuras: arr.join(",") });
  };

  const breadcrumb = [
    fabricanteSel?.nome,
    padraoSel?.nome ?? null,
    espessurasSel.length ? espessurasSel.map((e: number) => `${e}mm`).join("+") : null,
    raioBusca > 0 ? `até ${raioBusca}km` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const showFilters = !!(params.fabricante_id || params.padrao_id);

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">Buscar material</h1>
      </header>

      <div className="mt-5 space-y-5">
        {/* ============ BLOCO: MATERIAL ============ */}
        <Section title="Material">
          <FieldLabel label="Fabricante">
            <button
              onClick={() => setShowFabPicker(true)}
              className={`group flex h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-semibold shadow-sm transition hover:border-primary focus:border-primary focus:outline-none active:border-primary ${
                fabricanteSel
                  ? "border-primary/60 text-foreground"
                  : "border-border text-foreground"
              }`}
            >
              <span className="truncate">
                {fabricanteSel?.nome ?? (
                  <span className="font-medium text-muted-foreground">Selecione o fabricante</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {fabricanteSel && (
                  <X
                    className="h-4 w-4 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ fabricante_id: "", padrao_id: "", q: "" });
                    }}
                  />
                )}
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary transition group-hover:bg-primary/10">
                  <ChevronDown className="h-4 w-4 text-foreground" />
                </span>
              </span>
            </button>
          </FieldLabel>

          <FieldLabel label="Cor / Padrão">
            <button
              onClick={() => {
                if (fabricanteSel) setShowPadraoPicker(true);
              }}
              disabled={!fabricanteSel}
              className={`group flex h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 px-4 text-sm font-semibold shadow-sm transition hover:border-primary focus:border-primary focus:outline-none active:border-primary ${
                !fabricanteSel
                  ? "cursor-not-allowed border-dashed border-border bg-secondary/40 text-muted-foreground hover:border-border"
                  : padraoSel
                    ? "border-primary/60 bg-white text-foreground"
                    : "border-border bg-white text-foreground"
              }`}
            >
              <span className="truncate">
                {!fabricanteSel
                  ? "Escolha o fabricante primeiro"
                  : (padraoSel?.nome ?? (
                      <span className="font-medium text-muted-foreground">
                        Selecione a cor / padrão
                      </span>
                    ))}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {padraoSel && (
                  <X
                    className="h-4 w-4 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ padrao_id: "", q: "" });
                    }}
                  />
                )}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full transition ${fabricanteSel ? "bg-secondary group-hover:bg-primary/10" : "bg-secondary"}`}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition ${fabricanteSel ? "text-foreground" : "text-muted-foreground"}`}
                  />
                </span>
              </span>
            </button>
          </FieldLabel>
        </Section>

        {/* ============ BLOCO: FILTROS (aparece aos poucos) ============ */}
        {showFilters && (
          <Section title="Filtros">
            {/* Espessuras */}
            <FieldLabel label="Espessura">
              <div className="grid grid-cols-4 gap-2">
                {espessurasBusca.map((e) => {
                  const v = Number(e.valor_mm);
                  const active = espessurasSel.includes(v);
                  return (
                    <button
                      key={e.id}
                      onClick={() => toggleEspessura(v)}
                      className={`rounded-xl py-2.5 text-xs font-bold transition ${
                        active
                          ? "bg-primary text-primary-foreground shadow-card"
                          : "bg-card text-foreground ring-1 ring-border"
                      }`}
                    >
                      {v}mm
                    </button>
                  );
                })}
              </div>
              {espessurasSel.length > 0 && (
                <button
                  onClick={() => update({ espessuras: "" })}
                  className="mt-2 text-xs font-semibold text-primary"
                >
                  Limpar espessuras
                </button>
              )}
            </FieldLabel>

            {/* Medidas da chapa */}
            <div>
              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label="Comprimento (cm)">
                  <input
                    ref={compInputRef}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_COMPRIMENTO_CM}
                    placeholder={`ex: ${MAX_COMPRIMENTO_CM}`}
                    value={compMinInput}
                    onChange={(e) =>
                      setCompMinInput(clampDimensionInput(e.target.value, MAX_COMPRIMENTO_CM))
                    }
                    className={inputCls}
                  />
                  <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black uppercase leading-tight text-primary">
                    Comprimento = sentido do veio
                  </span>
                </FieldLabel>
                <FieldLabel label="Largura (cm)">
                  <input
                    ref={largInputRef}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_LARGURA_CM}
                    placeholder={`ex: ${MAX_LARGURA_CM}`}
                    value={largMinInput}
                    onChange={(e) =>
                      setLargMinInput(clampDimensionInput(e.target.value, MAX_LARGURA_CM))
                    }
                    className={inputCls}
                  />
                </FieldLabel>
              </div>
              {(effectiveCompMin > 0 || effectiveLargMin > 0) && (
                <button
                  onClick={() => {
                    setCompMinInput("");
                    setLargMinInput("");
                    update({ comp_min: 0, larg_min: 0 });
                  }}
                  className="mt-2 text-xs font-semibold text-primary"
                >
                  Limpar medidas
                </button>
              )}
            </div>

            {/* Distância slider */}
            <div className="rounded-2xl bg-secondary px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-primary" />
                  Raio de busca
                </span>
                <span className="text-sm font-black text-primary">{raioBusca} km</span>
              </div>
              <Slider
                value={[Math.min(params.raio, 50)]}
                min={0}
                max={50}
                step={1}
                onValueChange={(v) => update({ raio: v[0] ?? 0 })}
              />
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
                <span>0 km</span>
                <span>50 km</span>
              </div>
            </div>
          </Section>
        )}

        {/* ============ RESULTADOS ============ */}
        <div className="space-y-3">
          {breadcrumb && (
            <div className="line-clamp-2 text-xs font-semibold text-foreground">{breadcrumb}</div>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
              {hasSelection ? "Compatíveis com sua busca" : "Últimos anunciados"}
            </h2>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {isLoading
                ? "Buscando…"
                : `${results.length} ${results.length === 1 ? "anúncio" : "anúncios"}`}
            </span>
          </div>
          {!hasSelection && !isLoading && results.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Selecione fabricante e cor acima para ver apenas os compatíveis.
            </p>
          )}

          {!isLoading && results.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <div className="mb-1 text-base font-bold text-foreground">
                Nenhum material encontrado no momento.
              </div>
              <p className="mx-auto mb-5 max-w-xs text-sm text-muted-foreground">
                Registre uma busca automática e te avisamos assim que alguém anunciar este material
                perto de você.
              </p>
              <Link
                to="/app/pedidos"
                search={{
                  novo: 1,
                  fabricante_id: params.fabricante_id || undefined,
                  padrao_id: params.padrao_id || undefined,
                  espessura: espessurasSel[0]?.toString() || undefined,
                  comprimento_cm: effectiveCompMin || undefined,
                  largura_cm: effectiveLargMin || undefined,
                  raio: params.raio,
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-pop active:scale-[0.98]"
              >
                <Search className="h-4 w-4" /> Registrar Busca Automática
              </Link>
            </div>
          )}

          {results.map((m: any) => (
            <Link
              key={m.id}
              to="/app/material/$id"
              params={{ id: m.id }}
              className="block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition active:scale-[0.99]"
            >
              <div className="flex">
                <div className="h-28 w-28 shrink-0 bg-secondary">
                  {m.foto ? (
                    <img src={m.foto} alt={m.padrao} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      sem foto
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold">
                        <span className="truncate">{m.padrao}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.fabricante ?? "—"} · {Number(m.espessura_mm)}mm
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-primary">
                        {formatBRL(Number(m.preco))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDimensions(m.comprimento_cm, m.largura_cm)}
                      </div>
                      <PlanoBadge
                        plano_slug={m.plano_slug}
                        plano_vigente={m.plano_vigente}
                        className="mt-1 justify-end"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {m.cidade ?? ""}
                      {m.cidade ? "/" : ""}
                      {m.estado ?? ""}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.grain_direction && (
                        <GrainBadge grain={m.grain_direction} espessura={m.espessura_mm} />
                      )}
                      <span className="font-semibold text-accent">
                        {formatDistance(m.distancia)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {showFabPicker && (
        <FabricantePicker
          fabricantes={fabricantes ?? []}
          selected={params.fabricante_id}
          onClose={() => setShowFabPicker(false)}
          onSelect={(id) => {
            // Trocar fabricante limpa o padrão escolhido
            update({ fabricante_id: id, padrao_id: "", q: "" });
            setShowFabPicker(false);
          }}
        />
      )}
      {showPadraoPicker && fabricanteSel && (
        <PadraoPicker
          fabricanteId={params.fabricante_id}
          onClose={() => setShowPadraoPicker(false)}
          onSelect={(item) => {
            update({
              q: item?.nome ?? "",
              padrao_id: item?.id ?? "",
            });
            setShowPadraoPicker(false);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border-2 border-border bg-white px-4 text-sm font-semibold shadow-sm outline-none transition focus:border-primary";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-border">
      <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-primary">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FabricantePicker({
  fabricantes,
  selected,
  onClose,
  onSelect,
}: {
  fabricantes: { id: string; nome: string }[];
  selected: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Sheet title="Selecionar Fabricante" onClose={onClose}>
      <div
        className="max-h-[65vh] overflow-y-auto overscroll-contain pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <button
          type="button"
          onClick={() => onSelect("")}
          className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-secondary active:bg-secondary"
        >
          <span className="font-semibold text-muted-foreground">Todos os fabricantes</span>
          {!selected && <Check className="h-4 w-4 text-primary" />}
        </button>
        {fabricantes.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-secondary active:bg-secondary"
          >
            <span className="font-semibold">{f.nome}</span>
            {selected === f.id && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-secondary text-sm font-bold"
        >
          Cancelar
        </button>
      </div>
    </Sheet>
  );
}

function PadraoPicker({
  fabricanteId,
  onClose,
  onSelect,
}: {
  fabricanteId: string;
  onClose: () => void;
  onSelect: (item: AutoItem | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ["padroes-auto", fabricanteId],
    queryFn: async () => {
      let query = supabase
        .from("padroes")
        .select("id, nome, fabricante_id, fabricantes:fabricante_id(nome)")
        .order("nome")
        .limit(200);
      if (fabricanteId) query = query.eq("fabricante_id", fabricanteId);
      const { data, error } = await query;
      if (error) throw error;
      return sortByNome((data ?? []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        fabricante_id: p.fabricante_id,
        fabricante: p.fabricantes?.nome ?? "",
      })) as AutoItem[]);
    },
  });

  return (
    <Sheet title="Selecionar Cor / Padrão" onClose={onClose}>
      <div
        className="max-h-[65vh] overflow-y-auto overscroll-contain pb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex min-h-[56px] w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-secondary active:bg-secondary"
        >
          <span className="font-semibold text-muted-foreground">Qualquer padrão</span>
        </button>
        {(data ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelect(item);
              toast.success(`Padrão selecionado: ${item.nome}`, { duration: 1000 });
            }}
            className="flex min-h-[56px] w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-secondary active:bg-secondary"
          >
            <span className="truncate font-semibold">{item.nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{item.fabricante}</span>
          </button>
        ))}
        {(data?.length ?? 0) === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Nenhum padrão encontrado.
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl bg-secondary text-sm font-bold"
        >
          Cancelar
        </button>
      </div>
    </Sheet>
  );
}
