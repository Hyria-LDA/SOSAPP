import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Bot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signMateriaisPaths } from "@/lib/material-photos";

type AiStatus = "pending" | "approved" | "manual_review" | "rejected";

const FILTERS: { key: AiStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovadas" },
  { key: "rejected", label: "Rejeitadas" },
  { key: "manual_review", label: "Revisão manual" },
  { key: "all", label: "Todas" },
];

export const Route = createFileRoute("/_authenticated/app/admin/moderacao-fotos")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: ModeracaoFotos,
});

function ModeracaoFotos() {
  const [filter, setFilter] = useState<AiStatus | "all">("pending");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-moderacao-fotos", filter],
    queryFn: async () => {
      let q = supabase
        .from("fotos_materiais" as any)
        .select(
          "id, url, ordem, created_at, ai_status, ai_score, ai_reason, ai_provider, ai_category, reviewed_at, material_id, empresa_id, materiais(padrao, fabricante), empresas(nome_empresa, cidade, estado)",
        )
        .order("created_at", { ascending: false })
        .limit(120);
      if (filter !== "all") q = q.eq("ai_status", filter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const paths = rows.map((r) => r.url).filter(Boolean) as string[];
      const map = await signMateriaisPaths(paths);
      return rows.map((r) => ({ ...r, signed_url: r.url?.startsWith("http") ? r.url : map[r.url] ?? "" }));
    },
  });

  const counts = useQuery({
    queryKey: ["admin-moderacao-fotos-counts"],
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const s of ["pending", "approved", "rejected", "manual_review"] as const) {
        const { count } = await supabase
          .from("fotos_materiais" as any)
          .select("id", { count: "exact", head: true })
          .eq("ai_status", s);
        out[s] = count ?? 0;
      }
      return out;
    },
  });

  const moderar = useMutation({
    mutationFn: async ({ id, decisao, motivo }: { id: string; decisao: AiStatus; motivo?: string }) => {
      const { error } = await supabase.rpc("admin_moderar_foto" as any, {
        _foto_id: id,
        _decisao: decisao,
        _motivo: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-moderacao-fotos"] });
      qc.invalidateQueries({ queryKey: ["admin-moderacao-fotos-counts"] });
      toast.success("Foto atualizada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const list = useMemo(() => data ?? [], [data]);

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-black">🤖 Moderação de Fotos</h1>
          <p className="text-xs text-muted-foreground">
            Estrutura preparada para validação por IA · moderação manual ativa
          </p>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Card label="Pendentes" value={counts.data?.pending ?? "—"} />
        <Card label="Aprovadas" value={counts.data?.approved ?? "—"} />
        <Card label="Rejeitadas" value={counts.data?.rejected ?? "—"} />
        <Card label="Revisão" value={counts.data?.manual_review ?? "—"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma foto neste filtro.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {list.map((f: any) => (
            <div key={f.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="flex gap-3 p-3">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary">
                  {f.signed_url ? (
                    <img src={f.signed_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
                      sem preview
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusPill status={f.ai_status} />
                    {f.ai_provider && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">
                        <Bot className="h-3 w-3" /> {f.ai_provider}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 truncate text-sm font-bold">
                    {f.empresas?.nome_empresa ?? "—"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {f.materiais?.padrao ?? "Anúncio"} ·{" "}
                    {f.empresas?.cidade ? `${f.empresas.cidade}/${f.empresas.estado}` : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(f.created_at).toLocaleString("pt-BR")}
                    {f.ai_score != null && ` · score ${Number(f.ai_score).toFixed(2)}`}
                    {f.ai_category && ` · ${f.ai_category}`}
                  </div>
                  {f.ai_reason && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {f.ai_reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 border-t border-border bg-background/50 p-2">
                <Action
                  icon={CheckCircle2}
                  label="Aprovar"
                  tone="ok"
                  onClick={() =>
                    moderar.mutate({ id: f.id, decisao: "approved", motivo: "Aprovado manualmente" })
                  }
                />
                <Action
                  icon={AlertTriangle}
                  label="Revisão"
                  tone="warn"
                  onClick={() =>
                    moderar.mutate({
                      id: f.id,
                      decisao: "manual_review",
                      motivo: "Marcada para revisão manual",
                    })
                  }
                />
                <Action
                  icon={XCircle}
                  label="Rejeitar"
                  tone="bad"
                  onClick={() => {
                    const motivo = window.prompt("Motivo da rejeição (opcional)") || undefined;
                    moderar.mutate({ id: f.id, decisao: "rejected", motivo });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: AiStatus }) {
  const map: Record<AiStatus, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-muted text-foreground" },
    approved: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-600" },
    rejected: { label: "Rejeitada", cls: "bg-destructive/15 text-destructive" },
    manual_review: { label: "Revisão", cls: "bg-amber-500/15 text-amber-700" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${m.cls}`}>
      {m.label}
    </span>
  );
}

function Action({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: any;
  label: string;
  tone: "ok" | "warn" | "bad";
  onClick: () => void;
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-destructive/10 text-destructive";
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-bold active:scale-[0.98] ${cls}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
