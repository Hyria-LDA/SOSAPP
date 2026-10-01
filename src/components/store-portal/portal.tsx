import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  storeRpc,
  dateLabel,
  type Snapshot,
  type Contract,
  type StoreBanner,
  type Week,
  type Metrics,
} from "@/lib/store-portal";
import { Panel, Stats, Badge, StoreImage, buttonClass, secondaryClass, inputClass } from "./ui";
import { ProfileForm, SettingsForm, ContractForm, UploadForm, ReviewForm } from "./forms";
const tabs = [
  ["dashboard", "Visão geral"],
  ["profile", "Minha Empresa"],
  ["banners", "Meus Banners"],
  ["referral", "Divulgação"],
  ["history", "Campanhas anteriores"],
  ["library", "Biblioteca"],
];
export function Referral({ code, metrics }: { code?: string; metrics: Metrics }) {
  const link = `https://sosmarceneiros.com.br/r/${encodeURIComponent(code || "")}`;
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    if (!code) {
      setQr("");
      return;
    }
    QRCode.toDataURL(link, { width: 240, margin: 2 })
      .then((v) => {
        if (alive) setQr(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [link, code]);
  return (
    <div className="space-y-5">
      {code && (
        <Panel title="Seu link de divulgação">
          <div className="flex flex-wrap items-center gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Código da loja: {code}</p>
              <p className="my-4 break-all font-bold">{link}</p>
              <button
                className={buttonClass}
                onClick={() =>
                  navigator.clipboard
                    .writeText(link)
                    .then(() => toast.success("Link copiado."))
                    .catch(() => toast.error("Não foi possível copiar. Selecione o link acima."))
                }
              >
                Copiar link
              </button>
              {qr && (
                <a
                  href={qr}
                  download={`qr-${code}.png`}
                  className="ml-3 inline-block text-sm font-semibold underline"
                >
                  Baixar QR Code
                </a>
              )}
            </div>
            {qr && <img src={qr} width={180} height={180} alt="QR Code do link da loja" />}
          </div>
        </Panel>
      )}
      <Stats
        items={[
          ["Cliques", metrics.clicks],
          ["Hoje", metrics.today],
          ["Últimos 7 dias", metrics.last7],
          ["Últimos 30 dias", metrics.last30],
          ["Cadastros iniciados", metrics.registrations],
          ["Cadastros concluídos", metrics.completed],
          ["Publicaram anúncios", metrics.publishers],
          ["Assinaturas", metrics.subscriptions],
        ]}
      />
      <Panel title="Evolução nos últimos 30 dias">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => dateLabel(d).slice(0, 5)}
                minTickGap={30}
              />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={(v) => dateLabel(String(v))} />
              <Legend />
              <Area
                type="monotone"
                dataKey="clicks"
                name="Cliques"
                stroke="#ea770e"
                fill="#fff0df"
              />
              <Area
                type="monotone"
                dataKey="registrations"
                name="Cadastros"
                stroke="#168477"
                fill="#d9f2ee"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Cliques seguem a contagem do link existente: um visitante por dia. Cadastros concluídos e
          publicações mostram a situação atual dos cadastros atribuídos. Assinaturas usam a primeira
          conversão registrada.
        </p>
      </Panel>
    </div>
  );
}
type ReferralLink = { id: string; code: string; name: string; primary: boolean };
function StoreReferrals({
  storeId,
  userId,
  admin,
}: {
  storeId: string;
  userId: string;
  admin: boolean;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("all"),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  const links = useQuery({
    queryKey: ["store-referrals", userId, storeId],
    queryFn: () => storeRpc<ReferralLink[]>("store_referrals", { _store: storeId }),
    refetchInterval: 60000,
  });
  const report = useQuery({
    queryKey: ["store-referral-report", userId, storeId, selected],
    queryFn: () =>
      storeRpc<Metrics>("store_referral_metrics", {
        _store: storeId,
        _partner: selected === "all" ? null : selected,
      }),
    enabled: !!links.data,
    refetchInterval: 60000,
  });
  async function change(value: string, remove = false) {
    setBusy(true);
    try {
      let parsed = value.trim();
      if (/^https?:\/\//i.test(parsed)) {
        const url = new URL(parsed);
        const match = url.pathname.match(/^\/r\/([^/]+)\/?$/);
        if (!match) throw new Error("Use um link de indicação no formato /r/CODIGO.");
        parsed = decodeURIComponent(match[1]);
      }
      await storeRpc("store_link_referral", { _store: storeId, _code: parsed, _remove: remove });
      setCode("");
      setSelected("all");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["store-referrals"] }),
        qc.invalidateQueries({ queryKey: ["store-referral-report"] }),
        qc.invalidateQueries({ queryKey: ["store-portal"] }),
        qc.invalidateQueries({ queryKey: ["store-admin-list"] }),
      ]);
      toast.success(
        remove
          ? "Link desvinculado. O histórico do parceiro foi preservado."
          : "Link vinculado à loja.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o vínculo.");
    } finally {
      setBusy(false);
    }
  }
  const chosen = links.data?.find((l) => l.id === selected);
  return (
    <div className="space-y-5">
      <Panel title="Links de indicação">
        {links.isPending && <p>Carregando links…</p>}
        {links.error && (
          <p role="alert">Não foi possível carregar os links: {links.error.message}</p>
        )}
        {links.data && (
          <>
            <label className="text-sm font-semibold">
              Relatório
              <select
                className={inputClass}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="all">Todos os links — consolidado</option>
                {links.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              Escolha um link para ver seus números e QR Code. O consolidado conta cada cadastro uma
              vez, mesmo que apareça em mais de um link. Cliques são somados por link.
            </p>
            {admin && (
              <>
                <div className="mt-4 space-y-2">
                  {links.data.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                    >
                      <span>
                        <strong>{l.code}</strong> · {l.name}
                        {l.primary ? " · Principal" : ""}
                      </span>
                      {!l.primary && (
                        <button
                          className={secondaryClass}
                          disabled={busy}
                          onClick={() => void change(l.code, true)}
                        >
                          Desvincular
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void change(code);
                  }}
                >
                  <label className="text-sm font-semibold">
                    Adicionar link existente
                    <input
                      className={inputClass}
                      required
                      placeholder="Código ou https://sosmarceneiros.com.br/r/CODIGO"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <button className={buttonClass} disabled={busy}>
                    {busy ? "Salvando…" : "Vincular link"}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    O lojista terá acesso também ao histórico desse link. Apenas a administração
                    pode adicionar ou remover vínculos.
                  </p>
                </form>
              </>
            )}
          </>
        )}
      </Panel>
      {report.isPending && links.data && <p>Carregando relatório…</p>}
      {report.error && (
        <p role="alert">Não foi possível carregar o relatório: {report.error.message}</p>
      )}
      {!report.error && report.data && <Referral code={chosen?.code} metrics={report.data} />}
    </div>
  );
}

export function StorePortal({
  storeId,
  userId,
  manage = false,
  viewAs = false,
}: {
  storeId?: string;
  userId: string;
  manage?: boolean;
  viewAs?: boolean;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard"),
    [editing, setEditing] = useState<Contract | null | undefined>(),
    [upload, setUpload] = useState<{
      contract: Contract;
      week: Week;
      banner?: StoreBanner;
    }>(),
    [review, setReview] = useState<string>();
  const query = useQuery({
    queryKey: ["store-portal", userId, storeId || "self"],
    queryFn: () => storeRpc<Snapshot>("store_snapshot", { _store: storeId || null }),
    refetchInterval: 60_000,
  });
  async function refresh() {
    await query.refetch();
    await qc.invalidateQueries({ queryKey: ["store-admin-list"] });
  }
  async function logout() {
    await supabase.auth.signOut();
    qc.clear();
    window.location.assign("/auth");
  }
  if (query.isPending) return <div className="p-8 text-center">Abrindo Portal do Lojista…</div>;
  if (query.error || !query.data)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-xl font-bold">Portal do Lojista</h1>
        <p>{query.error?.message || "Não foi possível abrir o portal."}</p>
        <button className={secondaryClass} onClick={() => void query.refetch()}>
          Tentar novamente
        </button>{" "}
        <button className={secondaryClass} onClick={() => void logout()}>
          Sair
        </button>
        {(manage || viewAs) && (
          <a href="/app/admin/lojistas" className="block underline">
            Voltar para Administração
          </a>
        )}
      </main>
    );
  const s = query.data,
    admin = manage && s.admin,
    active = s.contracts.filter((c) => c.effective_status === "active"),
    current = active[0] || s.contracts[0];
  const conversion = s.metrics.clicks
    ? `${((s.metrics.registrations / s.metrics.clicks) * 100).toFixed(1)}%`
    : "0%";
  const bannerList =
    tab === "history"
      ? s.banners.filter((b) =>
          s.contracts.some(
            (c) => c.id === b.contract_id && ["ended", "cancelled"].includes(c.effective_status),
          ),
        )
      : s.banners;
  const days = current
    ? Math.max(0, Math.ceil((Date.parse(current.end_date) - Date.parse(s.today)) / 86400000) + 1)
    : 0;
  function weeks(c: Contract) {
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {c.weeks.map((w) => {
          const matches = s.banners.filter(
            (b) => b.contract_id === c.id && b.week_number === w.number,
          );
          const open =
            c.effective_status === "active" && s.store.status === "active" && w.end_date >= s.today;
          return (
            <div key={w.number} className="rounded-xl border border-border p-4">
              <p className="font-bold">
                Semana {w.number}
                {w.start_date <= s.today && w.end_date >= s.today ? " · Atual" : ""}
              </p>
              <p className="my-1 text-xs text-muted-foreground">
                {dateLabel(w.start_date)} — {dateLabel(w.end_date)}
              </p>
              <p className="mb-2 text-sm">
                {w.used} de {c.banners_per_week} vagas ocupadas
              </p>
              <div className="mb-3 flex flex-wrap gap-1">
                {matches.map((b) => (
                  <Badge key={b.id} status={b.effective_status} />
                ))}
              </div>
              {open && w.used < c.banners_per_week && (
                <button
                  className={secondaryClass}
                  onClick={() => {
                    setTab("banners");
                    setUpload({ contract: c, week: w });
                  }}
                >
                  Adicionar banner
                </button>
              )}
              {open &&
                matches
                  .filter((b) => b.approval !== "approved")
                  .map((b) => (
                    <button
                      key={b.id}
                      className={`${secondaryClass} mb-2 w-full`}
                      onClick={() => {
                        setTab("banners");
                        setUpload({ contract: c, week: w, banner: b });
                      }}
                    >
                      {b.submitted ? "Substituir" : "Continuar envio"}: {b.title || "Banner"}
                    </button>
                  ))}
            </div>
          );
        })}
      </div>
    );
  }
  function contractPanel(c: Contract) {
    const bs = s.banners.filter((b) => b.contract_id === c.id);
    return (
      <Panel key={c.id} title={c.name}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge status={c.effective_status} />
          {admin && (
            <button className={secondaryClass} onClick={() => setEditing(c)}>
              Editar contrato
            </button>
          )}
        </div>
        <p className="mt-3 text-sm">
          {dateLabel(c.start_date)} até {dateLabel(c.end_date)} · {c.segment}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {c.region || "Campanha"} · {[...c.cities, ...c.states].join("; ") || "Todo o Brasil"}
        </p>
        {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{c.notes}</p>}
        <div className="mt-4">
          <Stats
            items={[
              ["Banners contratados", c.weeks.length * c.banners_per_week],
              ["Enviados", bs.filter((b) => b.submitted).length],
              ["Aprovados", bs.filter((b) => b.approval === "approved").length],
              ["Pendentes", bs.filter((b) => b.submitted && b.approval === "pending").length],
              ["Reprovados", bs.filter((b) => b.approval === "rejected").length],
              ["Expirados", bs.filter((b) => b.effective_status === "expired").length],
              ["Visualizações", bs.reduce((n, b) => n + b.views, 0)],
              ["Cliques nos banners", bs.reduce((n, b) => n + b.clicks, 0)],
            ]}
          />
        </div>
        {["ended", "cancelled"].includes(c.effective_status) && (
          <p className="mt-4 text-sm">
            Cadastros pelo link no período: <strong>{c.metrics.registrations}</strong>. Esta
            contagem é por loja e período; campanhas simultâneas podem compartilhar os mesmos
            cadastros.
          </p>
        )}
        {weeks(c)}
      </Panel>
    );
  }
  return (
    <main className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
        {viewAs && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-100 p-4 text-amber-950">
            <strong>Visualizando como: {s.store.nome}</strong>
            <a href={`/app/admin/lojistas?store=${s.store.id}`} className="font-bold underline">
              Voltar para Administração
            </a>
          </div>
        )}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-primary">
              SOS Marceneiros · {admin ? "Administração" : "Portal do Lojista"}
            </p>
            <h1 className="mt-1 text-3xl font-black">{s.store.nome}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.store.profile.city || "Sua parceria com o SOS Marceneiros"}{" "}
              {s.store.profile.state && `/ ${s.store.profile.state}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={s.store.status} />
            {admin ? (
              <>
                <a className={secondaryClass} href="/app/admin/lojistas">
                  Todas as lojas
                </a>
                <a className={buttonClass} href={`/lojista?store=${s.store.id}`}>
                  Acessar visão da empresa
                </a>
              </>
            ) : (
              !viewAs && (
                <button className={secondaryClass} onClick={() => void logout()}>
                  Sair
                </button>
              )
            )}
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Portal do Lojista">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setUpload(undefined);
                setEditing(undefined);
              }}
              className={`shrink-0 ${tab === key ? buttonClass : secondaryClass}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {query.isRefetchError && (
          <p role="alert" className="text-sm text-destructive">
            Falha ao atualizar. As informações exibidas podem estar desatualizadas.
          </p>
        )}
        {tab === "dashboard" && (
          <>
            <Stats
              items={[
                ["Contrato atual", active[0]?.name || "Nenhum ativo"],
                ["Dias restantes", active.length ? days : 0],
                [
                  "Banners enviados",
                  current
                    ? `${s.banners.filter((b) => b.contract_id === current.id && b.submitted).length} de ${current.weeks.length * current.banners_per_week}`
                    : "0",
                ],
                ["Cliques no link", s.metrics.clicks],
                ["Cadastros", s.metrics.registrations],
                ["Conversão do link", conversion],
              ]}
            />
            {!active.length && (
              <Panel>
                <p>
                  Você não possui uma campanha de publicidade ativa no momento. Entre em contato com
                  o SOS Marceneiros para contratar uma nova campanha.
                </p>
              </Panel>
            )}
            {admin && (
              <button className={buttonClass} onClick={() => setEditing(null)}>
                Criar contrato
              </button>
            )}
            {editing !== undefined && (
              <ContractForm
                key={editing?.id || "new"}
                storeId={s.store.id}
                contract={editing || undefined}
                done={refresh}
                cancel={() => setEditing(undefined)}
              />
            )}
            <div className="space-y-4">
              {s.contracts
                .filter((c) => !["ended", "cancelled"].includes(c.effective_status))
                .map(contractPanel)}
            </div>
            {admin && (
              <Panel title="Ficha da empresa">
                <p className="text-sm">
                  Login: {s.store.login} · Criada em {dateLabel(s.store.created_at)}
                </p>
                <p className="mt-2 text-sm">
                  Responsável: {s.store.profile.responsible_name || "—"} · CNPJ:{" "}
                  {s.store.profile.cnpj || "—"}
                </p>
                <p className="mt-2 text-sm">
                  Telefone: {s.store.profile.phone || "—"} · WhatsApp:{" "}
                  {s.store.profile.whatsapp || "—"}
                </p>
              </Panel>
            )}
          </>
        )}
        {tab === "profile" && (
          <>
            {s.store.profile.logo_path && (
              <div className="max-w-48">
                <StoreImage path={s.store.profile.logo_path} />
              </div>
            )}
            <ProfileForm key={s.store.id} store={s.store} admin={admin} done={refresh} />
            {admin && <SettingsForm store={s.store} done={refresh} />}
            <StoreReferrals storeId={s.store.id} userId={userId} admin={admin} />
          </>
        )}
        {tab === "referral" && (
          <StoreReferrals storeId={s.store.id} userId={userId} admin={admin} />
        )}
        {tab === "history" && (
          <>
            {s.contracts
              .filter((c) => ["ended", "cancelled"].includes(c.effective_status))
              .map(contractPanel)}
            {!s.contracts.some((c) => ["ended", "cancelled"].includes(c.effective_status)) && (
              <Panel>Nenhuma campanha encerrada.</Panel>
            )}
          </>
        )}
        {tab === "banners" && (
          <>
            {upload && (
              <UploadForm
                key={`${upload.contract.id}-${upload.week.number}-${upload.banner?.id || "new"}`}
                {...upload}
                done={refresh}
                cancel={() => setUpload(undefined)}
              />
            )}
            <div className="space-y-4">
              {active.map((c) => (
                <Panel key={c.id} title={c.name}>
                  {weeks(c)}
                </Panel>
              ))}
            </div>
            {!active.length && (
              <Panel>
                Você não possui uma campanha de publicidade ativa no momento. Entre em contato com o
                SOS Marceneiros para contratar uma nova campanha.
              </Panel>
            )}
          </>
        )}
        {["banners", "history", "library"].includes(tab) && (
          <div className="grid gap-4 md:grid-cols-2">
            {bannerList.map((b) => (
              <Panel key={b.id}>
                <StoreImage path={b.image_path} />
                <div className="my-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{b.title || "Envio incompleto"}</h3>
                  <Badge status={b.effective_status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.contracts.find((c) => c.id === b.contract_id)?.name} · Semana {b.week_number}
                </p>
                <p className="mt-2 text-sm">
                  {dateLabel(b.start_date)} até {dateLabel(b.end_date)} ·{" "}
                  {b.format === "vertical" ? "Abertura" : "Página inicial"}
                </p>
                <p className="mt-1 text-sm">
                  {b.segment} · {b.region || "Sem nome de região"} ·{" "}
                  {[...b.cities, ...b.states].join("; ") || "Todo o Brasil"}
                </p>
                {b.destination_url && (
                  <a
                    href={b.destination_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block break-all text-sm underline"
                  >
                    {b.destination_url}
                  </a>
                )}
                <p className="mt-3 text-sm">
                  {b.views} visualizações · {b.clicks} cliques
                </p>
                {b.rejection_reason && (
                  <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">
                    Motivo: {b.rejection_reason}
                  </p>
                )}
                {admin && b.submitted && (
                  <button className={`${secondaryClass} mt-3`} onClick={() => setReview(b.id)}>
                    Avaliar banner
                  </button>
                )}
                {admin && review === b.id && (
                  <ReviewForm banner={b} done={refresh} cancel={() => setReview(undefined)} />
                )}
              </Panel>
            ))}
          </div>
        )}
        {tab === "library" && (
          <Panel title="Versões anteriores">
            <p className="mb-4 text-sm text-muted-foreground">
              Os arquivos substituídos permanecem no histórico da empresa.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {s.history
                .filter((h) => h.action === "replacement" && h.snapshot.image_path)
                .map((h) => (
                  <div key={h.id}>
                    <StoreImage path={h.snapshot.image_path} />
                    <p className="mt-2 text-sm">
                      {h.snapshot.title || "Banner"} · {dateLabel(h.created_at)}
                    </p>
                  </div>
                ))}
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}
