import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Users, FileText, CheckCircle2, Sparkles, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/vendedor/")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: v } = await supabase
      .from("vendedores_parceiros" as any)
      .select("id")
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (!v) throw redirect({ to: "/app" });
  },
  component: VendedorDash,
});

function VendedorDash() {
  const { data } = useQuery({
    queryKey: ["vendedor-dash"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: v } = await supabase
        .from("vendedores_parceiros" as any)
        .select("*")
        .eq("user_id", u.user!.id)
        .single();
      const venReg: any = v;
      const [metricsRes, indsRes] = await Promise.all([
        supabase.rpc("vendedor_metrics" as any, { _vendedor_id: venReg.id }),
        supabase
          .from("indicacoes" as any)
          .select("*, empresas(nome_empresa, cidade, estado)")
          .eq("vendedor_id", venReg.id)
          .order("created_at", { ascending: false }),
      ]);
      return {
        vendedor: venReg,
        metrics: metricsRes.data as any,
        indicacoes: (indsRes.data as any[]) ?? [],
      };
    },
  });

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const link = `${window.location.origin}/r/${data.vendedor.codigo}`;
  const m = data.metrics ?? {};

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/perfil" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black">🤝 Painel do Parceiro</h1>
          <p className="text-xs text-muted-foreground">Olá, {data.vendedor.nome}</p>
        </div>
      </header>

      <div className="mt-4 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
          Seu link exclusivo
        </div>
        <div className="mt-1 truncate text-sm font-mono">{link}</div>
        <button
          onClick={copyLink}
          className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/20 px-3 py-2 text-xs font-bold"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat icon={Users} label="Cliques" value={m.cliques ?? 0} />
        <Stat icon={FileText} label="Cadastros" value={m.cadastros ?? 0} />
        <Stat icon={CheckCircle2} label="Aprovados" value={m.aprovados ?? 0} accent />
        <Stat icon={Sparkles} label="Premiums ativos" value={m.premiums_ativos ?? 0} />
      </div>

      <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-bold">
          <DollarSign className="h-4 w-4 text-accent" /> Comissões
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-black">R$ {fmt(m.valor_total)}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-lg font-black text-accent">R$ {fmt(m.valor_pago)}</div>
            <div className="text-[10px] text-muted-foreground">Pago</div>
          </div>
          <div>
            <div className="text-lg font-black text-orange-600">R$ {fmt(m.valor_pendente)}</div>
            <div className="text-[10px] text-muted-foreground">Pendente</div>
          </div>
        </div>
      </div>

      <h2 className="mt-6 text-sm font-bold">Indicações</h2>
      <div className="mt-2 space-y-2">
        {data.indicacoes.length === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhuma empresa cadastrada pelo seu link ainda.
          </div>
        )}
        {data.indicacoes.map((i: any) => (
          <div key={i.id} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{i.empresas?.nome_empresa || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {i.empresas?.cidade}/{i.empresas?.estado} ·{" "}
                  {new Date(i.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(i.status)}`}>
                {statusLabel(i.status)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Comissão: <b className="text-foreground">R$ {fmt(i.comissao_valor)}</b>
              </span>
              <span className={i.paga ? "font-bold text-accent" : "text-muted-foreground"}>
                {i.paga ? "✅ Pago" : "Pendente"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: any;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-card ${accent ? "bg-accent text-accent-foreground" : "bg-card"}`}
    >
      <Icon className="h-5 w-5 opacity-80" />
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function fmt(n: any) {
  return Number(n ?? 0).toFixed(2).replace(".", ",");
}
function statusLabel(s: string) {
  return { cadastrada: "🟡 Cadastrada", aprovada: "🟢 Aprovada", cancelada: "🔴 Cancelada", expirada: "⚫ Expirada" }[s] || s;
}
function statusBadge(s: string) {
  switch (s) {
    case "aprovada":
      return "bg-accent text-accent-foreground";
    case "cancelada":
      return "bg-destructive text-destructive-foreground";
    case "expirada":
      return "bg-secondary text-muted-foreground";
    default:
      return "bg-yellow-100 text-yellow-900";
  }
}
