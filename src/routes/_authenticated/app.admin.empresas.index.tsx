import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Download, MapPin, Building2, Package, Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadCompanyMaterialCounts } from "@/lib/admin-company-material-counts";
import { normalizeCity } from "@/lib/banner-regions";

export const Route = createFileRoute("/_authenticated/app/admin/empresas/")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
    return { adminId: u.user.id };
  },
  component: AdminEmpresas,
});

function AdminEmpresas() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const { adminId } = Route.useRouteContext();
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["admin-empresas-full", adminId],
    queryFn: async ({ signal }) => {
      const empresas = [];
      let cursor: string | undefined;
      for (;;) {
        let query = supabase.from("empresas").select("*").order("id").limit(500);
        if (cursor) query = query.gt("id", cursor);
        const { data: page, error } = await query.abortSignal(signal);
        if (error) throw error;
        if (!page?.length) break;
        empresas.push(...page);
        cursor = page[page.length - 1].id;
      }
      empresas.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { empresas };
    },
  });
  const counts = useQuery({
    queryKey: ["admin-company-material-counts", adminId],
    queryFn: ({ signal }) => loadCompanyMaterialCounts(supabase, signal),
    enabled: !!data,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const { data: originData, isError: originError, isPending: originsLoading } = useQuery({
    queryKey: ["admin-cadastro-origens", data?.empresas.map((e) => e.id)],
    enabled: !!data,
    queryFn: async () => {
      const ids = (data?.empresas ?? []).filter((e) => e.status === "pendente").map((e) => e.id);
      if (!ids.length) return { origins: new Map<string, { codigo: string; nome: string | null }>(), partners: new Map<string, string>() };
      const [originsResult, partnersResult] = await Promise.all([
        supabase.from("cadastro_origens" as any)
          .select("empresa_id, codigo, vendedores_parceiros(nome)").in("empresa_id", ids),
        supabase.from("vendedores_parceiros").select("codigo, nome"),
      ]);
      if (originsResult.error) throw originsResult.error;
      if (partnersResult.error) throw partnersResult.error;
      const origins = new Map<string, { codigo: string; nome: string | null }>();
      for (const row of (originsResult.data ?? []) as unknown as { empresa_id: string; codigo: string; vendedores_parceiros: { nome: string } | null }[]) {
        origins.set(row.empresa_id, { codigo: row.codigo, nome: row.vendedores_parceiros?.nome ?? null });
      }
      const partners = new Map((partnersResult.data ?? []).map((v) => [v.codigo.toUpperCase(), v.nome]));
      return { origins, partners };
    },
  });

  const regionOptions = useMemo(() => {
    const states = new Set<string>();
    const cities = new Map<string, string>();
    let missingState = false;
    let missingCity = false;
    for (const e of data?.empresas ?? []) {
      const uf = (e.estado ?? "").trim().toUpperCase();
      if (uf) states.add(uf); else missingState = true;
      if (stateFilter !== "all" && (stateFilter === "missing" ? !!uf : uf !== stateFilter)) continue;
      const city = (e.cidade ?? "").trim().replace(/\s+/g, " ");
      if (!city) { missingCity = true; continue; }
      const key = JSON.stringify([uf, normalizeCity(city)]);
      if (!cities.has(key)) cities.set(key, `${city} / ${uf || "UF não informada"}`);
    }
    return {
      states: [...states].sort((a,b) => a.localeCompare(b, "pt-BR")),
      cities: [...cities.entries()].sort((a,b) => a[1].localeCompare(b[1], "pt-BR")),
      missingState, missingCity,
    };
  }, [data, stateFilter]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.empresas ?? []).filter((e: any) => {
      const uf = String(e.estado ?? "").trim().toUpperCase();
      if (stateFilter !== "all" && (stateFilter === "missing" ? !!uf : uf !== stateFilter)) return false;
      const city = normalizeCity(e.cidade);
      if (cityFilter !== "all" && (cityFilter === "missing" ? !!city : JSON.stringify([uf, city]) !== cityFilter)) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (planFilter !== "all" && planKey(e.plano) !== planFilter) {
        return false;
      }
      if (!term) return true;
      return [
        e.nome_empresa,
        e.responsavel,
        e.email,
        e.whatsapp,
        e.telefone,
        e.cidade,
        e.estado,
        e.bairro,
        e.numero_sorte,
      ]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term));
    });
  }, [data, q, statusFilter, planFilter, stateFilter, cityFilter]);

  const exportCsv = () => {
    const rows = filtered;
    if (!rows.length) return;
    const cols = [
      "nome_empresa",
      "responsavel",
      "email",
      "whatsapp",
      "telefone",
      "endereco",
      "numero",
      "bairro",
      "cidade",
      "estado",
      "cep",
      "latitude",
      "longitude",
      "status",
      "numero_sorte",
      "plano",
      "plano_vencimento",
      "avaliacao",
      "total_negociacoes",
      "created_at",
    ];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      cols.join(","),
      ...rows.map((r: any) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empresas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyLuckyNumbers = async () => {
    const numbers = filtered
      .map((empresa: any) => empresa.numero_sorte)
      .filter((numero: unknown) => numero != null)
      .join("\n");
    if (!numbers) {
      toast.error("Nenhum número da sorte encontrado neste filtro.");
      return;
    }

    try {
      await navigator.clipboard.writeText(numbers);
      toast.success(`${filtered.length} número(s) copiado(s), um por linha.`);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = numbers;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (copied) {
        toast.success(`${filtered.length} número(s) copiado(s), um por linha.`);
      } else {
        toast.error("Não foi possível copiar. Use o arquivo CSV.");
      }
    }
  };

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/app/admin"
            className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-xl font-black">Empresas cadastradas</h1>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={copyLuckyNumbers}
          className="flex h-10 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
        >
          <Copy className="h-4 w-4" /> Copiar números
        </button>
        <button
          onClick={exportCsv}
          className="flex h-10 items-center justify-center gap-1 rounded-xl bg-secondary px-3 text-xs font-bold"
        >
          <Download className="h-4 w-4" /> Baixar CSV
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa ou número da sorte…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto text-[11px]">
        {[
          ["all", "Todas"],
          ["ativa", "Ativas"],
          ["pendente", "Pendentes"],
          ["suspensa", "Suspensas"],
          ["bloqueada", "Bloqueadas"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={`shrink-0 rounded-full px-3 py-1.5 font-semibold ${statusFilter === v ? "bg-foreground text-background" : "bg-secondary"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
          Filtrar por plano
        </span>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none"
        >
          <option value="all">Todos os planos</option>
          <option value="free">Free</option>
          <option value="ultra">Brilhante</option>
        </select>
      </label>

      <fieldset className="mt-3">
        <legend className="mb-1 text-[11px] font-semibold text-muted-foreground">Filtrar por região</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">
            Estado
            <select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setCityFilter("all"); }} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
              <option value="all">Todos os estados</option>
              {regionOptions.states.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              {regionOptions.missingState && <option value="missing">Estado não informado</option>}
            </select>
          </label>
          <label className="min-w-0 text-[11px] font-semibold text-muted-foreground">
            Cidade
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none">
              <option value="all">Todas as cidades</option>
              {regionOptions.cities.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
              {regionOptions.missingCity && <option value="missing">Cidade não informada</option>}
            </select>
          </label>
        </div>
        {(stateFilter !== "all" || cityFilter !== "all") && <button type="button" onClick={() => { setStateFilter("all"); setCityFilter("all"); }} className="mt-2 text-xs font-semibold text-primary underline">Limpar região</button>}
      </fieldset>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{filtered.length} resultado(s)</span>
        <button type="button" disabled={isFetching || counts.isFetching} onClick={() => { void refetch(); void counts.refetch(); }} className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-bold disabled:opacity-50">
          <RefreshCw className="h-3 w-3" /> {isFetching || counts.isFetching ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      {isPending && <p className="mt-3 text-sm">Carregando empresas…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível atualizar as empresas. Tente novamente em Atualizar.</p>}
      {counts.isError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível atualizar a contagem de sobras. Tente novamente em Atualizar.</p>}

      <div className="mt-2 space-y-2">
        {filtered.map((e: any) => {
          const c = counts.data?.[e.id] ?? { ativos: 0, total: 0 };
          const savedOrigin = originData?.origins.get(e.id);
          const originCode = savedOrigin?.codigo || e.ref_codigo_usado;
          const originName = savedOrigin?.nome || (originCode ? originData?.partners.get(originCode.toUpperCase()) : null);
          return (
            <Link
              key={e.id}
              to="/app/admin/empresas/$id"
              params={{ id: e.id }}
              className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-card hover:bg-secondary/40"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-bold">{e.nome_empresa || "—"}</div>
                  <div className="flex max-w-[55%] shrink-0 flex-col items-end gap-1 text-right">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge(e.status)}`}
                  >
                    {e.status}
                  </span>
                  {e.status === "pendente" && (
                    <div className="max-w-full break-words text-[11px] text-muted-foreground">
                      {originCode ? (
                        <><div className="font-semibold text-foreground">{originName || "Parceiro"}</div><div>Link: {originCode}</div></>
                      ) : originError ? "Origem indisponível" : originsLoading ? "Carregando origem…" : "Origem não identificada"}
                    </div>
                  )}
                  </div>
                </div>
                <div className="truncate text-xs text-muted-foreground">{e.responsavel || "—"}</div>
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs" aria-label="Sobras da empresa">
                  <Package className="h-4 w-4 shrink-0" />
                  {counts.isError ? <span>Contagem indisponível</span> : !counts.data ? <span>Carregando sobras…</span> : <div><div className="font-bold">{c.ativos} {c.ativos === 1 ? "sobra ativa" : "sobras ativas"}</div><div className="text-muted-foreground">{c.total} {c.total === 1 ? "anúncio cadastrado no total" : "anúncios cadastrados no total"}</div></div>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[e.cidade, e.estado].filter(Boolean).join("/") || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Plano: <b>{e.plano || "Free"}</b>
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-foreground">
                    Nº da sorte: {e.numero_sorte ?? "—"}
                  </span>
                  {e.plano_vencimento && (
                    <span>Venc: {new Date(e.plano_vencimento).toLocaleDateString("pt-BR")}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {!isPending && !error && !filtered.length && (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
            Nenhuma empresa encontrada.
          </div>
        )}
      </div>
    </div>
  );
}

function badge(s: string) {
  switch (s) {
    case "ativa":
      return "bg-accent text-accent-foreground";
    case "suspensa":
      return "bg-yellow-100 text-yellow-900";
    case "bloqueada":
      return "bg-destructive text-destructive-foreground";
    case "pendente":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-secondary";
  }
}

function planKey(value: unknown) {
  const plan = String(value || "free").trim().toLowerCase();
  if (plan === "brilhante") return "ultra";
  return plan;
}
