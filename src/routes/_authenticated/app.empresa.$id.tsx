import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Calendar, Package, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/whatsapp";
import { useGeolocation } from "@/hooks/use-geolocation";
import { haversineKm, formatDistance } from "@/lib/distance";
import { CrownBadge, BrilhanteSelo, isBrilhante } from "@/components/premium-badge";

export const Route = createFileRoute("/_authenticated/app/empresa/$id")({
  component: EmpresaPublica,
});

function EmpresaPublica() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { coords } = useGeolocation();

  const { data: empresa, isLoading } = useQuery({
    queryKey: ["empresa-publica", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("empresa_publica", { _empresa_id: id });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
  });

  const { data: materiais } = useQuery({
    queryKey: ["empresa-materiais", id, coords?.lat, coords?.lng],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materiais")
        .select("id, padrao, fabricante, espessura_mm, preco, area_m2, created_at, fotos_materiais(url, ordem)")
        .eq("empresa_id", id)
        .eq("status", "ativo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { attachFirstFoto } = await import("@/lib/material-photos");
      return await attachFirstFoto((data ?? []) as any[]);
    },
  });

  if (isLoading || !empresa) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const dist =
    coords && empresa.latitude && empresa.longitude
      ? haversineKm(coords, { lat: empresa.latitude, lng: empresa.longitude })
      : null;

  const cadastro = empresa.created_at ? new Date(empresa.created_at) : null;
  const tempoMs = cadastro ? Date.now() - cadastro.getTime() : 0;
  const tempoMeses = Math.max(1, Math.floor(tempoMs / (1000 * 60 * 60 * 24 * 30)));
  const tempoLabel =
    tempoMeses >= 12
      ? `${Math.floor(tempoMeses / 12)} ano${Math.floor(tempoMeses / 12) > 1 ? "s" : ""}`
      : `${tempoMeses} ${tempoMeses === 1 ? "mês" : "meses"}`;

  return (
    <div className="pb-32">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/app/buscar" })}
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-lg font-black">Perfil da empresa</h1>
      </header>

      <section className="px-5 pt-5">
        <div className="flex items-start gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary">
            {empresa.logo_url && empresa.logo_url.trim() ? (
              <img
                src={empresa.logo_url}
                className="h-full w-full object-cover"
                alt=""
                onError={() => console.warn("[empresa] logo falhou", { src: empresa.logo_url })}
              />
            ) : (
              <Store className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 truncate text-xl font-black">
              <span className="truncate">{empresa.nome_empresa || "Marcenaria"}</span>
              <CrownBadge
                plano_slug={(empresa as any).plano_slug}
                plano_vigente={(empresa as any).plano_vigente}
                size="lg"
              />
            </h2>
            {isBrilhante((empresa as any).plano_slug, (empresa as any).plano_vigente) && (
              <div className="mt-1">
                <BrilhanteSelo
                  plano_slug={(empresa as any).plano_slug}
                  plano_vigente={(empresa as any).plano_vigente}
                />
                <p className="mt-1 text-[11px] font-semibold text-yellow-700">
                  Parceiro Premium SOS Marceneiros
                </p>
              </div>
            )}
            {empresa.responsavel && (
              <p className="text-xs text-muted-foreground">Resp.: {empresa.responsavel}</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {empresa.cidade}/{empresa.estado}
              {dist !== null && ` · ${formatDistance(dist)}`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-3 text-center">
          <Stat icon={Package} value={(materiais ?? []).length} label="anúncios" />
          <Stat icon={Calendar} value={tempoLabel} label="na plataforma" />
          <Stat
            icon={MapPin}
            value={cadastro ? cadastro.toLocaleDateString("pt-BR") : "—"}
            label="cadastro"
          />
        </div>

      </section>

      <section className="px-5 pt-6">
        <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-muted-foreground">
          Sobras disponíveis
        </h3>
        <div className="space-y-2">
          {(materiais ?? []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Esta empresa ainda não possui anúncios ativos.
            </div>
          )}
          {(materiais ?? []).map((m: any) => (
            <Link
              key={m.id}
              to="/app/material/$id"
              params={{ id: m.id }}
              className="flex gap-3 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
            >
              <div className="h-24 w-24 shrink-0 bg-secondary">
                {m.foto && <img src={m.foto} className="h-full w-full object-cover" alt="" />}
              </div>
              <div className="min-w-0 flex-1 py-2 pr-3">
                <div className="truncate font-bold">{m.padrao}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.fabricante ?? "—"} · {Number(m.espessura_mm)}mm
                </div>
                <div className="mt-1 text-sm font-bold text-primary">
                  {formatBRL(Number(m.preco))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: any; value: any; label: string }) {
  return (
    <div>
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <div className="mt-1 text-sm font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
