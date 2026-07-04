import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MessageCircle,
  MapPin,
  Building2,
  Edit3,
  CheckCircle2,
  PauseCircle,
  Ban,
  RefreshCw,
  Save,
  Plus,
  History,
  Eye,
  Package,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/admin/empresas/$id")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: EmpresaDetail,
});

const FORMAS_PAGAMENTO = ["PIX", "Transferência", "Cartão", "Dinheiro", "Outro"];

function EmpresaDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-empresa", id],
    queryFn: async () => {
      const [
        { data: empresa },
        { data: planos },
        { data: financeiro },
        { data: historico },
        { data: materiais },
      ] = await Promise.all([
        supabase.from("empresas").select("*").eq("id", id).maybeSingle(),
        supabase.from("planos").select("*").eq("ativo", true).order("preco"),
        supabase
          .from("financeiro")
          .select("*")
          .eq("empresa_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("empresa_historico")
          .select("*")
          .eq("empresa_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("materiais").select("id,status").eq("empresa_id", id),
      ]);

      let views = 0;
      let contatos = 0;
      const matIds = (materiais ?? []).map((m: any) => m.id);
      if (matIds.length) {
        const [{ count: v }, { count: c }] = await Promise.all([
          supabase
            .from("material_views")
            .select("id", { count: "exact", head: true })
            .in("material_id", matIds),
          supabase
            .from("material_contatos")
            .select("id", { count: "exact", head: true })
            .in("material_id", matIds),
        ]);
        views = v ?? 0;
        contatos = c ?? 0;
      }

      return {
        empresa,
        planos: planos ?? [],
        financeiro: financeiro ?? [],
        historico: historico ?? [],
        materiais: materiais ?? [],
        views,
        contatos,
      };
    },
  });

  const e = data?.empresa;
  const counts = useMemo(() => {
    const out = { ativos: 0, vendidos: 0, pausados: 0, total: 0 };
    (data?.materiais ?? []).forEach((m: any) => {
      out.total++;
      if (m.status === "ativo") out.ativos++;
      else if (m.status === "vendido") out.vendidos++;
      else if (m.status === "pausado") out.pausados++;
    });
    return out;
  }, [data]);

  const [obs, setObs] = useState("");
  useEffect(() => {
    setObs(e?.observacoes_admin ?? "");
  }, [e?.observacoes_admin]);

  const [showFin, setShowFin] = useState(false);
  const [finForm, setFinForm] = useState({
    valor: "",
    forma: "PIX",
    pagamento: new Date().toISOString().slice(0, 10),
    vencimento: "",
    status: "pago",
    obs: "",
    plano_id: "",
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!e)
    return (
      <div className="p-6 text-sm">
        Empresa não encontrada.{" "}
        <Link to="/app/admin/empresas" className="underline">
          Voltar
        </Link>
      </div>
    );

  const logHistorico = async (tipo: string, descricao: string) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase
      .from("empresa_historico")
      .insert({ empresa_id: id, tipo, descricao, autor_id: u.user?.id });
  };

  const reload = () => qc.invalidateQueries({ queryKey: ["admin-empresa", id] });

  const updateEmpresa = async (
    patch: Record<string, any>,
    hist?: { tipo: string; descricao: string },
  ) => {
    const { error } = await supabase
      .from("empresas")
      .update(patch as any)
      .eq("id", id);
    if (error) return toast.error(error.message);
    if (hist) await logHistorico(hist.tipo, hist.descricao);
    toast.success("Atualizado");
    reload();
  };

  const setStatus = (status: string, label: string) =>
    updateEmpresa({ status }, { tipo: "status", descricao: `Status alterado para ${label}` });

  const setPlano = (planoId: string, planoNome: string) =>
    updateEmpresa(
      { plano_id: planoId, plano: planoNome },
      { tipo: "plano", descricao: `Plano alterado de ${e.plano || "—"} para ${planoNome}` },
    );

  const renovar = async (dias: number) => {
    const base =
      e.plano_vencimento && new Date(e.plano_vencimento) > new Date()
        ? new Date(e.plano_vencimento)
        : new Date();
    base.setDate(base.getDate() + dias);
    const novoVenc = base.toISOString();
    const inicio = e.plano_inicio ?? new Date().toISOString();
    await updateEmpresa(
      { plano_vencimento: novoVenc, plano_inicio: inicio, status: "ativa" },
      {
        tipo: "renovacao",
        descricao: `Renovado por ${dias} dias (vence em ${new Date(novoVenc).toLocaleDateString("pt-BR")})`,
      },
    );
  };

  const salvarObs = async () => {
    const { error } = await supabase
      .from("empresas")
      .update({ observacoes_admin: obs })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Observações salvas");
    reload();
  };

  const addFinanceiro = async () => {
    if (!finForm.valor || !finForm.vencimento)
      return toast.error("Valor e vencimento são obrigatórios");
    const { error } = await supabase.from("financeiro").insert({
      empresa_id: id,
      valor: Number(finForm.valor),
      forma_pagamento: finForm.forma,
      pagamento: finForm.pagamento ? new Date(finForm.pagamento).toISOString() : null,
      vencimento: new Date(finForm.vencimento).toISOString(),
      status: finForm.status as any,
      observacoes: finForm.obs || null,
      plano_id: finForm.plano_id || null,
    });
    if (error) return toast.error(error.message);
    await logHistorico(
      "financeiro",
      `Pagamento R$ ${finForm.valor} via ${finForm.forma} (${finForm.status})`,
    );
    toast.success("Lançamento adicionado");
    setShowFin(false);
    setFinForm({
      valor: "",
      forma: "PIX",
      pagamento: new Date().toISOString().slice(0, 10),
      vencimento: "",
      status: "pago",
      obs: "",
      plano_id: "",
    });
    reload();
  };

  const venc = e.plano_vencimento ? new Date(e.plano_vencimento) : null;
  const diasRestantes = venc ? Math.ceil((venc.getTime() - Date.now()) / 86400000) : null;
  const cobrancaTag =
    diasRestantes == null
      ? { txt: "Sem assinatura", cls: "bg-secondary" }
      : diasRestantes < 0
        ? { txt: "Vencido", cls: "bg-destructive text-destructive-foreground" }
        : diasRestantes <= 7
          ? { txt: `Vence em ${diasRestantes}d`, cls: "bg-yellow-200 text-yellow-900" }
          : { txt: "Em dia", cls: "bg-emerald-100 text-emerald-900" };

  const wa = e.whatsapp ? `https://wa.me/${String(e.whatsapp).replace(/\D/g, "")}` : null;

  return (
    <div className="safe-top px-5 pt-4 pb-16 space-y-4">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/app/admin/empresas" })}
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-xl font-black">{e.nome_empresa || "Empresa"}</h1>
      </header>

      {/* Cabeçalho */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          {e.logo_url && e.logo_url.trim() ? (
            <img
              src={e.logo_url}
              alt=""
              className="h-14 w-14 rounded-xl object-cover"
              onError={() => console.warn("[admin-empresa] logo falhou", { src: e.logo_url })}
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-secondary">
              <Building2 className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate font-bold">{e.nome_empresa || "—"}</div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge(e.status)}`}
              >
                {e.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{e.responsavel || "—"}</div>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
              {e.email && <Row icon={Mail} value={e.email} href={`mailto:${e.email}`} />}
              {e.whatsapp && <Row icon={MessageCircle} value={e.whatsapp} href={wa!} />}
              {e.telefone && <Row icon={Phone} value={e.telefone} href={`tel:${e.telefone}`} />}
              <Row icon={MapPin} value={[e.cidade, e.estado].filter(Boolean).join("/") || "—"} />
              <div className="text-[11px] text-muted-foreground">
                Cadastrado em {new Date(e.created_at).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ações rápidas */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Action
          onClick={() => setStatus("ativa", "Ativa")}
          icon={CheckCircle2}
          label="Aprovar"
          className="bg-emerald-600 text-white"
        />
        <Action
          onClick={() => setStatus("suspensa", "Suspensa")}
          icon={PauseCircle}
          label="Suspender"
          className="bg-yellow-500 text-white"
        />
        <Action
          onClick={() => setStatus("bloqueada", "Bloqueada")}
          icon={Ban}
          label="Bloquear"
          className="bg-destructive text-destructive-foreground"
        />
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-bold"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
        {e.email && (
          <a
            href={`mailto:${e.email}`}
            className="flex items-center justify-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-bold"
          >
            <Mail className="h-4 w-4" /> E-mail
          </a>
        )}
        <Link
          to="/app/perfil"
          className="flex items-center justify-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-bold"
        >
          <Edit3 className="h-4 w-4" /> Cadastro
        </Link>
      </section>

      {/* Plano + Assinatura */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Plano & Assinatura</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cobrancaTag.cls}`}>
            {cobrancaTag.txt}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2">
            <span className="text-[10px] uppercase text-muted-foreground">Plano atual</span>
            <select
              value={e.plano_id ?? ""}
              onChange={(ev) => {
                const p = (data?.planos ?? []).find((x: any) => x.id === ev.target.value);
                if (p) setPlano(p.id, p.nome);
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-bold"
            >
              <option value="">—</option>
              {(data?.planos ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <Mini
            label="Início"
            value={e.plano_inicio ? new Date(e.plano_inicio).toLocaleDateString("pt-BR") : "—"}
          />
          <Mini label="Vencimento" value={venc ? venc.toLocaleDateString("pt-BR") : "—"} />
          <Mini label="Dias restantes" value={diasRestantes == null ? "—" : `${diasRestantes}d`} />
          <Mini label="Status" value={e.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[30, 90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => renovar(d)}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
            >
              <RefreshCw className="h-3 w-3" /> +{d} dias
            </button>
          ))}
        </div>
      </section>

      {/* Estatísticas */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="font-bold">Estatísticas</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat icon={Package} label="Ativos" value={counts.ativos} />
          <Stat icon={CheckCircle2} label="Vendidos" value={counts.vendidos} />
          <Stat icon={PauseCircle} label="Pausados" value={counts.pausados} />
          <Stat icon={Eye} label="Visualizações" value={data!.views} />
          <Stat icon={MessageCircle} label="Contatos" value={data!.contatos} />
          <Stat icon={TrendingUp} label="Negociações" value={e.total_negociacoes ?? 0} />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Último acesso: {e.ultimo_acesso ? new Date(e.ultimo_acesso).toLocaleString("pt-BR") : "—"}
        </div>
      </section>

      {/* Financeiro */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">💰 Financeiro</h2>
          <button
            onClick={() => setShowFin((s) => !s)}
            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-3 w-3" /> Novo
          </button>
        </div>

        {showFin && (
          <div className="mt-3 space-y-2 rounded-xl border border-border p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor (R$)">
                <input
                  type="number"
                  step="0.01"
                  value={finForm.valor}
                  onChange={(ev) => setFinForm({ ...finForm, valor: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                />
              </Field>
              <Field label="Forma">
                <select
                  value={finForm.forma}
                  onChange={(ev) => setFinForm({ ...finForm, forma: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pagamento">
                <input
                  type="date"
                  value={finForm.pagamento}
                  onChange={(ev) => setFinForm({ ...finForm, pagamento: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                />
              </Field>
              <Field label="Vencimento">
                <input
                  type="date"
                  value={finForm.vencimento}
                  onChange={(ev) => setFinForm({ ...finForm, vencimento: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                />
              </Field>
              <Field label="Status">
                <select
                  value={finForm.status}
                  onChange={(ev) => setFinForm({ ...finForm, status: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                >
                  {["pago", "pendente", "atrasado", "cancelado"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Plano (opcional)">
                <select
                  value={finForm.plano_id}
                  onChange={(ev) => setFinForm({ ...finForm, plano_id: ev.target.value })}
                  className="w-full rounded border border-border bg-background p-1.5"
                >
                  <option value="">—</option>
                  {data!.planos.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Observações">
              <input
                value={finForm.obs}
                onChange={(ev) => setFinForm({ ...finForm, obs: ev.target.value })}
                className="w-full rounded border border-border bg-background p-1.5"
              />
            </Field>
            <button
              onClick={addFinanceiro}
              className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground"
            >
              Salvar lançamento
            </button>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {data!.financeiro.length === 0 && (
            <div className="text-xs text-muted-foreground">Sem lançamentos.</div>
          )}
          {data!.financeiro.map((f: any) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs"
            >
              <div>
                <div className="font-bold">
                  R$ {Number(f.valor).toFixed(2)} · {f.forma_pagamento || "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Pag: {f.pagamento ? new Date(f.pagamento).toLocaleDateString("pt-BR") : "—"} ·
                  Venc: {new Date(f.vencimento).toLocaleDateString("pt-BR")}
                </div>
                {f.observacoes && <div className="text-[10px]">{f.observacoes}</div>}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${finBadge(f.status)}`}
              >
                {f.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Observações internas */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="font-bold">📝 Observações internas</h2>
        <p className="text-[10px] text-muted-foreground">Visível apenas para administradores.</p>
        <textarea
          value={obs}
          onChange={(ev) => setObs(ev.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
          placeholder="Anotações privadas…"
        />
        <button
          onClick={salvarObs}
          className="mt-2 flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Save className="h-3 w-3" /> Salvar
        </button>
      </section>

      {/* Anúncios */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Anúncios</h2>
          <Link to="/app/estoque" className="text-xs font-bold text-primary">
            Ver todos
          </Link>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Mini label="Ativos" value={counts.ativos} />
          <Mini label="Vendidos" value={counts.vendidos} />
          <Mini label="Pausados" value={counts.pausados} />
        </div>
      </section>

      {/* Histórico */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-1 font-bold">
          <History className="h-4 w-4" /> Histórico
        </h2>
        <div className="mt-2 space-y-1.5">
          {data!.historico.length === 0 && (
            <div className="text-xs text-muted-foreground">Sem registros.</div>
          )}
          {data!.historico.map((h: any) => (
            <div key={h.id} className="rounded-lg bg-secondary px-3 py-2 text-xs">
              <div className="text-[10px] text-muted-foreground">
                {new Date(h.created_at).toLocaleString("pt-BR")} · {h.tipo}
              </div>
              <div>{h.descricao}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ icon: Icon, value, href }: { icon: any; value: string; href?: string }) {
  const body = (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3 w-3 text-muted-foreground" />
      {value}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
      {body}
    </a>
  ) : (
    body
  );
}
function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-secondary px-2 py-1.5">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-xs font-bold">{value}</div>
    </div>
  );
}
function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-xl bg-secondary px-2 py-2 text-center">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <div className="mt-0.5 text-base font-black">{value}</div>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
function Action({
  icon: Icon,
  label,
  onClick,
  className = "",
}: {
  icon: any;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${className}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function badge(s: string) {
  switch (s) {
    case "ativa":
      return "bg-emerald-100 text-emerald-900";
    case "suspensa":
      return "bg-yellow-100 text-yellow-900";
    case "bloqueada":
      return "bg-destructive text-destructive-foreground";
    case "vencida":
      return "bg-zinc-300 text-zinc-900";
    case "pendente":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-secondary";
  }
}
function finBadge(s: string) {
  switch (s) {
    case "pago":
      return "bg-emerald-100 text-emerald-900";
    case "pendente":
      return "bg-yellow-100 text-yellow-900";
    case "atrasado":
      return "bg-destructive text-destructive-foreground";
    case "cancelado":
      return "bg-zinc-300 text-zinc-900";
    default:
      return "bg-secondary";
  }
}
