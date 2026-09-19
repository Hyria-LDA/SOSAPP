import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Copy, Download, Plus, Printer, X } from "lucide-react";
import { zipSync } from "fflate";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildPartnerReferralLink } from "@/lib/partner-branch";

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
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(today());
  const [reporting, setReporting] = useState(false);

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
      await supabase
        .from("vendedores_parceiros" as any)
        .update({ ativo })
        .eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vendedores"] });
      toast.success("Atualizado");
    },
  });

  const fetchAllReport = async () => {
    if (!fromDate || !toDate || fromDate > toDate) {
      toast.error("Confira o período do relatório.");
      return null;
    }

    const { data: report, error } = await supabase.rpc("admin_all_partners_report" as any, {
      _from_date: fromDate,
      _to_date: toDate,
    });
    if (error) throw error;
    return report as any;
  };

  const printAllReport = async () => {
    const reportWindow = window.open("", "_blank", "width=1100,height=750");
    if (!reportWindow) {
      toast.error("Permita pop-ups para gerar o relatório.");
      return;
    }
    reportWindow.document.write("<p style='font-family:Arial;padding:24px'>Gerando relatório…</p>");
    setReporting(true);
    try {
      const report = await fetchAllReport();
      if (!report) {
        reportWindow.close();
        return;
      }
      const sellers = (report.vendedores as any[]) ?? [];
      const rows = sellers
        .map(
          (v) =>
            `<tr><td>${escapeHtml(v.nome)}</td><td>${escapeHtml(v.codigo)}</td><td>${v.ativo ? "Ativo" : "Inativo"}</td><td>${v.acessos ?? 0}</td><td>${v.instalacoes ?? 0}</td><td>${v.instalacoes_android ?? 0}</td><td>${v.instalacoes_ios ?? 0}</td><td>${v.cadastros ?? 0}</td><td>${v.pagantes ?? 0}</td><td>R$ ${fmt(v.valor_total)}</td><td>R$ ${fmt(v.valor_pago)}</td><td>R$ ${fmt(v.valor_pendente)}</td></tr>`,
        )
        .join("");
      reportWindow.document.open();
      reportWindow.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>Relatório geral de vendedores</title><style>body{font-family:Arial,sans-serif;color:#222;padding:28px}h1{margin-bottom:4px}.muted{color:#666;font-size:12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.card{border:1px solid #ddd;border-radius:8px;padding:10px}.value{font-size:20px;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left;font-size:11px}th{background:#f3f3f3;white-space:nowrap}@media print{body{padding:0}.no-print{display:none}}@page{size:landscape}</style></head><body><button class="no-print" onclick="window.print()">Imprimir ou salvar em PDF</button><h1>Relatório geral de vendedores parceiros</h1><p>Período: <strong>${formatDate(fromDate)} a ${formatDate(toDate)}</strong><br><span class="muted">Emitido em ${new Date().toLocaleString("pt-BR")}</span></p><div class="cards"><div class="card"><div class="value">${report.acessos ?? 0}</div><div>Acessos</div></div><div class="card"><div class="value">${report.instalacoes ?? 0}</div><div>Instalações</div></div><div class="card"><div class="value">${report.cadastros ?? 0}</div><div>Cadastros</div></div><div class="card"><div class="value">${report.pagantes ?? 0}</div><div>Pagantes</div></div></div><p><strong>Comissões:</strong> R$ ${fmt(report.valor_total)} &nbsp; | &nbsp; <strong>Pagas:</strong> R$ ${fmt(report.valor_pago)} &nbsp; | &nbsp; <strong>Pendentes:</strong> R$ ${fmt(report.valor_pendente)}</p><table><thead><tr><th>Vendedor</th><th>Código</th><th>Status</th><th>Acessos</th><th>Instalações</th><th>Android</th><th>iOS</th><th>Cadastros</th><th>Pagantes</th><th>Comissão</th><th>Pago</th><th>Pendente</th></tr></thead><tbody>${rows || '<tr><td colspan="12">Nenhum vendedor cadastrado.</td></tr>'}</tbody></table></body></html>`,
      );
      reportWindow.document.close();
    } catch (error: any) {
      reportWindow.close();
      toast.error(error?.message || "Não foi possível gerar o relatório.");
    } finally {
      setReporting(false);
    }
  };

  const exportAllCSV = async () => {
    setReporting(true);
    try {
      const report = await fetchAllReport();
      if (!report) return;
      const rows = [
        [
          "Vendedor",
          "Código",
          "Link",
          "Status",
          "Acessos",
          "Instalações",
          "Android",
          "iOS",
          "Cadastros",
          "Cadastros ativos",
          "Pagantes",
          "Comissão por cadastro ativo",
          "Comissão total",
          "Pago",
          "Pendente",
        ],
        ...((report.vendedores as any[]) ?? []).map((v) => [
          v.nome,
          v.codigo,
          buildPartnerReferralLink(v.codigo),
          v.ativo ? "Ativo" : "Inativo",
          v.acessos ?? 0,
          v.instalacoes ?? 0,
          v.instalacoes_android ?? 0,
          v.instalacoes_ios ?? 0,
          v.cadastros ?? 0,
          v.cadastros_ativos ?? 0,
          v.pagantes ?? 0,
          Number(v.comissao_por_cadastro ?? 0).toFixed(2),
          Number(v.valor_total ?? 0).toFixed(2),
          Number(v.valor_pago ?? 0).toFixed(2),
          Number(v.valor_pendente ?? 0).toFixed(2),
        ]),
      ];
      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorio-geral-vendedores-${fromDate}-a-${toDate}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível baixar o relatório.");
    } finally {
      setReporting(false);
    }
  };

  const exportIndividualReports = async () => {
    setReporting(true);
    try {
      const report = await fetchAllReport();
      if (!report) return;

      const sellers = (report.vendedores as any[]) ?? [];
      if (!sellers.length) {
        toast.info("Nenhum vendedor encontrado para gerar os relatórios.");
        return;
      }
      const { buildPartnerReportPdf } = await import("@/lib/partner-report-pdf");
      const nextDay = new Date(`${toDate}T12:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);

      const { data: indications, error } = await supabase
        .from("indicacoes" as any)
        .select("vendedor_id, empresa_id, created_at, status, comissao_valor, paga, empresas(nome_empresa, cidade, estado, status)")
        .gte("created_at", `${fromDate}T00:00:00`)
        .lt("created_at", `${dateInputValue(nextDay)}T00:00:00`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const bySeller = new Map<string, any[]>();
      for (const indication of (indications as any[]) ?? []) {
        const list = bySeller.get(indication.vendedor_id) ?? [];
        list.push(indication);
        bySeller.set(indication.vendedor_id, list);
      }

      const files: Record<string, Uint8Array> = {};
      for (const [index, seller] of sellers.entries()) {
        const sellerIndications = bySeller.get(seller.id) ?? [];
        const identity = [
          ["Vendedor", seller.nome],
          ["Código", seller.codigo],
          ["Link", buildPartnerReferralLink(seller.codigo)],
          ["Período", `${formatDate(fromDate)} a ${formatDate(toDate)}`],
        ];
        const summary = [
          ["Acessos", seller.acessos ?? 0],
          ["Instalações", seller.instalacoes ?? 0],
          ["Instalações Android", seller.instalacoes_android ?? 0],
          ["Instalações iOS", seller.instalacoes_ios ?? 0],
          ["Cadastros", seller.cadastros ?? 0],
          ["Cadastros ativos", seller.cadastros_ativos ?? 0],
          ["Pagantes", seller.pagantes ?? 0],
          ["Comissão por cadastro ativo", `R$ ${fmt(seller.comissao_por_cadastro)}`],
          ["Comissão total", `R$ ${fmt(seller.valor_total)}`],
          ["Comissão paga", `R$ ${fmt(seller.valor_pago)}`],
          ["Comissão pendente", `R$ ${fmt(seller.valor_pendente)}`],
        ];
        const details = [
          ...sellerIndications.map((item: any) => [
            item.empresas?.nome_empresa || "",
            [item.empresas?.cidade, item.empresas?.estado].filter(Boolean).join("/"),
            new Date(item.created_at).toLocaleDateString("pt-BR"),
            item.status || "",
            item.empresas?.status || "",
            Number(item.comissao_valor ?? 0).toFixed(2).replace(".", ","),
            item.paga ? "Sim" : "Não",
          ]),
        ];
        const filename = `${index + 1}-${safeFilename(seller.nome)}-${safeFilename(seller.codigo)}.pdf`;
        files[filename] = buildPartnerReportPdf({ identity, summary, details });
        // Give the interface time to respond between reports.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const zip = zipSync(files, { level: 6 });
      const blob = new Blob([zip], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorios-individuais-${fromDate}-a-${toDate}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`${sellers.length} relatórios em PDF preparados.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível baixar os relatórios individuais.");
    } finally {
      setReporting(false);
    }
  };

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

      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-bold">Relatório de todos os links</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Consulte todos os vendedores e resultados dentro do período escolhido.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <DateField label="Data inicial" value={fromDate} onChange={setFromDate} />
          <DateField label="Data final" value={toDate} onChange={setToDate} />
        </div>
        {fromDate > toDate && (
          <p className="mt-2 text-xs font-semibold text-destructive">
            A data inicial não pode ser posterior à data final.
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={reporting || fromDate > toDate}
            onClick={printAllReport}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> {reporting ? "Gerando…" : "Gerar relatório"}
          </button>
          <button
            type="button"
            disabled={reporting || fromDate > toDate}
            onClick={exportAllCSV}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Baixar CSV
          </button>
        </div>
        <button
          type="button"
          disabled={reporting || fromDate > toDate}
          onClick={exportIndividualReports}
          className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-primary bg-background px-3 text-xs font-bold text-primary disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Baixar relatórios em PDF (.zip)
        </button>
      </section>

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
                  Código <b>{v.codigo}</b>
                  {v.email ? ` · ${v.email}` : ""}
                </div>
                <button
                  type="button"
                  onClick={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    await navigator.clipboard.writeText(buildPartnerReferralLink(v.codigo));
                    toast.success("Link copiado!");
                  }}
                  className="mt-2 flex max-w-full items-center gap-1 text-left text-[11px] font-semibold text-primary"
                >
                  <Copy className="h-3 w-3 shrink-0" />
                  <span className="truncate">{buildPartnerReferralLink(v.codigo)}</span>
                </button>
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
              <Mini value={v.metrics?.acessos ?? v.metrics?.cliques ?? 0} label="Acessos" />
              <Mini value={v.metrics?.cadastros ?? 0} label="Cadastros" />
              <Mini value={v.metrics?.pagantes ?? v.metrics?.aprovados ?? 0} label="Pagantes" />
              <Mini
                value={`R$ ${Number(v.metrics?.valor_pendente ?? 0).toFixed(0)}`}
                label="A pagar"
              />
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

function fmt(value: unknown) {
  return Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",");
}

function safeFilename(value: unknown) {
  return String(value ?? "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "relatorio";
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    codigo: "",
    comissao_valor: "50",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.codigo) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-partner", {
        body: {
          nome: form.nome,
          email: form.email,
          telefone: form.telefone,
          codigo: form.codigo,
          comissao_valor: Number(form.comissao_valor) || 0,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Erro ao criar vendedor");

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
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl bg-background p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Novo vendedor parceiro</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input label="Nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <Input
            label="E-mail (opcional, somente para contato)"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            type="email"
          />
          <Input
            label="Telefone"
            value={form.telefone}
            onChange={(v) => setForm({ ...form, telefone: v })}
          />
          <Input
            label="Código do link *"
            value={form.codigo}
            onChange={(v) => setForm({ ...form, codigo: v.toUpperCase() })}
            placeholder="JOAO123"
          />
          <Input
            label="Comissão por cadastro ativo (R$)"
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
