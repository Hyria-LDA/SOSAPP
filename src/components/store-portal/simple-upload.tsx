import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  storeRpc,
  imageExtension,
  type Store,
  type Contract,
  type StoreBanner,
  type Week,
} from "@/lib/store-portal";
import { storeWhatsappUrl, STORE_MESSAGE_EXAMPLE, DEFAULT_STORE_INTRO } from "@/lib/store-whatsapp";
import { Panel, Field, inputClass, buttonClass, secondaryClass } from "./ui";
export function SimpleUpload({
  store,
  contract,
  week,
  banner,
  done,
  cancel,
}: {
  store: Store;
  contract: Contract;
  week: Week;
  banner?: StoreBanner;
  done: () => Promise<unknown>;
  cancel: () => void;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reserved, setReserved] = useState(banner?.id);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const intro = store.whatsapp_intro || DEFAULT_STORE_INTRO;
  const link = store.whatsapp_phone ? storeWhatsappUrl(store.whatsapp_phone, intro, message) : "";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!file || !link || busy) return;
    setBusy(true);
    try {
      const extension = imageExtension(file);
      const slot = await storeRpc<StoreBanner>("store_reserve_banner", {
        _contract: contract.id,
        _week: week.number,
        _banner: reserved || null,
        _extension: extension,
      });
      setReserved(slot.id);
      const { error } = await supabase.storage
        .from("store-media")
        .upload(slot.image_path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      await storeRpc("store_submit_simple_banner", { _banner: slot.id, _message: message });
      await done();
      cancel();
      toast.success("Banner enviado para aprovação.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o banner.");
      await done();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Adicionar novo banner">
      <form onSubmit={save} className="space-y-4">
        <Field label="Imagem do banner (JPG, PNG ou WebP, até 10 MB)">
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            className={inputClass}
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </Field>
        {preview && (
          <img
            src={preview}
            alt="Prévia do novo banner"
            className="max-h-64 w-full rounded-xl object-contain"
          />
        )}
        <Field label="Complete a mensagem do WhatsApp">
          <textarea
            maxLength={300}
            disabled={busy}
            className={inputClass}
            placeholder={STORE_MESSAGE_EXAMPLE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <div className="rounded-xl bg-secondary p-4 text-sm">
          <p className="font-bold">Assim ficará a mensagem:</p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            {intro} {message || STORE_MESSAGE_EXAMPLE}
          </p>
          {!message && (
            <p className="mt-2 text-xs text-muted-foreground">
              A continuação acima é um exemplo. Digite a mensagem da sua promoção.
            </p>
          )}
          {link && (
            <a
              className="mt-3 inline-block font-semibold underline"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Testar link do WhatsApp
            </a>
          )}
        </div>
        {!link && <p role="alert">Solicite ao administrador a configuração do WhatsApp da loja.</p>}
        <p className="text-xs text-muted-foreground">
          {banner?.submitted
            ? "O banner anterior sairá de exibição e ficará no histórico com seus resultados. "
            : ""}
          O novo banner será publicado após aprovação.
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !link} className={buttonClass}>
            {busy ? "Enviando…" : "Enviar banner"}
          </button>
          <button disabled={busy} type="button" className={secondaryClass} onClick={cancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
