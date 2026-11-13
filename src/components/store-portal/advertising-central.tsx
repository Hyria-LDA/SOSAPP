import { signBannerPaths } from "@/lib/banner-images";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { storeRpc, statusNames } from "@/lib/store-portal";
import { Panel, inputClass, buttonClass } from "./ui";
import { CampaignRequests } from "./campaign-requests";
type Row = {
  image: string;
  source: string;
  id: string;
  store_id: string;
  name: string;
  title: string;
  kind: string;
  region: string;
  start_date: string;
  end_date: string;
  status: string;
  paused: boolean;
  format: string;
  views: number;
  clicks: number;
};
type Settings = { enabled: boolean; fallback: string; fallback_banner: string | null };
export function AdvertisingCentral() {
  const [client, setClient] = useState(""),
    [region, setRegion] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useQuery({
    queryKey: ["advertising-central"],
    queryFn: () => storeRpc<Row[]>("advertising_admin_list"),
  });
  const images = useQuery({
    queryKey: ["advertising-images", rows.data?.map((r) => r.image)],
    enabled: !!rows.data,
    queryFn: () => signBannerPaths((rows.data || []).map((r) => r.image)),
    refetchInterval: 240000,
  });
  const settings = useQuery({
    queryKey: ["advertising-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banner_delivery_settings" as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as Settings;
    },
  });
  const audit = useQuery({
    queryKey: ["advertising-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertising_audit" as never)
        .select("id,entity,actor_id,action,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as {
        id: number;
        entity: string;
        actor_id: string;
        action: string;
        created_at: string;
      }[];
    },
  });
  async function saveSettings(value: Settings) {
    setBusy(true);
    try {
      await storeRpc("advertising_delivery_save", {
        _enabled: value.enabled,
        _fallback: value.fallback,
        _banner: value.fallback_banner,
      });
      await settings.refetch();
      await audit.refetch();
      toast.success("Distribuição salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }
  async function configure(row: Row, nextKind: string, paused: boolean) {
    setBusy(true);
    try {
      await storeRpc("advertising_configure", {
        _source: row.source,
        _id: row.id,
        _kind: nextKind,
        _paused: paused,
      });
      await rows.refetch();
      await audit.refetch();
      toast.success("Campanha atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }
  const filtered = (rows.data || []).filter(
    (r) =>
      (!client || r.store_id === client) &&
      (!region || r.region.toLocaleLowerCase().includes(region.toLocaleLowerCase())) &&
      (!kind || r.kind === kind) &&
      (!status || r.status === status) &&
      (!from || !r.end_date || r.end_date.slice(0, 10) >= from) &&
      (!to || !r.start_date || r.start_date.slice(0, 10) <= to),
  );
  return (
    <div className="my-6 space-y-5">
      <Panel title="Distribuição na página inicial">
        <p className="mb-3 text-sm">
          Quatro anúncios regionais e um nacional, sorteados entre os elegíveis. As posições
          continuam no carrossel atual. Banners de abertura seguem separados.
        </p>
        {settings.error && (
          <p role="alert">Configuração indisponível. Confira a migração do Supabase.</p>
        )}
        {settings.data && (
          <div className="space-y-3">
            <label className="flex gap-2">
              <input
                type="checkbox"
                disabled={busy}
                checked={settings.data.enabled}
                onChange={(e) =>
                  void saveSettings({ ...settings.data!, enabled: e.target.checked })
                }
              />
              Ativar distribuição de 4 regionais + 1 nacional
            </label>
            <label className="block">
              Se não houver campanha nacional
              <select
                className={inputClass}
                disabled={busy}
                value={settings.data.fallback_banner || ""}
                onChange={(e) =>
                  void saveSettings({
                    ...settings.data!,
                    fallback: e.target.value ? "institutional" : "hide",
                    fallback_banner: e.target.value || null,
                  })
                }
              >
                <option value="">Ocultar posição nacional</option>
                {rows.data
                  ?.filter(
                    (r) =>
                      r.source === "legacy" &&
                      r.kind === "institutional" &&
                      r.format === "horizontal" &&
                      r.status === "published",
                  )
                  .map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name} · {r.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </Panel>
      <Panel title="Campanhas de todos os anunciantes">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            Cliente
            <select
              className={inputClass}
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">Todos</option>
              {[
                ...new Map(
                  (rows.data || []).filter((r) => r.store_id).map((r) => [r.store_id, r.name]),
                ).entries(),
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Região / UF
            <input
              className={inputClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Cidade ou UF"
            />
          </label>
          <label>
            Tipo
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos</option>
              <option value="regional">Regional</option>
              <option value="global">Nacional</option>
              <option value="institutional">Institucional</option>
            </select>
          </label>
          <label>
            Situação
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todas</option>
              {[
                "draft",
                "pending",
                "approved",
                "published",
                "paused",
                "rejected",
                "expired",
                "scheduled",
              ].map((s) => (
                <option key={s} value={s}>
                  {statusNames[s] || s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Período a partir de
            <input
              type="date"
              className={inputClass}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              className={inputClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        {rows.error && <p role="alert">Não foi possível carregar as campanhas.</p>}
        <p className="my-3 text-sm">{filtered.length} campanhas encontradas</p>
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((r) => (
            <article key={`${r.source}:${r.id}`} className="space-y-2 rounded-xl border p-4">
              <>
                {images.data?.[r.image] && (
                  <img
                    loading="lazy"
                    src={images.data[r.image]}
                    alt={r.title || "Banner"}
                    className="max-h-40 w-full rounded-xl object-contain"
                  />
                )}
              </>
              <h3 className="font-bold">
                {r.name} · {r.title || "Banner"}
              </h3>
              <p>
                {statusNames[r.status] || r.status} ·{" "}
                {r.format === "vertical"
                  ? "Abertura"
                  : r.kind === "regional"
                    ? "Posições regionais 1–4"
                    : "Posição nacional 5"}
              </p>
              <p className="text-sm">
                {r.region || "Todo o Brasil"}
                <br />
                {r.start_date?.slice(0, 10) || "Sem início definido"} →{" "}
                {r.end_date?.slice(0, 10) || "Sem fim definido"}
              </p>
              <p className="text-sm">
                {r.views} visualizações · {r.clicks} cliques ·{" "}
                {r.views ? ((r.clicks / r.views) * 100).toFixed(1) : "0"}% de cliques
              </p>
              <label className="block">
                Abrangência
                <select
                  className={inputClass}
                  disabled={busy}
                  value={r.kind}
                  onChange={(e) => void configure(r, e.target.value, r.paused)}
                >
                  <option value="regional">Regional</option>
                  <option value="global">Nacional</option>
                  {r.source === "legacy" && (
                    <option value="institutional">Institucional (fallback)</option>
                  )}
                </select>
              </label>
              {r.source === "store" ? (
                <>
                  <p className="text-xs">
                    A abrangência é compartilhada pelos banners do mesmo contrato.
                  </p>
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void configure(r, r.kind, !r.paused)}
                  >
                    {r.paused ? "Retomar banner" : "Pausar banner"}
                  </button>
                  <a
                    className="block text-primary underline"
                    href={`/app/admin/lojistas?store=${r.store_id}`}
                  >
                    Editar contrato, regiões ou aprovar banner
                  </a>
                </>
              ) : (
                <p className="text-sm">
                  Edite imagem, datas e regiões na aba “Banners existentes”, na pasta {r.name}.
                </p>
              )}
            </article>
          ))}
        </div>
      </Panel>
      <CampaignRequests admin />
      <Panel title="Histórico administrativo recente">
        {audit.error && <p role="alert">Não foi possível carregar o histórico.</p>}
        {audit.data?.map((a) => (
          <p className="break-words border-b py-2 text-xs" key={a.id}>
            {new Date(a.created_at).toLocaleString("pt-BR")} · {a.entity} · {a.action} ·
            Responsável: {a.actor_id || "Sistema"}
          </p>
        ))}
      </Panel>
    </div>
  );
}
