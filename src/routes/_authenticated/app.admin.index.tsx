import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: Admin,
});

function Admin() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-dash"],
    queryFn: async () => {
      const [empresas, ativas, anuncios, vendidos] = await Promise.all([
        supabase.from("empresas").select("*", { count: "exact" }),
        supabase
          .from("empresas")
          .select("id", { count: "exact", head: true })
          .eq("status", "ativa"),
        supabase
          .from("materiais")
          .select("id", { count: "exact", head: true })
          .eq("status", "ativo"),
        supabase
          .from("materiais")
          .select("id", { count: "exact", head: true })
          .eq("status", "vendido"),
      ]);
      return {
        empresas: empresas.data ?? [],
        totalEmpresas: empresas.count ?? 0,
        ativas: ativas.count ?? 0,
        anuncios: anuncios.count ?? 0,
        vendidos: vendidos.count ?? 0,
      };
    },
  });

  const status = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase
        .from("empresas")
        .update({ status: status as any })
        .eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-dash"] });
      toast.success("Atualizado");
    },
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link
          to="/app/perfil"
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">Admin</h1>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat icon={Building2} label="Empresas" value={data?.totalEmpresas ?? "—"} />
        <Stat icon={CheckCircle2} label="Ativas" value={data?.ativas ?? "—"} accent />
        <Stat icon={Package} label="Anúncios ativos" value={data?.anuncios ?? "—"} />
        <Stat icon={AlertTriangle} label="Vendidos" value={data?.vendidos ?? "—"} />
      </div>

      <Link
        to="/app/admin/empresas"
        className="mt-5 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">🏢 Empresas cadastradas</div>
          <div className="text-xs text-muted-foreground">
            Ver dados completos, contatos e exportar CSV
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <Link
        to="/app/admin/banners"
        className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">🖼️ Banners</div>
          <div className="text-xs text-muted-foreground">
            Criar, agendar e medir banners da home
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <Link
        to="/app/admin/planos"
        className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">💎 Planos & Assinaturas</div>
          <div className="text-xs text-muted-foreground">Configurar limites, preços e validade</div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <Link
        to="/app/admin/vendedores"
        className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">🤝 Vendedores Parceiros</div>
          <div className="text-xs text-muted-foreground">
            Gerenciar afiliados, comissões e indicações
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <Link
        to="/app/admin/denuncias"
        className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">🚩 Denúncias</div>
          <div className="text-xs text-muted-foreground">
            Revisar, confirmar e aplicar penalidades
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <Link
        to={"/app/admin/moderacao-fotos" as any}
        className="mt-3 flex items-center justify-between rounded-2xl bg-card p-4 shadow-card"
      >
        <div>
          <div className="text-base font-bold">🤖 Moderação de Fotos</div>
          <div className="text-xs text-muted-foreground">
            Estrutura pronta para IA · aprovação manual disponível
          </div>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <h2 className="mt-7 text-sm font-bold">Empresas</h2>
      <div className="mt-2 space-y-2">
        {(data?.empresas ?? []).map((e: any) => (
          <div key={e.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-bold">{e.nome_empresa || "—"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {e.email} · {e.cidade}/{e.estado}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge(e.status)}`}
              >
                {e.status}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <Btn onClick={() => status.mutate({ id: e.id, status: "ativa" })}>Ativar</Btn>
              <Btn onClick={() => status.mutate({ id: e.id, status: "suspensa" })}>Suspender</Btn>
              <Btn onClick={() => status.mutate({ id: e.id, status: "bloqueada" })}>Bloquear</Btn>
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
function Btn({ children, onClick }: any) {
  return (
    <button onClick={onClick} className="rounded-lg bg-secondary px-3 py-1.5 font-semibold">
      {children}
    </button>
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
