import { useState, type ReactNode } from "react";
import type { Snapshot, Contract, StoreBanner, Week } from "@/lib/store-portal";
import { dateLabel } from "@/lib/store-portal";
import { Panel, Badge, StoreImage, buttonClass, secondaryClass } from "./ui";
import { SimpleUpload } from "./simple-upload";
export function BannerMetrics({ banner }: { banner: Pick<StoreBanner, "views" | "clicks"> }) {
  const views = Number(banner.views || 0),
    clicks = Number(banner.clicks || 0);
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-secondary p-3 text-center">
      {[
        ["Visualizações", views.toLocaleString("pt-BR")],
        ["Cliques", clicks.toLocaleString("pt-BR")],
        [
          "Conversão (CTR)",
          `${(views ? (clicks / views) * 100 : 0).toFixed(1).replace(".", ",")}%`,
        ],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-[10px] sm:text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-lg font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function BannerCard({
  banner,
  previous = false,
  children,
}: {
  banner: StoreBanner;
  previous?: boolean;
  children?: ReactNode;
}) {
  return (
    <Panel>
      <StoreImage path={banner.image_path} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{banner.title || "Banner da loja"}</h3>
        {previous ? (
          <span className="text-xs text-muted-foreground">Banner anterior</span>
        ) : (
          <Badge status={banner.effective_status} />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {dateLabel(banner.start_date)} a {dateLabel(banner.end_date)}
      </p>
      {banner.destination_url && (
        <a
          className="mt-2 inline-block text-sm font-semibold underline"
          href={banner.destination_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir link do banner
        </a>
      )}
      <BannerMetrics banner={banner} />
      {banner.rejection_reason && (
        <p className="mt-3 text-sm text-destructive">{banner.rejection_reason}</p>
      )}
      {children}
    </Panel>
  );
}
export function SimpleStorePortal({
  snapshot: s,
  refresh,
  logout,
  viewAs,
  reports,
  refreshError,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  viewAs: boolean;
  reports: ReactNode;
  refreshError: boolean;
}) {
  const [upload, setUpload] = useState<{ contract: Contract; week: Week; banner?: StoreBanner }>();
  const active = s.contracts.filter((c) => c.effective_status === "active");
  const previous = s.banners.filter(
    (b) =>
      b.end_date < s.today ||
      s.contracts.some(
        (c) => c.id === b.contract_id && ["ended", "cancelled"].includes(c.effective_status),
      ),
  );
  const previousIds = new Set(previous.map((b) => b.id));
  const current = s.banners.filter((b) => !previousIds.has(b.id));
  // A replacement snapshot contains the image and frozen counters of that version.
  const history = s.history.filter(
    (h) => h.action === "replacement" && h.snapshot.image_path && h.snapshot.submitted,
  );
  const openBanner = (b: StoreBanner) => {
    const contract = active.find((c) => c.id === b.contract_id);
    const week = contract?.weeks.find((w) => w.number === b.week_number && w.end_date >= s.today);
    if (contract && week) setUpload({ contract, week, banner: b });
  };
  return (
    <main className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8">
        {viewAs && (
          <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">
            Visão da loja ·{" "}
            <a className="font-bold underline" href={`/app/admin/lojistas?store=${s.store.id}`}>
              Voltar à administração
            </a>
          </p>
        )}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-primary">SOS Marceneiros · Loja parceira</p>
            <h1 className="mt-1 text-2xl font-black">{s.store.nome}</h1>
          </div>
          {!viewAs && (
            <button className={secondaryClass} onClick={() => void logout()}>
              Sair
            </button>
          )}
        </header>
        {refreshError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível atualizar os resultados.{" "}
            <button onClick={() => void refresh()} className="underline">
              Tentar novamente
            </button>
          </p>
        )}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Seus banners</h2>
            <div className="flex flex-wrap gap-2">
              {active.map((contract) => {
                const week = contract.weeks.find(
                  (w) => w.start_date <= s.today && w.end_date >= s.today,
                );
                if (!week || s.store.status !== "active") return null;
                const banner =
                  week.used >= contract.banners_per_week
                    ? current.find(
                        (b) => b.contract_id === contract.id && b.week_number === week.number,
                      )
                    : undefined;
                return (
                  <button
                    key={contract.id}
                    disabled={!s.store.whatsapp_phone}
                    className={buttonClass}
                    onClick={() => setUpload({ contract, week, banner })}
                  >
                    Adicionar novo banner{active.length > 1 ? ` · ${contract.name}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
          {!s.store.whatsapp_phone && (
            <Panel>
              O administrador precisa configurar o WhatsApp da loja para liberar novos envios.
            </Panel>
          )}
          {!active.length && (
            <Panel>Entre em contato com o SOS Marceneiros para ativar sua campanha.</Panel>
          )}
          {upload && (
            <SimpleUpload
              key={`${upload.contract.id}-${upload.week.number}-${upload.banner?.id || "new"}`}
              {...upload}
              store={s.store}
              done={refresh}
              cancel={() => setUpload(undefined)}
            />
          )}
          {!!current.length && (
            <div className={`grid gap-4 ${current.length > 1 ? "md:grid-cols-2" : ""}`}>
              {current.map((b) => (
                <BannerCard key={b.id} banner={b}>
                  {s.store.whatsapp_phone &&
                    s.store.status === "active" &&
                    active.some((c) => c.id === b.contract_id) &&
                    b.end_date >= s.today && (
                      <button className={`${secondaryClass} mt-3`} onClick={() => openBanner(b)}>
                        {b.submitted ? "Trocar banner" : "Continuar envio"}
                      </button>
                    )}
                </BannerCard>
              ))}
            </div>
          )}
          {!current.length && !upload && (
            <p className="text-sm text-muted-foreground">
              Nenhum banner atual. Envie sua primeira imagem acima.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Conversão (CTR): porcentagem de visualizações que geraram cliques no banner.
          </p>
        </section>
        {(previous.length > 0 || history.length > 0) && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Banners anteriores</h2>
            <div
              className={`grid gap-4 ${previous.length + history.length > 1 ? "md:grid-cols-2" : ""}`}
            >
              {previous.map((b) => (
                <BannerCard key={b.id} banner={b} previous />
              ))}
              {history.map((h) => (
                <BannerCard key={h.id} banner={h.snapshot} previous />
              ))}
            </div>
          </section>
        )}
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-xl font-bold">Resultados dos seus links</h2>
          {reports}
        </section>
      </div>
    </main>
  );
}
