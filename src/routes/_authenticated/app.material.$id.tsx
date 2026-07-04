import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft, MapPin, MessageCircle, Eye, Phone, Heart, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, waLink } from "@/lib/whatsapp";
import { useGeolocation } from "@/hooks/use-geolocation";
import { haversineKm, formatDistance } from "@/lib/distance";
import { GrainBoard } from "@/components/grain";
import { grainArrow, grainLabel } from "@/lib/grain";
import { useAuth } from "@/hooks/use-auth";
import { DenunciaButton } from "@/components/denuncia-modal";
import { CrownBadge } from "@/components/premium-badge";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

export const Route = createFileRoute("/_authenticated/app/material/$id")({
  component: Detalhe,
});

function Detalhe() {
  const { id } = Route.useParams();
  const { coords } = useGeolocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const isAuthed = !!user;
  const [idx, setIdx] = useState(0);
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIdx(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const { data, isLoading } = useQuery({
    queryKey: ["material", id],
    queryFn: async () => {
      const { data: material, error } = await supabase
        .from("materiais")
        .select("*, fotos_materiais(url, ordem)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!material) return null;
      const { data: empresa } = await supabase.rpc("empresa_publica", {
        _empresa_id: material.empresa_id,
      });
      const { signAllFotos } = await import("@/lib/material-photos");
      const fotosSigned = await signAllFotos((material as any).fotos_materiais);
      return {
        ...material,
        fotos_materiais: fotosSigned,
        empresas: Array.isArray(empresa) ? empresa[0] : empresa,
      };
    },
  });

  useEffect(() => {
    if (!data || !isAuthed) return;
    supabase.auth.getUser().then(({ data: u }) => {
      supabase.from("material_views").insert({ material_id: id, viewer_id: u.user?.id ?? null });
    });
  }, [data, id, isAuthed]);

  if (isLoading || !data) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const fotos = (data.fotos_materiais || []) as { url: string; ordem: number }[];
  const empresa: any = data.empresas;
  const dist =
    coords && empresa?.latitude && empresa?.longitude
      ? haversineKm(coords, { lat: empresa.latitude, lng: empresa.longitude })
      : null;

  const comprimentoCm = Number(data.comprimento_cm);
  const larguraCm = Number(data.largura_cm);
  const msg = `Olá, tudo bem?

Vim pelo SOS Marceneiros e tenho interesse em comprar a seguinte peça:

📦 Material: ${data.padrao}
🏭 Fabricante: ${data.fabricante ?? "—"}
📏 Medidas: ${comprimentoCm} x ${larguraCm} cm
📐 Espessura: ${Number(data.espessura_mm)} mm
📍 Anúncio encontrado no SOS Marceneiros.

A peça ainda está disponível?

Se possível, poderia me enviar algumas fotos atuais da peça para eu verificar o estado e as condições do material?

Obrigado!`;

  const conversar = async () => {
    if (!isAuthed) {
      navigate({ to: "/auth" });
      return;
    }
    if (!empresa?.whatsapp) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase
      .from("material_contatos")
      .insert({ material_id: id, viewer_id: u.user?.id ?? null });
    window.open(waLink(empresa.whatsapp, msg), "_blank");
  };

  return (
    <div className="pb-32">
      <div className="relative">
        <Carousel
          setApi={setApi}
          opts={{ align: "start", loop: false }}
          className="aspect-square w-full bg-secondary"
        >
          <CarouselContent className="ml-0 h-full">
            {fotos.length > 0 ? (
              fotos.map((foto, i) => (
                <CarouselItem key={`${foto.url}-${i}`} className="h-full pl-0">
                  <div className="aspect-square w-full overflow-hidden">
                    <img
                      src={foto.url}
                      alt={`${data.padrao} ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </CarouselItem>
              ))
            ) : (
              <CarouselItem className="h-full pl-0">
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  Sem fotos
                </div>
              </CarouselItem>
            )}
          </CarouselContent>
        </Carousel>
        <button
          onClick={() => navigate({ to: "/app/buscar" })}
          className="safe-top absolute left-4 top-3 grid h-10 w-10 place-items-center rounded-xl bg-card/90 backdrop-blur shadow-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {isAuthed && (
          <div className="safe-top absolute right-4 top-3 flex gap-2">
            <DenunciaButton
              target={{ type: "anuncio", materialId: id, empresaId: data.empresa_id }}
            />
          </div>
        )}
        {fotos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {fotos.map((_: any, i: number) => (
              <button
                key={i}
                type="button"
                onClick={() => api?.scrollTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-card/70"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight">{data.padrao}</h1>
            <p className="text-sm text-muted-foreground">
              {data.fabricante ?? "Fabricante não informado"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-black text-primary">{formatBRL(Number(data.preco))}</div>
            <div className="text-[11px] text-muted-foreground">
              {formatBRL(Number(data.valor_m2))}/m²
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-secondary p-3 text-center">
          <Info label="Espessura" value={`${Number(data.espessura_mm)}mm`} />
          <Info label="Compr." value={`${Number(data.comprimento_cm)}cm`} />
          <Info label="Largura" value={`${Number(data.largura_cm)}cm`} />
          <Info label="Área" value={`${Number(data.area_m2).toFixed(2)}m²`} />
        </div>

        {data.grain_direction && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Sentido do veio
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                <span>{grainArrow(data.grain_direction as any)}</span>
                <span>{grainLabel(data.grain_direction as any)}</span>
              </span>
            </div>
            <GrainBoard grain={data.grain_direction as any} />
          </div>
        )}

        {data.observacoes && (
          <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-secondary p-4 text-sm">
            {data.observacoes}
          </p>
        )}

        {isAuthed ? (
          <>
            <Link
              to="/app/empresa/$id"
              params={{ id: data.empresa_id }}
              className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-bold">
                  <span className="truncate">{empresa?.nome_empresa}</span>
                  <CrownBadge
                    plano_slug={empresa?.plano_slug}
                    plano_vigente={empresa?.plano_vigente}
                  />
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {empresa?.cidade}/{empresa?.estado} ·{" "}
                  {formatDistance(dist)}
                </div>
              </div>
              <Heart className="h-5 w-5 text-muted-foreground" />
            </Link>
            <div className="mt-2 flex justify-end">
              <DenunciaButton
                target={{ type: "empresa", empresaId: data.empresa_id }}
                variant="text"
              />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-5 text-center">
            <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-secondary">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-bold">Informações do vendedor protegidas</div>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
              Crie uma conta gratuita para visualizar os dados da empresa e entrar em contato.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                to="/auth"
                className="grid h-11 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-pop active:scale-[0.98]"
              >
                Criar conta grátis
              </Link>
              <Link
                to="/auth"
                className="grid h-11 place-items-center rounded-xl border border-border bg-card text-sm font-semibold active:scale-[0.98]"
              >
                Entrar
              </Link>
            </div>
            <div className="mt-4 text-[11px] text-muted-foreground">
              Cidade:{" "}
              <span className="font-semibold text-foreground">
                {empresa?.cidade}/{empresa?.estado}
              </span>{" "}
              · {formatDistance(dist)}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-4 gap-3 text-center text-[11px] text-muted-foreground">
          <Stat icon={Eye} value={data.views ?? 0} label="visitas" />
          <Stat icon={MessageCircle} value={data.contatos ?? 0} label="contatos" />
          <Stat icon={Phone} value={empresa?.avaliacao ?? "—"} label="avaliação" />
          <Stat icon={MapPin} value={formatDistance(dist)} label="distância" />
        </div>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          {isAuthed ? (
            <button
              onClick={conversar}
              disabled={!empresa?.whatsapp}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-base font-bold text-white shadow-pop active:scale-[0.98] disabled:opacity-60"
            >
              <svg viewBox="0 0 32 32" className="h-6 w-6" fill="currentColor" aria-hidden>
                <path d="M19.11 17.21c-.27-.14-1.6-.79-1.85-.88s-.43-.14-.61.14-.7.88-.86 1.06-.31.21-.58.07a7.4 7.4 0 0 1-2.18-1.35 8.2 8.2 0 0 1-1.51-1.88c-.16-.27 0-.42.12-.56s.27-.31.4-.47a1.83 1.83 0 0 0 .27-.45.5.5 0 0 0 0-.47c-.07-.14-.61-1.47-.84-2s-.45-.45-.61-.46h-.52a1 1 0 0 0-.73.34 3 3 0 0 0-.95 2.25 5.27 5.27 0 0 0 1.11 2.81 12.06 12.06 0 0 0 4.64 4.1c.65.28 1.16.45 1.55.57a3.75 3.75 0 0 0 1.71.11 2.79 2.79 0 0 0 1.84-1.3 2.27 2.27 0 0 0 .16-1.3c-.07-.12-.25-.19-.52-.33zM16.05 4A12 12 0 0 0 5.7 22l-1.7 6.2 6.35-1.66A12 12 0 1 0 16.05 4zm0 21.84a9.84 9.84 0 0 1-5-1.37l-.36-.21-3.77 1 1-3.67-.23-.38a9.86 9.86 0 1 1 8.36 4.65z" />
              </svg>
              Comprar pelo WhatsApp
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/auth" })}
              disabled={authLoading}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-pop active:scale-[0.98]"
            >
              <Lock className="h-5 w-5" />
              Criar conta para entrar em contato
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
function Stat({ icon: Icon, value, label }: { icon: any; value: any; label: string }) {
  return (
    <div className="rounded-xl bg-secondary p-2">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <div className="mt-1 text-sm font-bold text-foreground">{value}</div>
      <div>{label}</div>
    </div>
  );
}
