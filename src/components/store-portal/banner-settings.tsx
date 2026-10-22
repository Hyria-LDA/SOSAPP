import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { storeRpc, storeAdminAction, type Store } from "@/lib/store-portal";
import { parseStoreWhatsappUrl, storeWhatsappUrl, DEFAULT_STORE_INTRO } from "@/lib/store-whatsapp";
import { Panel, Field, inputClass, buttonClass, secondaryClass } from "./ui";
export function BannerSettings({ store, done }: { store: Store; done: () => Promise<unknown> }) {
  const [base, setBase] = useState(
    store.whatsapp_phone
      ? storeWhatsappUrl(store.whatsapp_phone, store.whatsapp_intro || DEFAULT_STORE_INTRO)
      : "",
  );
  const [format, setFormat] = useState(store.banner_format || "horizontal");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { phone, intro } = parseStoreWhatsappUrl(base);
      await storeRpc("store_save_banner_settings", {
        _store: store.id,
        _phone: phone,
        _intro: intro,
        _format: format,
      });
      await done();
      toast.success("WhatsApp e posição dos próximos banners salvos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="WhatsApp dos banners">
      <form onSubmit={save} className="space-y-4">
        <Field label="Parte inicial do link do WhatsApp">
          <input
            type="url"
            required
            className={inputClass}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="https://wa.me/55DDDNUMERO?text=Ol%C3%A1%20vim%20pelo%20app%20SOS%20MARCENEIROS%20"
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          Use o número desta loja. O lojista só poderá completar a mensagem da promoção. Banners já
          enviados mantêm o link anterior.
        </p>
        <Field label="Posição dos próximos banners">
          <select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="horizontal">Página inicial</option>
            <option value="vertical">Abertura</option>
          </select>
        </Field>
        <button disabled={busy} className={buttonClass}>
          {busy ? "Salvando…" : "Salvar WhatsApp"}
        </button>
      </form>
    </Panel>
  );
}
export function DeleteStoreUser({ store }: { store: Store }) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  async function remove(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== store.login || busy) return;
    setBusy(true);
    try {
      await storeAdminAction({ action: "delete_user", store_id: store.id, confirmation });
      toast.success("Usuário excluído. Histórico da loja preservado.");
      window.location.assign("/app/admin/lojistas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Excluir usuário da loja">
      {!open ? (
        <button
          type="button"
          className={secondaryClass + " text-destructive"}
          onClick={() => setOpen(true)}
        >
          Excluir usuário
        </button>
      ) : (
        <form onSubmit={remove} className="space-y-3">
          <p className="text-sm">
            Esta ação exclui o login de <strong>{store.nome}</strong> e desativa o acesso e os
            banners do portal. O histórico dos banners e seus resultados será preservado.
          </p>
          <Field label={`Digite ${store.login} para confirmar`}>
            <input
              autoComplete="off"
              required
              className={inputClass}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || confirmation !== store.login}
              className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-50"
            >
              {busy ? "Excluindo…" : "Excluir usuário definitivamente"}
            </button>
            <button
              type="button"
              disabled={busy}
              className={secondaryClass}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
