import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireStoreRole } from "@/lib/store-portal";
import { normalizeCity } from "@/lib/banner-regions";
import { signMateriaisPaths } from "@/lib/material-photos";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

type Company = { id: string; nome_empresa: string | null; cidade: string | null; estado: string | null };
type Photo = {
  id: string;
  url: string;
  thumbnail_url: string | null;
  ordem: number;
  ai_status: string;
  preview?: string;
};
type Material = {
  id: string;
  empresa_id: string;
  padrao: string;
  fabricante: string | null;
  created_at: string;
  status: Database["public"]["Enums"]["material_status"];
  empresas: Company;
  fotos_materiais: Photo[];
};
type Cursor = { created_at: string; id: string } | null;
const PAGE_SIZE = 20;
const statuses: Record<Material["status"], string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  pausado: "Pausado",
  em_revisao: "Em revisão",
  suspenso: "Suspenso",
  expirado: "Expirado",
  arquivado: "Arquivado",
};
const photoStatuses: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  manual_review: "Revisão manual",
  rejected: "Rejeitada",
};
const field = "mt-1 h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm";
const button =
  "rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold disabled:opacity-50";
export const Route = createFileRoute("/_authenticated/app/admin/ultimas-sobras")({
  ssr: false,
  beforeLoad: async () => {
    const access = await requireStoreRole(true);
    if (!access.user) throw redirect({ to: "/auth" });
    if (!access.allowed) throw redirect({ to: "/app" });
    return { adminId: access.user.id };
  },
  component: RecentMaterials,
});
function RecentMaterials() {
  const { adminId } = Route.useRouteContext();
  const [uf, setUf] = useState(""),
    [city, setCity] = useState(""),
    [company, setCompany] = useState(""),
    [status, setStatus] = useState(""),
    [group, setGroup] = useState("recent");
  const [zoom, setZoom] = useState<{ photo: Photo; title: string } | null>(null);
  const companies = useQuery({
    queryKey: ["admin-recent-companies", adminId],
    queryFn: async () => {
      const rows: Company[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("empresas")
          .select("id,nome_empresa,cidade,estado")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      return rows;
    },
  });
  const options = useMemo(() => {
    const list = companies.data || [];
    const states = [
      ...new Set(list.map((e) => e.estado?.trim().toUpperCase() || "").filter(Boolean)),
    ].sort();
    const inState = list.filter((e) => !uf || e.estado?.trim().toUpperCase() === uf);
    const cities = new Map<string, string>();
    for (const e of inState) {
      if (e.cidade?.trim()) cities.set(normalizeCity(e.cidade), e.cidade.trim());
    }
    const choices = inState
      .filter((e) => !city || normalizeCity(e.cidade) === city)
      .sort((a, b) => (a.nome_empresa || "").localeCompare(b.nome_empresa || "", "pt-BR"));
    return {
      states,
      cities: [...cities.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")),
      companies: choices,
      rawStates: [
        ...new Set(list.filter((e) => e.estado?.trim().toUpperCase() === uf).map((e) => e.estado!)),
      ],
      rawCities: [
        ...new Set(
          inState.filter((e) => normalizeCity(e.cidade) === city && e.cidade).map((e) => e.cidade!),
        ),
      ],
    };
  }, [companies.data, uf, city]);
  const ads = useInfiniteQuery({
    queryKey: [
      "admin-recent-materials",
      adminId,
      uf,
      city,
      company,
      status,
      options.rawStates,
      options.rawCities,
    ],
    enabled: !!companies.data,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam, signal }) => {
      let query = supabase
        .from("materiais")
        .select(
          "id,empresa_id,padrao,fabricante,created_at,status,empresas!inner(id,nome_empresa,cidade,estado),fotos_materiais(id,url,thumbnail_url,ordem,ai_status)",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (uf) query = query.in("empresas.estado", options.rawStates);
      if (city) query = query.in("empresas.cidade", options.rawCities);
      if (company) query = query.eq("empresa_id", company);
      if (status) query = query.eq("status", status as Material["status"]);
      if (pageParam)
        query = query.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      const { data, error } = await query.abortSignal(signal);
      if (error) throw error;
      const rows = (data || []).slice(0, PAGE_SIZE) as Material[];
      const paths = rows.flatMap((r) => r.fotos_materiais.map((p) => p.thumbnail_url || p.url));
      const signed = await signMateriaisPaths(paths);
      const last = rows.at(-1);
      return {
        rows: rows.map((r) => ({
          ...r,
          fotos_materiais: [...r.fotos_materiais]
            .sort((a, b) => a.ordem - b.ordem)
            .map((p) => ({ ...p, preview: signed[p.thumbnail_url || p.url] })),
        })),
        next: (data.length > PAGE_SIZE && last
          ? { created_at: last.created_at, id: last.id }
          : null) as Cursor,
      };
    },
    getNextPageParam: (page) => page.next || undefined,
  });
  const fullPhoto = useQuery({
    queryKey: ["admin-recent-photo", adminId, zoom?.photo.id, zoom?.photo.url],
    enabled: !!zoom,
    queryFn: async () => {
      const map = await signMateriaisPaths([zoom!.photo.url]);
      const url = map[zoom!.photo.url];
      if (!url) throw new Error("Não foi possível abrir esta foto.");
      return url;
    },
  });
  const rows = ads.data?.pages.flatMap((p) => p.rows) || [];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key =
      group === "company"
        ? row.empresa_id
        : group === "region"
          ? JSON.stringify([
              row.empresas.estado?.trim().toUpperCase() || "",
              normalizeCity(row.empresas.cidade),
            ])
          : "recent";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return (
    <main className="safe-top space-y-5 px-4 py-5 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app/admin" className="mb-2 inline-flex items-center gap-1 text-sm underline">
            <ArrowLeft size={16} />
            Administração
          </Link>
          <h1 className="text-2xl font-black">Últimas sobras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira as fotos dos anúncios mais recentes e quem publicou.
          </p>
        </div>
        <button
          className={button}
          disabled={ads.isFetching || companies.isFetching}
          onClick={() => {
            void companies.refetch();
            void ads.refetch();
          }}
        >
          <RefreshCw size={15} className="mr-2 inline" />
          Atualizar
        </button>
      </header>
      <section
        className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Filtros dos anúncios"
      >
        <label className="min-w-0 text-xs font-bold">
          Estado da empresa
          <select
            className={field}
            value={uf}
            onChange={(e) => {
              setUf(e.target.value);
              setCity("");
              setCompany("");
            }}
          >
            <option value="">Todos os estados</option>
            {options.states.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold">
          Cidade da empresa
          <select
            className={field}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setCompany("");
            }}
          >
            <option value="">Todas as cidades</option>
            {options.cities.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold">
          Empresa
          <select className={field} value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">Todas as empresas</option>
            {options.companies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome_empresa || "Empresa sem nome"} · {e.cidade || "Sem cidade"}/
                {e.estado || "—"}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold">
          Situação do anúncio
          <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {(uf || city || company || status) && (
          <button
            className="text-left text-sm font-semibold text-primary underline"
            onClick={() => {
              setUf("");
              setCity("");
              setCompany("");
              setStatus("");
            }}
          >
            Limpar filtros
          </button>
        )}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} anúncios carregados · mais recentes primeiro
        </p>
        <label className="text-xs font-bold">
          Organizar anúncios carregados
          <select className={field} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="recent">Por data</option>
            <option value="region">Por região</option>
            <option value="company">Por empresa</option>
          </select>
        </label>
      </div>
      {companies.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4">
          Não foi possível carregar as empresas: {companies.error.message}
        </p>
      )}
      {(companies.isPending || (!companies.error && ads.isPending)) && (
        <p className="p-8 text-center">Carregando anúncios e fotos…</p>
      )}
      {ads.error && (
        <div role="alert" className="rounded-xl bg-destructive/10 p-4">
          Não foi possível carregar os anúncios: {ads.error.message}{" "}
          <button
            className={button}
            onClick={() => void (ads.isFetchNextPageError ? ads.fetchNextPage() : ads.refetch())}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!companies.error && !ads.error && !ads.isPending && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center">
          Nenhuma sobra encontrada com estes filtros.
        </p>
      )}
      {[...groups].map(([key, items]) => (
        <section key={key} className="space-y-3">
          {group !== "recent" && (
            <h2 className="text-lg font-bold">
              {group === "company"
                ? items[0].empresas.nome_empresa || "Empresa sem nome"
                : `${items[0].empresas.cidade || "Cidade não informada"} / ${items[0].empresas.estado || "UF não informada"}`}
            </h2>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((row) => (
              <article
                key={row.id}
                className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="font-bold">{row.padrao || "Sobra anunciada"}</h3>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold">
                    {statuses[row.status] || row.status}
                  </span>
                </div>
                {row.fotos_materiais.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {row.fotos_materiais.map((photo, i) => (
                      <div key={photo.id}>
                        <button
                          className="block w-full overflow-hidden rounded-xl bg-secondary focus-visible:ring-2 focus-visible:ring-primary"
                          onClick={() =>
                            setZoom({
                              photo,
                              title: `${row.empresas.nome_empresa || "Empresa"} · ${row.padrao} · Foto ${i + 1}`,
                            })
                          }
                          aria-label={`Ampliar foto ${i + 1} de ${row.padrao}`}
                        >
                          <Preview src={photo.preview} label={`Foto ${i + 1} de ${row.padrao}`} />
                        </button>
                        <span
                          className={`mt-1 block text-[10px] font-semibold ${photo.ai_status === "rejected" ? "text-destructive" : photo.ai_status === "approved" ? "text-emerald-700" : "text-muted-foreground"}`}
                        >
                          {photoStatuses[photo.ai_status] || "Sem avaliação"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-secondary p-8 text-center text-sm">
                    Anúncio sem fotos
                  </div>
                )}
                <Link
                  to="/app/admin/empresas/$id"
                  params={{ id: row.empresa_id }}
                  className="mt-4 block font-bold text-primary underline"
                >
                  {row.empresas.nome_empresa || "Empresa sem nome"}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.empresas.cidade || "Cidade não informada"} /{" "}
                  {row.empresas.estado || "UF não informada"}
                </p>
                <p className="mt-2 text-xs">
                  Publicado em {new Date(row.created_at).toLocaleString("pt-BR")}
                </p>
                {row.fabricante && (
                  <p className="mt-1 text-xs text-muted-foreground">{row.fabricante}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/app/material/$id" params={{ id: row.id }} className={button}>
                    Ver anúncio
                  </Link>
                  <Link
                    to="/app/admin/moderacao-fotos"
                    search={{ material: row.id }}
                    className={button}
                  >
                    Revisar fotos
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {ads.hasNextPage && (
        <button
          className={`${button} w-full`}
          disabled={ads.isFetching}
          onClick={() => void ads.fetchNextPage()}
        >
          {ads.isFetchingNextPage ? "Carregando…" : "Carregar mais anúncios"}
        </button>
      )}
      <Dialog
        open={!!zoom}
        onOpenChange={(open) => {
          if (!open) setZoom(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>{zoom?.title || "Foto do anúncio"}</DialogTitle>
          <DialogDescription>
            Confira a foto em tamanho ampliado. Use “Revisar fotos” no anúncio para aprovar ou
            rejeitar.
          </DialogDescription>
          {fullPhoto.isPending ? (
            <p>Carregando foto…</p>
          ) : fullPhoto.error ? (
            <p role="alert">{fullPhoto.error.message}</p>
          ) : (
            <img
              src={fullPhoto.data}
              alt={zoom?.title || "Foto ampliada"}
              className="max-h-[65dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function Preview({ src, label }: { src?: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt={label}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-square w-full object-cover"
    />
  ) : (
    <div className="grid aspect-square place-content-center gap-2 p-2 text-center text-xs text-muted-foreground">
      <ImageOff className="mx-auto" size={22} />
      Prévia indisponível · toque para abrir
    </div>
  );
}
