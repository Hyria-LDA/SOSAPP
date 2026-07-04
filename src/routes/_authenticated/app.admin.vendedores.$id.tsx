import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/vendedores/$id")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: VendedorDetail,
});

function VendedorDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>(null);

  const { data } = useQuery({
    queryKey: ["admin-vendedor", id],
    queryFn: async () => {
      const { data: v } = await supabase
        .from("vendedores_parceiros" as any)
        .select("*")
        .eq("id", id)
        .single();
      const [m, inds] = await Promise.all([
        supabase.rpc("vendedor_metrics" as any, { _vendedor_id: id }),
        supabase
          .from("indicacoes" as any)
          .select("*, empresas(nome_empresa, cidade, estado)")
          .eq("vendedor_id", id)
          .order("created_at", { ascending: false }),
      ]);
      // count anúncios por empresa
      const empresaIds = (inds.data as any[] ?? []).map((i: any) => i.empresa_id);
      const counts: Record<string, number> = {};
      if (empresaIds.length) {
        const { data: mats } = await supabase
          .from("materiais")
          .select("empresa_id")
          .in("empresa_id", empresaIds)
          .eq("status", "ativo");
        (mats ?? []).forEach((r: any) => {
          counts[r.empresa_id] = (counts[r.empresa_id] ?? 0) + 1;
        });
      }
      return { vendedor: v as any, metrics: m.data as any, indicacoes: (inds.data as any[]) ?? [], counts };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase
        .from("vendedores_parceiros" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vendedor", id] });
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      toast.success("Salvo");
      setEditing(false);
    },
  });

  const togglePaga = useMutation({
    mutationFn: async ({ indId, paga }: { indId: string; paga: boolean }) => {
      await supabase
        .from("indicacoes" as any)
        .update({ paga, paga_em: paga ? new Date().toISOString() : null })
        .eq("id", indId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendedor", id] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ indId, status }: { indId: string; status: string }) => {
      await supabase.from("indicacoes" as any).update({ status }).eq("id", indId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendedor", id] }),
  });

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  const v = data.vendedor;
  const current = form ?? v;
  const m = data.metrics ?? {};

  const exportCSV = () => {
    const rows = [
      ["Empresa", "Cidade", "Data", "Anúncios", "Status", "Comissão", "Pago"],
      ...data.indicacoes.map((i: any) => [
        i.empresas?.nome_empresa || "",
        `${i.empresas?.cidade || ""}/${i.empresas?.estado || ""}`,
        new Date(i.created_at).toLocaleDateString("pt-BR"),
        String(data.counts[i.empresa_id] ?? 0),
        i.status,
        Number(i.comissao_valor).toFixed(2),
        i.paga ? "Sim" : "Não",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indicacoes-${v.codigo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link
          to="/app/admin/vendedores"
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-xl font-black">{v.nome}</h1>
      </header>

      <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Dados</h2>
          {!editing ? (
            <button
              onClick={() => {
                setEditing(true);
                setForm(v);
              }}
              className="text-xs font-semibold text-primary"
            >
              Editar
            </button>
          ) : (
            <button
              onClick={() =>
                save.mutate({
                  nome: current.nome,
                  email: current.email,
                  telefone: current.telefone,
                  codigo: current.codigo,
                  comissao_valor: Number(current.comissao_valor),
                  ativo: current.ativo,
                })
              }
              className="flex items-center gap-1 text-xs font-semibold text-accent"
            >
              <Save className="h-3 w-3" /> Salvar
            </button>
          )}
        </div>
        <div className="mt-2 space-y-2 text-sm">
          {(["nome", "email", "telefone", "codigo"] as const).map((k) => (
            <Row
              key={k}
              label={k}
              value={current[k]}
              editing={editing}
              onChange={(val) => setForm({ ...current, [k]: val })}
            />
          ))}
          <Row
            label="comissao_valor (R$)"
            value={current.comissao_valor}
            editing={editing}
            type="number"
            onChange={(val) => setForm({ ...current, comissao_valor: val })}
          />
          {editing && (
            <label className="flex items-center gap-2 pt-2 text-sm">
              <input
                type="checkbox"
                checked={!!current.ativo}
                onChange={(e) => setForm({ ...current, ativo: e.target.checked })}
              />
              Ativo
            </label>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <MiniBig label="Cliques" value={m.cliques ?? 0} />
        <MiniBig label="Cadastros" value={m.cadastros ?? 0} />
        <MiniBig label="Aprovados" value={m.aprovados ?? 0} />
        <MiniBig label="Premiums ativos" value={m.premiums_ativos ?? 0} />
        <MiniBig label="Total devido" value={`R$ ${fmt(m.valor_total)}`} />
        <MiniBig label="A pagar" value={`R$ ${fmt(m.valor_pendente)}`} accent />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-sm font-bold">Indicações</h2>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {data.indicacoes.map((i: any) => (
          <div key={i.id} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{i.empresas?.nome_empresa || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {i.empresas?.cidade}/{i.empresas?.estado} ·{" "}
                  {new Date(i.created_at).toLocaleDateString("pt-BR")} ·{" "}
                  {data.counts[i.empresa_id] ?? 0} anúncios
                </div>
              </div>
              <select
                value={i.status}
                onChange={(e) => updateStatus.mutate({ indId: i.id, status: e.target.value })}
                className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-[11px] font-bold"
              >
                <option value="cadastrada">🟡 Cadastrada</option>
                <option value="aprovada">🟢 Aprovada</option>
                <option value="cancelada">🔴 Cancelada</option>
                <option value="expirada">⚫ Expirada</option>
              </select>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>
                Comissão: <b>R$ {fmt(i.comissao_valor)}</b>
              </span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={i.paga}
                  onChange={(e) => togglePaga.mutate({ indId: i.id, paga: e.target.checked })}
                />
                Pago
              </label>
            </div>
          </div>
        ))}
        {data.indicacoes.length === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            Sem indicações.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  editing,
  type = "text",
  onChange,
}: {
  label: string;
  value: any;
  editing: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="border-t border-border py-2 first:border-0">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      {editing ? (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
        />
      ) : (
        <div className="font-medium">{value || "—"}</div>
      )}
    </div>
  );
}

function MiniBig({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 shadow-card ${accent ? "bg-accent text-accent-foreground" : "bg-card"}`}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

function fmt(n: any) {
  return Number(n ?? 0).toFixed(2).replace(".", ",");
}
