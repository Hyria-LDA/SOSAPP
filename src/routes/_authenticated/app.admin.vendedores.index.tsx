import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/vendedores/")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminVendedores,
});

function AdminVendedores() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-vendedores"],
    queryFn: async () => {
      const { data: vs } = await supabase
        .from("vendedores_parceiros" as any)
        .select("*")
        .order("created_at", { ascending: false });
      const list = (vs as any[]) ?? [];
      const enriched = await Promise.all(
        list.map(async (v) => {
          const { data: m } = await supabase.rpc("vendedor_metrics" as any, { _vendedor_id: v.id });
          return { ...v, metrics: m as any };
        }),
      );
      return enriched;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      await supabase.from("vendedores_parceiros" as any).update({ ativo }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      toast.success("Atualizado");
    },
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">🤝 Vendedores Parceiros</h1>
        <button
          onClick={() => setShowNew(true)}
          className="ml-auto flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </header>

      <div className="mt-4 space-y-2">
        {(data ?? []).map((v: any) => (
          <Link
            key={v.id}
            to="/app/admin/vendedores/$id"
            params={{ id: v.id }}
            className="block rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{v.nome}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {v.email} · código <b>{v.codigo}</b>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  toggle.mutate({ id: v.id, ativo: !v.ativo });
                }}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${v.ativo ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}
              >
                {v.ativo ? "ATIVO" : "INATIVO"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
              <Mini value={v.metrics?.cliques ?? 0} label="Cliques" />
              <Mini value={v.metrics?.cadastros ?? 0} label="Cadastros" />
              <Mini value={v.metrics?.aprovados ?? 0} label="Aprovados" />
              <Mini value={`R$ ${Number(v.metrics?.valor_pendente ?? 0).toFixed(0)}`} label="A pagar" />
            </div>
          </Link>
        ))}
        {data?.length === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum vendedor parceiro cadastrado.
          </div>
        )}
      </div>

      {showNew && <NovoVendedorModal onClose={() => setShowNew(false)} qc={qc} />}
    </div>
  );
}

function Mini({ value, label }: { value: any; label: string }) {
  return (
    <div className="rounded-xl bg-secondary p-2">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function NovoVendedorModal({ onClose, qc }: { onClose: () => void; qc: any }) {
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    senha: "",
    codigo: "",
    comissao_valor: "50",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.email || !form.senha || !form.codigo) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      // 1. cria usuário via signUp
      const { data: signUp, error: sErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.senha,
        options: { data: { full_name: form.nome } },
      });
      if (sErr) throw sErr;
      const uid = signUp.user?.id;
      if (!uid) throw new Error("Falha ao criar usuário");

      // 2. cria registro de vendedor parceiro
      const { error: vErr } = await supabase.from("vendedores_parceiros" as any).insert({
        user_id: uid,
        nome: form.nome,
        email: form.email,
        telefone: form.telefone || null,
        codigo: form.codigo.toUpperCase().replace(/\s/g, ""),
        comissao_valor: Number(form.comissao_valor) || 0,
      });
      if (vErr) throw vErr;

      // 3. atribui role 'vendedor'
      await supabase.from("user_roles").insert({ user_id: uid, role: "vendedor" as any });

      toast.success("Vendedor criado!");
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar vendedor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40" onClick={onClose}>
      <div className="rounded-t-3xl bg-background p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Novo vendedor parceiro</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input label="Nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <Input label="E-mail *" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          <Input label="Senha *" value={form.senha} onChange={(v) => setForm({ ...form, senha: v })} type="password" />
          <Input label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
          <Input
            label="Código do link *"
            value={form.codigo}
            onChange={(v) => setForm({ ...form, codigo: v.toUpperCase() })}
            placeholder="JOAO123"
          />
          <Input
            label="Comissão por indicação aprovada (R$)"
            value={form.comissao_valor}
            onChange={(v) => setForm({ ...form, comissao_valor: v })}
            type="number"
          />
          <button
            disabled={saving}
            className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Criando…" : "Criar vendedor"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none ring-primary/30 focus:ring-2"
      />
    </label>
  );
}

