import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  LogOut,
  Wallet,
  MessageCircle,
  Package,
  Calendar,
  Shield,
  Save,
  MapPin,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EnderecoEmpresaForm, type EnderecoValue } from "@/components/endereco-empresa-form";
import { usePlanStatus, planColor, planEmoji } from "@/hooks/use-plan-status";
import { UpgradeModal } from "@/components/upgrade-modal";

export const Route = createFileRoute("/_authenticated/app/perfil")({
  component: Perfil,
});

function Perfil() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { data: planStatus } = usePlanStatus();

  const { data } = useQuery({
    queryKey: ["perfil"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: emp } = await supabase
        .from("empresas")
        .select("*")
        .eq("owner_id", u.user!.id)
        .single();
      const empresaId = emp?.id;
      const [ativosRes, vendidosRes, contatosVendaRes, contatosCompraRes, rolesRes, vendedorRes] =
        await Promise.all([
          empresaId
            ? supabase
                .from("materiais")
                .select("id", { count: "exact", head: true })
                .eq("empresa_id", empresaId)
                .eq("status", "ativo")
            : Promise.resolve({ count: 0 } as any),
          empresaId
            ? supabase
                .from("materiais")
                .select("valor_vendido")
                .eq("empresa_id", empresaId)
                .eq("status", "vendido")
            : Promise.resolve({ data: [] } as any),
          empresaId
            ? supabase
                .from("material_contatos")
                .select("material_id, materiais!inner(empresa_id)", {
                  count: "exact",
                  head: true,
                })
                .eq("materiais.empresa_id", empresaId)
            : Promise.resolve({ count: 0 } as any),
          supabase
            .from("material_contatos")
            .select("id", { count: "exact", head: true })
            .eq("viewer_id", u.user!.id),
          supabase.from("user_roles").select("role").eq("user_id", u.user!.id),
          supabase
            .from("vendedores_parceiros" as any)
            .select("id, codigo")
            .eq("user_id", u.user!.id)
            .maybeSingle(),
        ]);
      const ganhos = (vendidosRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.valor_vendido ?? 0),
        0,
      );
      const isAdmin = (rolesRes.data ?? []).some((r: any) => r.role === "admin");
      const contatos = (contatosVendaRes.count ?? 0) + (contatosCompraRes.count ?? 0);
      return {
        empresa: emp,
        ativos: ativosRes.count ?? 0,
        ganhos,
        contatos,
        isAdmin,
        vendedor: (vendedorRes as any)?.data ?? null,
        email: u.user!.email,
      };
    },
  });

  const [form, setForm] = useState<any>(null);
  const [editingEndereco, setEditingEndereco] = useState(false);
  const [endereco, setEndereco] = useState<EnderecoValue | null>(null);
  const emp: any = data?.empresa;
  const current = form ?? emp;

  const logout = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const save = async () => {
    if (!current) return;
    const { error } = await supabase
      .from("empresas")
      .update({
        nome_empresa: current.nome_empresa,
        responsavel: current.responsavel,
        telefone: current.telefone,
        whatsapp: current.whatsapp,
      })
      .eq("id", emp.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Perfil atualizado");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["perfil"] });
    }
  };

  const openEnderecoEditor = () => {
    setEndereco({
      endereco: emp?.endereco ?? "",
      numero: emp?.numero ?? "",
      bairro: emp?.bairro ?? "",
      cidade: emp?.cidade ?? "",
      estado: emp?.estado ?? "SP",
      cep: emp?.cep ?? "",
      latitude: emp?.latitude ?? null,
      longitude: emp?.longitude ?? null,
    });
    setEditingEndereco(true);
  };

  const saveEndereco = async () => {
    if (!endereco) return;
    if (!endereco.latitude || !endereco.longitude) {
      toast.error("Localize o novo endereço no mapa antes de salvar.");
      return;
    }
    const { error } = await supabase
      .from("empresas")
      .update({
        endereco: endereco.endereco,
        numero: endereco.numero,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        estado: endereco.estado,
        cep: endereco.cep,
        latitude: endereco.latitude,
        longitude: endereco.longitude,
      })
      .eq("id", emp.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Endereço atualizado");
    setEditingEndereco(false);
    qc.invalidateQueries({ queryKey: ["perfil"] });
  };

  if (!data)
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  const dias = emp?.created_at
    ? Math.max(1, Math.floor((Date.now() - +new Date(emp.created_at)) / (1000 * 60 * 60 * 24)))
    : 0;
  const tempoLabel = dias >= 365 ? `${Math.floor(dias / 365)}a` : `${dias}d`;
  const ganhosLabel =
    data.ganhos >= 1000
      ? `R$ ${(data.ganhos / 1000).toFixed(data.ganhos >= 10000 ? 0 : 1).replace(".", ",")}k`
      : `R$ ${Math.round(data.ganhos)}`;

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-black">Perfil</h1>
        </div>
        <button
          onClick={logout}
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-destructive"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <div className="mt-6 rounded-3xl bg-gradient-to-br from-[oklch(0.27_0.03_260)] to-[oklch(0.35_0.03_260)] p-6 text-white shadow-pop">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-2xl font-black">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{emp?.nome_empresa || "Sem nome"}</div>
            <div className="text-xs opacity-80">
              {emp?.cidade}/{emp?.estado}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[11px]">
          <Mini icon={Wallet} value={ganhosLabel} label="Ganhos" to="/app/estoque" search={{ tab: "vendido" }} />
          <Mini icon={MessageCircle} value={data.contatos} label="Contatos" />
          <Mini icon={Package} value={data.ativos} label="Ativos" to="/app/estoque" search={{ tab: "ativo" }} />
          <Mini icon={Calendar} value={tempoLabel} label="No app" />
        </div>
      </div>

      {planStatus && (
        <div className="mt-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Plano atual
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${planColor(planStatus.plano.cor)}`}
                >
                  {planEmoji(planStatus.plano.slug)} {planStatus.plano.nome}
                </span>
                {planStatus.vencido && (
                  <span className="text-[10px] font-bold text-destructive">Vencido</span>
                )}
              </div>
              {planStatus.plano_vencimento && planStatus.plano.slug !== "free" && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Vence em {new Date(planStatus.plano_vencimento).toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
            {planStatus.plano.slug !== "premium" && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                <Sparkles className="h-3 w-3" /> Upgrade
              </button>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <UsageBar
              label="📦 Anúncios (ciclo 30 dias)"
              used={planStatus.uso.anuncios}
              max={planStatus.plano.max_anuncios}
            />
            <UsageBar
              label="🔔 Alerta Automático"
              used={planStatus.uso.buscas}
              max={planStatus.plano.max_buscas}
            />
            {planStatus.proxima_liberacao && (
              <div className="rounded-xl bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
                📅 Próxima liberação:{" "}
                <b className="text-foreground">
                  {(() => {
                    const dias = Math.max(
                      0,
                      Math.ceil(
                        (new Date(planStatus.proxima_liberacao).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      ),
                    );
                    return dias === 0 ? "hoje" : `em ${dias} ${dias === 1 ? "dia" : "dias"}`;
                  })()}
                </b>
                {planStatus.liberacoes_proximas_7d > 1 &&
                  ` · ${planStatus.liberacoes_proximas_7d} vagas nos próximos 7 dias`}
              </div>
            )}
          </div>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentSlug={planStatus?.plano.slug}
      />

      {data.isAdmin && (
        <Link
          to="/app/admin"
          className="mt-3 flex items-center gap-3 rounded-2xl bg-accent p-4 text-accent-foreground shadow-card"
        >
          <Shield className="h-5 w-5" />
          <div className="flex-1">
            <div className="font-bold">Painel Administrativo</div>
            <div className="text-xs opacity-80">Gerenciar empresas e anúncios</div>
          </div>
        </Link>
      )}

      {data.vendedor && (
        <Link
          to="/app/vendedor"
          className="mt-3 flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card"
        >
          <span className="text-xl">🤝</span>
          <div className="flex-1">
            <div className="font-bold">Painel do Parceiro</div>
            <div className="text-xs opacity-80">
              Código <b>{data.vendedor.codigo}</b> · ver indicações e comissões
            </div>
          </div>
        </Link>
      )}

      <div className="mt-5 rounded-2xl bg-card p-1 shadow-card">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-bold">Dados da empresa</h2>
          {!editing ? (
            <button
              onClick={() => {
                setEditing(true);
                setForm(emp);
              }}
              className="text-xs font-semibold text-primary"
            >
              Editar
            </button>
          ) : (
            <button
              onClick={save}
              className="flex items-center gap-1 text-xs font-semibold text-accent"
            >
              <Save className="h-3 w-3" />
              Salvar
            </button>
          )}
        </div>
        <div className="space-y-1 px-4 pb-4">
          {[
            ["Empresa", "nome_empresa"],
            ["Responsável", "responsavel"],
            ["WhatsApp", "whatsapp"],
            ["Telefone", "telefone"],
            ["E-mail", null],
          ].map(([label, key]) => (
            <div key={label} className="border-t border-border py-2 first:border-0">
              <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
              {editing && key ? (
                <input
                  className="mt-1 w-full bg-transparent text-sm outline-none"
                  value={current?.[key as string] ?? ""}
                  onChange={(e) => setForm((f: any) => ({ ...f, [key as string]: e.target.value }))}
                />
              ) : (
                <div className="text-sm font-medium">
                  {key ? current?.[key as string] || "—" : data.email}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              <MapPin className="h-4 w-4 text-primary" /> Endereço da empresa
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Este endereço define a localização usada nos seus anúncios — não o GPS do seu celular.
            </p>
            {!editingEndereco && (
              <div className="mt-2 text-sm">
                <div className="font-medium">
                  {[emp?.endereco, emp?.numero].filter(Boolean).join(", ") ||
                    "Endereço não informado"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[emp?.bairro, emp?.cidade && `${emp.cidade}/${emp.estado}`, emp?.cep]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {emp?.latitude && emp?.longitude && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    📍 {Number(emp.latitude).toFixed(5)}, {Number(emp.longitude).toFixed(5)}
                  </div>
                )}
              </div>
            )}
          </div>
          {!editingEndereco ? (
            <button
              onClick={openEnderecoEditor}
              className="shrink-0 text-xs font-semibold text-primary"
            >
              Editar
            </button>
          ) : (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setEditingEndereco(false)}
                className="text-xs font-semibold text-muted-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={saveEndereco}
                className="flex items-center gap-1 text-xs font-semibold text-accent"
              >
                <Save className="h-3 w-3" /> Salvar
              </button>
            </div>
          )}
        </div>
        {editingEndereco && endereco && (
          <div className="mt-4">
            <EnderecoEmpresaForm value={endereco} onChange={setEndereco} />
          </div>
        )}
      </div>
    </div>
  );
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const danger = !unlimited && used >= max;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium">{label}</span>
        <span className={`font-bold ${danger ? "text-destructive" : "text-foreground"}`}>
          {used} {unlimited ? "/ ∞" : `/ ${max}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${danger ? "bg-destructive" : "bg-primary"}`}
          style={{ width: unlimited ? "100%" : `${pct}%`, opacity: unlimited ? 0.3 : 1 }}
        />
      </div>
    </div>
  );
}

function Mini({
  icon: Icon,
  value,
  label,
  to,
  search,
}: {
  icon: any;
  value: any;
  label: string;
  to?: string;
  search?: Record<string, any>;
}) {
  const body = (
    <>
      <Icon className="mx-auto h-4 w-4 opacity-90" />
      <div className="mt-0.5 text-sm font-bold">{value}</div>
      <div className="opacity-75">{label}</div>
    </>
  );
  if (to) {
    return (
      <Link
        to={to as any}
        search={search as any}
        className="rounded-xl bg-white/10 p-2 transition active:scale-95 hover:bg-white/20"
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-xl bg-white/10 p-2">{body}</div>;
}
