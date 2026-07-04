import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Download, MapPin, Building2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/empresas/")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminEmpresas,
});

function AdminEmpresas() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["admin-empresas-full"],
    queryFn: async () => {
      const { data: empresas } = await supabase
        .from("empresas")
        .select("*")
        .order("created_at", { ascending: false });

      const ids = (empresas ?? []).map((e: any) => e.id);
      const counts: Record<string, { ativos: number; total: number }> = {};
      if (ids.length) {
        const { data: mats } = await supabase
          .from("materiais")
          .select("empresa_id,status")
          .in("empresa_id", ids);
        (mats ?? []).forEach((m: any) => {
          const c = (counts[m.empresa_id] ??= { ativos: 0, total: 0 });
          c.total++;
          if (m.status === "ativo") c.ativos++;
        });
      }
      return { empresas: empresas ?? [], counts };
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.empresas ?? []).filter((e: any) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
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
      ]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term));
    });
  }, [data, q, statusFilter]);

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

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/app/admin"
            className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-xl font-black">Empresas cadastradas</h1>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </header>

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-card">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar empresa, responsável, cidade…"
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

      <div className="mt-2 text-[11px] text-muted-foreground">{filtered.length} resultado(s)</div>

      <div className="mt-2 space-y-2">
        {filtered.map((e: any) => {
          const c = data?.counts[e.id] ?? { ativos: 0, total: 0 };
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
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge(e.status)}`}
                  >
                    {e.status}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{e.responsavel || "—"}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[e.cidade, e.estado].filter(Boolean).join("/") || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {c.ativos} ativos · {c.total} total
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Plano: <b>{e.plano || "—"}</b>
                  </span>
                  {e.plano_vencimento && (
                    <span>Venc: {new Date(e.plano_vencimento).toLocaleDateString("pt-BR")}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {!filtered.length && (
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
