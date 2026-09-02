import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Copy, Save, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildPartnerReferralLink } from "@/lib/partner-branch";

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
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(today());

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
      const empresaIds = ((inds.data as any[]) ?? []).map((i: any) => i.empresa_id);
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
      return {
        vendedor: v as any,
        metrics: m.data as any,
        indicacoes: (inds.data as any[]) ?? [],
        counts,
      };
    },
  });

  const { data: periodMetrics } = useQuery({
    queryKey: ["admin-vendedor-report", id, fromDate, toDate],
    enabled: !!fromDate && !!toDate && fromDate <= toDate,
    queryFn: async () => {
      const { data: report, error } = await supabase.rpc("admin_partner_report" as any, {
        _vendedor_id: id,
        _from_date: fromDate,
        _to_date: toDate,
      });
      if (error) throw error;
      return report as any;
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
      await supabase
        .from("indicacoes" as any)
        .update(
          status === "aprovada"
            ? {
                status,
                aprovada_em: new Date().toISOString(),
                primeira_conversao_em: new Date().toISOString(),
                plano_pago_slug: "manual",
              }
            : { status },
        )
        .eq("id", indId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendedor", id] }),
  });

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  const v = data.vendedor;
  const current = form ?? v;
  const m = data.metrics ?? {};
  const referralLink = buildPartnerReferralLink(v.codigo);
  const filteredIndications = data.indicacoes.filter((indication: any) => {
    const date = indication.created_at.slice(0, 10);
    return date >= fromDate && date <= toDate;
  });

  const exportCSV = () => {
    const rows = [
      ["Empresa", "Cidade", "Data", "Anúncios", "Status", "Comissão", "Pago"],
      ...filteredIndications.map((i: any) => [
        i.empresas?.nome_empresa || "",
        `${i.empresas?.cidade || ""}/${i.empresas?.estado || ""}`,
        new Date(i.created_at).toLocaleDateString("pt-BR"),
        String(data.counts[i.empresa_id] ?? 0),
        i.status,
        Number(i.comissao_valor).toFixed(2),
        i.paga ? "Sim" : "Não",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${v.codigo}-${fromDate}-a-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const report = periodMetrics ?? {};
    const issuedAt = new Date();
    const reportWindow = window.open("", "_blank", "width=900,height=700");
    if (!reportWindow) {
      toast.error("Permita pop-ups para gerar o relatório.");
      return;
    }
    const rows = filteredIndications
      .map(
        (item: any) =>
          `<tr><td>${escapeHtml(item.empresas?.nome_empresa || "—")}</td><td>${escapeHtml(`${item.empresas?.cidade || ""}/${item.empresas?.estado || ""}`)}</td><td>${new Date(item.created_at).toLocaleDateString("pt-BR")}</td><td>${escapeHtml(item.status)}</td><td>R$ ${fmt(item.comissao_valor)}</td><td>${item.paga ? "Sim" : "Não"}</td></tr>`,
      )
      .join("");
    reportWindow.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${escapeHtml(v.nome)}</title><style>body{font-family:Arial,sans-serif;color:#222;padding:32px}h1{margin-bottom:4px}.muted{color:#666;font-size:12px}.link{word-break:break-all}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0}.card{border:1px solid #ddd;border-radius:8px;padding:12px}.value{font-size:22px;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f3f3f3}@media print{body{padding:0}.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Imprimir ou salvar em PDF</button><h1>Relatório de parceiro</h1><div><strong>${escapeHtml(v.nome)}</strong></div><div class="muted">Código: ${escapeHtml(v.codigo)}</div><div class="muted link">Link: ${escapeHtml(referralLink)}</div><p>Período: <strong>${formatDate(fromDate)} a ${formatDate(toDate)}</strong><br><span class="muted">Emitido em ${issuedAt.toLocaleString("pt-BR")}</span></p><div class="cards"><div class="card"><div class="value">${report.acessos ?? 0}</div><div>Acessos</div></div><div class="card"><div class="value">${report.instalacoes ?? 0}</div><div>Instalações (${report.instalacoes_android ?? 0} Android / ${report.instalacoes_ios ?? 0} iOS)</div></div><div class="card"><div class="value">${report.cadastros ?? 0}</div><div>Cadastros</div></div><div class="card"><div class="value">${report.pagantes ?? 0}</div><div>Pagantes</div></div></div><p><strong>Comissões do período:</strong> R$ ${fmt(report.valor_total)} &nbsp; | &nbsp; <strong>Pagas:</strong> R$ ${fmt(report.valor_pago)}</p><h2>Empresas cadastradas no período</h2><table><thead><tr><th>Empresa</th><th>Cidade/UF</th><th>Cadastro</th><th>Status</th><th>Comissão</th><th>Pago</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhum cadastro no período.</td></tr>'}</tbody></table></body></html>`,
    );
    reportWindow.document.close();
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

      <div className="mt-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          Link exclusivo do parceiro
        </div>
        <div className="mt-1 break-all font-mono text-xs">{referralLink}</div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(referralLink);
            toast.success("Link copiado!");
          }}
          className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-xs font-bold"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <MiniBig label="Acessos ao link" value={m.acessos ?? m.cliques ?? 0} />
        <MiniBig label="Cadastros" value={m.cadastros ?? 0} />
        <MiniBig label="Pagantes" value={m.pagantes ?? m.aprovados ?? 0} />
        <MiniBig
          label="Planos pagos ativos"
          value={m.planos_pagos_ativos ?? m.premiums_ativos ?? 0}
        />
        <MiniBig label="Total devido" value={`R$ ${fmt(m.valor_total)}`} />
        <MiniBig label="A pagar" value={`R$ ${fmt(m.valor_pendente)}`} accent />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-bold">Relatório por período</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <DateField label="Data inicial" value={fromDate} onChange={setFromDate} />
          <DateField label="Data final" value={toDate} onChange={setToDate} />
        </div>
        {fromDate > toDate && (
          <p className="mt-2 text-xs font-semibold text-destructive">
            A data inicial não pode ser posterior à data final.
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MiniPeriod label="Acessos" value={periodMetrics?.acessos ?? 0} />
          <MiniPeriod label="Instalações" value={periodMetrics?.instalacoes ?? 0} />
          <MiniPeriod label="Cadastros" value={periodMetrics?.cadastros ?? 0} />
          <MiniPeriod label="Pagantes" value={periodMetrics?.pagantes ?? 0} />
          <MiniPeriod label="Android" value={periodMetrics?.instalacoes_android ?? 0} />
          <MiniPeriod label="iOS" value={periodMetrics?.instalacoes_ios ?? 0} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={fromDate > toDate}
            onClick={printReport}
            className="flex h-10 items-center justify-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" /> Gerar relatório
          </button>
          <button
            type="button"
            disabled={fromDate > toDate}
            onClick={exportCSV}
            className="flex h-10 items-center justify-center gap-1 rounded-xl bg-secondary px-3 text-xs font-bold disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Baixar CSV
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-bold">Indicações no período</h2>
        <span className="text-xs text-muted-foreground">
          {filteredIndications.length} registros
        </span>
      </div>

      <div className="mt-2 space-y-2">
        {filteredIndications.map((i: any) => (
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
                <option value="aprovada">🟢 Pagante</option>
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
        {filteredIndications.length === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            Sem indicações neste período.
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
    <div
      className={`rounded-2xl p-3 shadow-card ${accent ? "bg-accent text-accent-foreground" : "bg-card"}`}
    >
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}

function fmt(n: any) {
  return Number(n ?? 0)
    .toFixed(2)
    .replace(".", ",");
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-input bg-background px-2 text-xs"
      />
    </label>
  );
}

function MiniPeriod({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary p-2">
      <div className="font-black">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function dateInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function today() {
  return dateInputValue(new Date());
}

function firstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  return dateInputValue(date);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
