import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { planColor, planEmoji } from "@/hooks/use-plan-status";

type Plano = {
  id: string;
  slug: string | null;
  nome: string;
  preco: number;
  duracao_dias: number;
  ativo: boolean;
  cor: string;
  ordem: number;
  descricao: string | null;
  max_anuncios: number;
  max_buscas: number;
  max_alertas: number;
  max_fotos: number;
  recursos: string[];
};

export const Route = createFileRoute("/_authenticated/app/admin/planos")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminPlanos,
});

function AdminPlanos() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plano | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: planos } = useQuery({
    queryKey: ["admin-planos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("planos").select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Plano[];
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("planos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-planos"] }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-planos"] });
      toast.success("Plano removido");
    },
    onError: (e: any) => toast.error(e.message ?? "Não foi possível remover"),
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">💎 Planos</h1>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </header>

      <p className="mt-2 text-xs text-muted-foreground">
        Configure limites, preços e validade. Use <strong>-1</strong> para ilimitado.
      </p>

      <div className="mt-5 space-y-3">
        {(planos ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${planColor(p.cor)}`}
                  >
                    {planEmoji(p.slug ?? "")} {p.nome}
                  </span>
                  <button
                    onClick={() => toggleAtivo.mutate({ id: p.id, ativo: !p.ativo })}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.ativo ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}
                  >
                    {p.ativo ? "🟢 Ativo" : "🔴 Inativo"}
                  </button>
                </div>
                {p.descricao && <p className="mt-1 text-xs text-muted-foreground">{p.descricao}</p>}
              </div>
              <div className="text-right">
                <div className="text-base font-black">
                  {p.preco > 0 ? `R$ ${Number(p.preco).toFixed(2).replace(".", ",")}` : "Grátis"}
                </div>
                <div className="text-[10px] text-muted-foreground">{p.duracao_dias} dias</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <Pill label="📦 Anúncios" value={p.max_anuncios === -1 ? "∞" : p.max_anuncios} />
              <Pill label="🔍 Pedidos" value={p.max_buscas === -1 ? "∞" : p.max_buscas} />
              <Pill label="🔔 Alertas" value={p.max_alertas === -1 ? "∞" : p.max_alertas} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <button
                onClick={() => setEditing(p)}
                className="rounded-lg bg-secondary px-3 py-1.5 font-semibold"
              >
                Editar
              </button>
              <button
                onClick={() => {
                  if (confirm(`Remover plano ${p.nome}?`)) remover.mutate(p.id);
                }}
                className="rounded-lg bg-destructive/10 px-3 py-1.5 font-semibold text-destructive"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <PlanoForm
          plano={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-planos"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-secondary px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function PlanoForm({
  plano,
  onClose,
  onSaved,
}: {
  plano: Plano | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [slug, setSlug] = useState(plano?.slug ?? "");
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [cor, setCor] = useState(plano?.cor ?? "blue");
  const [preco, setPreco] = useState(plano?.preco?.toString() ?? "0");
  const [duracao, setDuracao] = useState(plano?.duracao_dias?.toString() ?? "30");
  const [ordem, setOrdem] = useState(plano?.ordem ?? 0);
  const [ativo, setAtivo] = useState(plano?.ativo ?? true);
  const [maxAnuncios, setMaxAnuncios] = useState(plano?.max_anuncios ?? 10);
  const [maxBuscas, setMaxBuscas] = useState(plano?.max_buscas ?? 1);
  const [maxAlertas, setMaxAlertas] = useState(plano?.max_alertas ?? 1);
  const [maxFotos, setMaxFotos] = useState(plano?.max_fotos ?? 3);
  const [recursos, setRecursos] = useState((plano?.recursos ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        slug: slug.trim() || null,
        descricao: descricao.trim() || null,
        cor,
        preco: Number(preco) || 0,
        duracao_dias: Number(duracao) || 30,
        ordem: Number(ordem) || 0,
        ativo,
        max_anuncios: Number(maxAnuncios),
        max_buscas: Number(maxBuscas),
        max_alertas: Number(maxAlertas),
        max_fotos: Number(maxFotos),
        recursos: recursos
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      };
      if (plano) {
        const { error } = await supabase.from("planos").update(payload).eq("id", plano.id);
        if (error) throw error;
        toast.success("Plano atualizado");
      } else {
        const { error } = await supabase.from("planos").insert(payload);
        if (error) throw error;
        toast.success("Plano criado");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-background pt-2 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-base font-black">{plano ? "Editar Plano" : "Novo Plano"}</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome *">
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inp} />
            </Field>
            <Field label="Slug (interno)">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ex: tx"
                className={inp}
              />
            </Field>
          </div>
          <Field label="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço (R$)">
              <input
                type="number"
                step="0.01"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className={inp}
              />
            </Field>
            <Field label="Duração (dias)">
              <input
                type="number"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                className={inp}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cor">
              <select value={cor} onChange={(e) => setCor(e.target.value)} className={inp}>
                <option value="gray">Cinza (Free)</option>
                <option value="blue">Azul (TX)</option>
                <option value="purple">Roxo (Ultra)</option>
                <option value="yellow">Amarelo (Brilhante)</option>
                <option value="orange">Laranja</option>
              </select>
            </Field>
            <Field label="Ordem">
              <input
                type="number"
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value) || 0)}
                className={inp}
              />
            </Field>
            <Field label="Status">
              <button
                type="button"
                onClick={() => setAtivo(!ativo)}
                className={`h-10 w-full rounded-xl px-3 text-sm font-bold ${ativo ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground"}`}
              >
                {ativo ? "🟢 Ativo" : "🔴 Inativo"}
              </button>
            </Field>
          </div>

          <div className="rounded-xl bg-secondary/50 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Limites · use -1 para ilimitado
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="📦 Anúncios">
                <input
                  type="number"
                  value={maxAnuncios}
                  onChange={(e) => setMaxAnuncios(Number(e.target.value))}
                  className={inp}
                />
              </Field>
              <Field label="🔍 Pedidos/mês">
                <input
                  type="number"
                  value={maxBuscas}
                  onChange={(e) => setMaxBuscas(Number(e.target.value))}
                  className={inp}
                />
              </Field>
              <Field label="🔔 Alertas">
                <input
                  type="number"
                  value={maxAlertas}
                  onChange={(e) => setMaxAlertas(Number(e.target.value))}
                  className={inp}
                />
              </Field>
              <Field label="📷 Fotos/anúncio">
                <input
                  type="number"
                  value={maxFotos}
                  onChange={(e) => setMaxFotos(Number(e.target.value))}
                  className={inp}
                />
              </Field>
            </div>
          </div>

          <Field label="Recursos extras (uma linha cada)">
            <textarea
              value={recursos}
              onChange={(e) => setRecursos(e.target.value)}
              rows={4}
              placeholder="Painel de estatísticas&#10;Prioridade no suporte"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="h-12 flex-1 rounded-xl bg-secondary text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const inp =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary";
