import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/denuncias")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminDenuncias,
});

const CAT_LABEL: Record<string, string> = {
  foto_nao_corresponde: "📷 Foto não corresponde",
  indisponivel: "📦 Indisponível",
  preco_enganoso: "💰 Preço enganoso",
  medidas_incorretas: "📏 Medidas incorretas",
  proibido: "🚫 Material proibido",
  inadequado: "🔞 Conteúdo inadequado",
  spam: "🤖 Spam",
  empresa_falsa: "🏢 Empresa falsa",
  contato_invalido: "📞 Contato inválido",
  contato_falso: "📞 Contato falso",
  golpe: "💰 Golpe",
  material_inexistente: "🚫 Material inexistente",
  nao_entrega: "📦 Não entrega",
  outro: "❓ Outro motivo",
};

function AdminDenuncias() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pendente" | "confirmada" | "rejeitada" | "todas">(
    "pendente",
  );

  const { data } = useQuery({
    queryKey: ["admin-denuncias", filter],
    queryFn: async () => {
      let q = (supabase.from as any)("denuncias")
        .select("*, materiais(id, padrao, fabricante, status), empresas(id, nome_empresa, status, pontos_penalidade, advertencias)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "todas") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-denuncias-stats"],
    queryFn: async () => {
      const [tot, pend, conf, empSusp, empAdv] = await Promise.all([
        (supabase.from as any)("denuncias").select("id", { count: "exact", head: true }),
        (supabase.from as any)("denuncias").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        (supabase.from as any)("denuncias").select("id", { count: "exact", head: true }).eq("status", "confirmada"),
        supabase.from("empresas").select("id", { count: "exact", head: true }).eq("status", "suspensa"),
        (supabase.from as any)("empresas").select("id", { count: "exact", head: true }).gt("advertencias", 0),
      ]);
      const matSusp = await supabase
        .from("materiais")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspenso" as any);
      return {
        total: tot.count ?? 0,
        pendentes: pend.count ?? 0,
        confirmadas: conf.count ?? 0,
        anunSuspensos: matSusp.count ?? 0,
        empSuspensas: empSusp.count ?? 0,
        empAdvertidas: empAdv.count ?? 0,
      };
    },
  });

  const julgar = useMutation({
    mutationFn: async (args: { id: string; decisao: "confirmada" | "rejeitada" | "descartada" }) => {
      const { data, error } = await (supabase as any).rpc("admin_julgar_denuncia", {
        _denuncia_id: args.id,
        _decisao: args.decisao,
        _nota: null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "erro");
      return data;
    },
    onSuccess: (res) => {
      const acao = (res as any)?.acao;
      const msg =
        acao && acao !== "nenhuma" ? `Decisão registrada (${acao})` : "Decisão registrada";
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin-denuncias"] });
      qc.invalidateQueries({ queryKey: ["admin-denuncias-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const acaoAnuncio = useMutation({
    mutationFn: async (args: { materialId: string; acao: "reativar" | "suspender" | "excluir" }) => {
      const { data, error } = await (supabase as any).rpc("admin_acao_anuncio", {
        _material_id: args.materialId,
        _acao: args.acao,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "erro");
    },
    onSuccess: () => {
      toast.success("Anúncio atualizado");
      qc.invalidateQueries({ queryKey: ["admin-denuncias"] });
      qc.invalidateQueries({ queryKey: ["admin-denuncias-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const acaoEmpresa = useMutation({
    mutationFn: async (args: { empresaId: string; acao: "advertir" | "suspender" | "bloquear" | "reativar" }) => {
      const { data, error } = await (supabase as any).rpc("admin_acao_empresa", {
        _empresa_id: args.empresaId,
        _acao: args.acao,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "erro");
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      qc.invalidateQueries({ queryKey: ["admin-denuncias"] });
      qc.invalidateQueries({ queryKey: ["admin-denuncias-stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">🚩 Denúncias</h1>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={stats?.total ?? "—"} />
        <Stat label="Pendentes" value={stats?.pendentes ?? "—"} accent />
        <Stat label="Confirmadas" value={stats?.confirmadas ?? "—"} />
        <Stat label="Anúncios suspensos" value={stats?.anunSuspensos ?? "—"} />
        <Stat label="Empresas suspensas" value={stats?.empSuspensas ?? "—"} />
        <Stat label="Empresas advertidas" value={stats?.empAdvertidas ?? "—"} />
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto">
        {(["pendente", "confirmada", "rejeitada", "todas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {(data ?? []).map((d) => (
          <div key={d.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                  <Flag className="h-3 w-3" />
                  {d.target_type === "anuncio" ? "Anúncio" : "Empresa"} ·{" "}
                  {CAT_LABEL[d.categoria] ?? d.categoria}
                </div>
                {d.target_type === "anuncio" && d.materiais && (
                  <Link
                    to="/app/material/$id"
                    params={{ id: d.materiais.id }}
                    className="mt-1 block truncate text-sm font-bold underline"
                  >
                    {d.materiais.padrao} · {d.materiais.fabricante ?? "—"} ({d.materiais.status})
                  </Link>
                )}
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  🏢 {d.empresas?.nome_empresa ?? "—"} · {d.empresas?.pontos_penalidade ?? 0} pts ·{" "}
                  {d.empresas?.advertencias ?? 0} adv
                </div>
                {d.observacao && (
                  <p className="mt-2 rounded-xl bg-secondary p-2 text-xs">{d.observacao}</p>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(d.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  d.status === "pendente"
                    ? "bg-yellow-100 text-yellow-900"
                    : d.status === "confirmada"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary"
                }`}
              >
                {d.status}
              </span>
            </div>

            {d.status === "pendente" && (
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Btn onClick={() => julgar.mutate({ id: d.id, decisao: "confirmada" })}>
                  ✅ Confirmar (+1 pt)
                </Btn>
                <Btn onClick={() => julgar.mutate({ id: d.id, decisao: "rejeitada" })}>
                  ✖️ Rejeitar
                </Btn>
                <Btn onClick={() => julgar.mutate({ id: d.id, decisao: "descartada" })}>
                  Descartar
                </Btn>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2 text-[11px]">
              {d.material_id && (
                <>
                  <Btn onClick={() => acaoAnuncio.mutate({ materialId: d.material_id, acao: "reativar" })}>
                    ↻ Reativar anúncio
                  </Btn>
                  <Btn onClick={() => acaoAnuncio.mutate({ materialId: d.material_id, acao: "suspender" })}>
                    ⛔ Suspender
                  </Btn>
                  <Btn
                    danger
                    onClick={() => {
                      if (confirm("Excluir anúncio definitivamente?"))
                        acaoAnuncio.mutate({ materialId: d.material_id, acao: "excluir" });
                    }}
                  >
                    🗑️ Excluir
                  </Btn>
                </>
              )}
              {d.empresa_id && (
                <>
                  <Btn onClick={() => acaoEmpresa.mutate({ empresaId: d.empresa_id, acao: "advertir" })}>
                    ⚠️ Advertir
                  </Btn>
                  <Btn onClick={() => acaoEmpresa.mutate({ empresaId: d.empresa_id, acao: "suspender" })}>
                    ⛔ Suspender empresa
                  </Btn>
                  <Btn danger onClick={() => acaoEmpresa.mutate({ empresaId: d.empresa_id, acao: "bloquear" })}>
                    🚫 Bloquear
                  </Btn>
                </>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma denúncia.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-3 shadow-card ${accent ? "bg-accent text-accent-foreground" : "bg-card"}`}
    >
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  danger,
}: {
  children: any;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-semibold ${
        danger ? "bg-destructive text-destructive-foreground" : "bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
