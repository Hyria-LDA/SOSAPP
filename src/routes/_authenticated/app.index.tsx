import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Search, Plus, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/use-geolocation";
import { Logo } from "@/components/logo";
import { SplashBannerGate } from "@/components/splash-banner";
import { BrilhanteSelo } from "@/components/premium-badge";
import logoUrl from "@/assets/logo-sos-marceneiros-v3.png";
import mascotUrl from "@/assets/mascote-sos-assistencia.png";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Home,
});

type Banner = {
  id: string;
  titulo: string | null;
  subtitulo: string | null;
  imagem_url: string;
  link: string | null;
  botao_texto: string | null;
  duracao_segundos: number;
  planos_alvo: string[] | null;
};

function Home() {
  const { coords } = useGeolocation();
  const rotationSeedRef = useRef<string>(Math.random().toString(36).slice(2));
  const geoKey = coords?.lat && coords?.lng ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : "no-geo";


  const { data: userPlanSlug } = useQuery({
    queryKey: ["user-plan-slug"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return "free";
      const { data: status } = await supabase.rpc("get_user_plan_status" as any, {
        _user_id: u.user.id,
      });
      return ((status as any)?.plano?.slug as string) ?? "free";
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: banners } = useQuery({
    queryKey: ["home-banners", userPlanSlug ?? "free"],
    enabled: !!userPlanSlug,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("banners" as any)
        .select(
          "id, titulo, subtitulo, imagem_url, link, botao_texto, duracao_segundos, planos_alvo, data_inicio, data_fim, exibir_abertura",
        )
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      const slug = userPlanSlug ?? "free";
      const filtered = (data ?? []).filter((b: any) => {
        if (b.exibir_abertura) return false; // splash apenas
        if (b.data_inicio && b.data_inicio > nowIso) return false;
        if (b.data_fim && b.data_fim < nowIso) return false;
        const alvo: string[] = Array.isArray(b.planos_alvo) ? b.planos_alvo : [];
        if (alvo.length === 0) return true;
        return alvo.includes(slug);
      });
      const { signBannerPaths } = await import("@/lib/banner-images");
      const map = await signBannerPaths(filtered.map((b: any) => b.imagem_url));
      return filtered.map((b: any) => ({
        ...b,
        imagem_url: map[b.imagem_url] ?? b.imagem_url,
      })) as unknown as Banner[];
    },
    staleTime: 50 * 60 * 1000,
  });


  const { data: popularesRaw } = useQuery({
    queryKey: ["sobras-perto", geoKey, rotationSeedRef.current],
    queryFn: async () => {
      const hasGeo = coords?.lat != null && coords?.lng != null;
      const { data, error } = await supabase.rpc("materiais_perto_de_voce", {
        _lat: coords?.lat ?? undefined,
        _lon: coords?.lng ?? undefined,
        _limit: 12,
        _raio_km: hasGeo ? 5 : 999999,
        _seed: rotationSeedRef.current,
      });
      if (error) throw error;
      const ids = (data ?? []).map((m: any) => m.id);
      if (ids.length === 0) return [];
      const { data: fotos } = await supabase
        .from("fotos_materiais")
        .select("material_id, url, ordem")
        .in("material_id", ids)
        .order("ordem", { ascending: true });
      const byMat = new Map<string, any[]>();
      (fotos ?? []).forEach((f: any) => {
        const arr = byMat.get(f.material_id) ?? [];
        arr.push(f);
        byMat.set(f.material_id, arr);
      });
      const enriched = (data ?? []).map((m: any) => ({
        ...m,
        fotos_materiais: byMat.get(m.id) ?? [],
      }));
      const { attachFirstFoto } = await import("@/lib/material-photos");
      return attachFirstFoto(enriched);
    },
  });

  const populares = popularesRaw ?? [];

  return (
    <div className="safe-top px-5 pt-3">
      <SplashBannerGate />
      <div className="flex items-center justify-between">
        <Logo size="sm" />
      </div>

      {banners && banners.length > 0 && (
        <div className="mt-2">
          <BannersCarousel banners={banners} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          to="/app/buscar"
          className="flex h-20 flex-col items-start justify-between rounded-2xl bg-primary p-3 text-primary-foreground shadow-card transition active:scale-[0.98]"
        >
          <Search className="h-5 w-5" />
          <span className="text-sm font-semibold leading-tight">
            Buscar
            <br />
            Material
          </span>
        </Link>
        <Link
          to="/app/anunciar"
          className="flex h-20 flex-col items-start justify-between rounded-2xl bg-accent p-3 text-accent-foreground shadow-card transition active:scale-[0.98]"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-semibold leading-tight">
            Anunciar
            <br />
            Sobra
          </span>
        </Link>
        <Link
          to="/app/pedidos"
          className="col-span-2 flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] transition active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
            <Bell className="h-4 w-4 text-[#15803d]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1f2937]">Avisos Automáticos</span>
              <span className="rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-semibold text-white">
                Novidade
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[#4b5563]">
              Cadastre o material que procura e seja avisado quando aparecer uma sobra compatível.
            </p>
          </div>
          <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" />
        </Link>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sobras Perto de Você
          </h2>
          <Link to="/app/buscar" className="text-xs font-semibold text-primary">
            Ver todos
          </Link>
        </div>
        <div className="space-y-2">
          {(populares ?? []).map((m: any) => (
            <Link
              key={m.id}
              to="/app/material/$id"
              params={{ id: m.id }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {m.foto ? (
                  <img src={m.foto} alt={m.padrao} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground text-xs">
                    Sem foto
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.padrao}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {m.fabricante ?? "—"} · {m.cidade ?? ""}/{m.estado ?? ""}
                  {typeof m.distancia_km === "number" && (
                    <> · {m.distancia_km.toFixed(1)} km</>
                  )}
                </div>
              </div>
              <div className="relative shrink-0 text-right">
                <div className="text-sm font-bold text-primary">
                  R$ {Number(m.preco).toFixed(2)}
                </div>
                <BrilhanteSelo
                  plano_slug={m.plano_slug}
                  plano_vigente={m.plano_vigente}
                  className="mt-1 justify-end"
                />
              </div>
            </Link>
          ))}
          {populares && populares.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhuma sobra encontrada por perto ainda.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function BannersCarousel({ banners }: { banners: Banner[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  // Auto-play (duração configurada por banner; padrão 10s)
  useEffect(() => {
    if (!api || banners.length <= 1) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const idx = api.selectedScrollSnap();
      const ms = Math.max(1, Math.min(60, banners[idx]?.duracao_segundos ?? 10)) * 1000;
      timeoutId = setTimeout(() => {
        api.scrollNext();
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [api, banners]);


  // View tracking — registra 1x por banner por sessão
  useEffect(() => {
    const b = banners[current];
    if (!b || tracked.has(b.id)) return;
    setTracked((s) => new Set(s).add(b.id));
    supabase.rpc("increment_banner_view" as any, { _banner_id: b.id }).then(() => {});
  }, [current, banners, tracked]);

  return (
    <div>
      <Carousel setApi={setApi} opts={{ loop: true, align: "start" }}>
        <CarouselContent>
          {banners.map((b) => (
            <CarouselItem key={b.id}>
              <BannerSlide banner={b} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {banners.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => api?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === current ? "w-6 bg-primary" : "w-1.5 bg-border"}`}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BannerSlide({ banner }: { banner: Banner }) {
  const trackClick = () => {
    supabase.rpc("increment_banner_click" as any, { _banner_id: banner.id }).then(() => {});
  };
  const isExternal = banner.link?.startsWith("http");

  const hasContent = !!(banner.titulo || banner.subtitulo || banner.botao_texto);

  const content = (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-[#fff7ed] shadow-pop">
      <div className="relative flex h-[78px] items-center overflow-hidden px-3">
        <div className="absolute -bottom-3 left-1 z-10 h-[92px] w-[96px] overflow-hidden rounded-3xl">
          <img
            src={mascotUrl}
            alt=""
            className="h-full w-full object-cover object-[center_30%]"
            aria-hidden="true"
          />
        </div>

        <div className="ml-[104px] flex min-w-0 flex-1 items-center gap-2">
          <img src={logoUrl} alt="SOS Marceneiros" className="h-12 w-auto max-w-full object-contain" />
        </div>

        <div className="hidden shrink-0 items-center gap-1 text-[10px] font-bold text-primary min-[390px]:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Localizado
        </div>
      </div>

      <img
        src={banner.imagem_url}
        alt={banner.titulo ?? ""}
        className={`w-full object-cover ${hasContent ? "h-[165px]" : "h-[190px]"}`}
      />

      {hasContent && (
        <div className="flex min-h-[38px] items-center justify-between bg-card px-3">
          <div className="min-w-0">
            {banner.titulo && (
              <div className="truncate text-[11px] font-black leading-tight">{banner.titulo}</div>
            )}
          </div>
          {banner.botao_texto &&
            banner.link &&
            (isExternal ? (
              <a
                href={banner.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackClick}
                className="ml-2 inline-flex shrink-0 items-center rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground"
              >
                {banner.botao_texto}
              </a>
            ) : (
              <Link
                to={banner.link as any}
                onClick={trackClick}
                className="ml-2 inline-flex shrink-0 items-center rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground"
              >
                {banner.botao_texto}
              </Link>
            ))}
          {banner.botao_texto && !banner.link && (
            <span className="ml-2 inline-flex shrink-0 items-center rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground opacity-80">
              {banner.botao_texto}
            </span>
          )}
        </div>
      )}
    </div>
  );

  // Sem texto/botão e com link → imagem inteira clicável
  if (banner.link && !banner.botao_texto) {
    return isExternal ? (
      <a
        href={banner.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackClick}
        className="block"
      >
        {content}
      </a>
    ) : (
      <Link to={banner.link as any} onClick={trackClick} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
