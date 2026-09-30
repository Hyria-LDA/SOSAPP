import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  storeRpc,
  storeAdminAction,
  profileFields,
  splitPlaces,
  imageExtension,
  type Store,
  type Contract,
  type StoreBanner,
  type Week,
} from "@/lib/store-portal";
import { Panel, Field, inputClass, buttonClass, secondaryClass } from "./ui";
type Done = () => Promise<unknown> | void;
function message(e: unknown) {
  return e instanceof Error ? e.message : "Não foi possível salvar.";
}
export function ProfileForm({
  store,
  admin,
  done,
}: {
  store: Store;
  admin: boolean;
  done: Done;
}) {
  const [values, setValues] = useState(store.profile);
  const [busy, setBusy] = useState(false);
  const can = (k: string) => admin || store.editable_fields.includes(k);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await storeRpc("store_save_profile", {
        _store: store.id,
        _profile: Object.fromEntries(
          Object.entries(values).filter(([k]) => can(k)),
        ),
      });
      await done();
      toast.success("Dados salvos.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function logo(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const ext = imageExtension(file);
      const path = `${store.id}/logo/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("store-media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      await storeRpc("store_save_profile", {
        _store: store.id,
        _profile: { logo_path: path },
      });
      setValues((v) => ({ ...v, logo_path: path }));
      await done();
      toast.success("Logo atualizado.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Dados da empresa">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(profileFields)
            .filter(([k]) => k !== "logo_path")
            .map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  className={inputClass}
                  value={values[k] || ""}
                  disabled={!can(k) || busy}
                  maxLength={500}
                  type={["website", "instagram"].includes(k) ? "url" : "text"}
                  placeholder={
                    ["website", "instagram"].includes(k)
                      ? "https://…"
                      : undefined
                  }
                  onChange={(e) =>
                    setValues({ ...values, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
        </div>
        {can("logo_path") && (
          <Field label="Alterar logo (JPG, PNG ou WebP, até 10 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              className={inputClass}
              onChange={(e) => void logo(e.target.files?.[0])}
            />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">
          Campos bloqueados são alterados pelo SOS Marceneiros.
        </p>
        <button className={buttonClass} disabled={busy}>
          {busy ? "Salvando…" : "Salvar dados"}
        </button>
      </form>
    </Panel>
  );
}
export function SettingsForm({ store, done }: { store: Store; done: Done }) {
  const [name, setName] = useState(store.nome),
    [status, setStatus] = useState(store.status),
    [fields, setFields] = useState(store.editable_fields),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await storeRpc("store_admin_settings", {
        _store: store.id,
        _name: name,
        _status: status,
        _fields: fields,
      });
      await done();
      toast.success("Acesso atualizado.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await storeAdminAction({
        action: "reset_password",
        store_id: store.id,
        password,
      });
      setPassword("");
      toast.success("Senha redefinida. Entregue a nova senha ao responsável.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Acesso e permissões">
      <form onSubmit={save} className="space-y-4">
        <Field label="Nome fantasia">
          <input
            required
            maxLength={120}
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Acesso ao portal">
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Ativo</option>
            <option value="inactive">
              Inativo — suspender acesso e publicidade
            </option>
          </select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">
            Campos que o lojista pode editar
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(profileFields).map(([k, label]) => (
              <label key={k} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fields.includes(k)}
                  onChange={(e) =>
                    setFields(
                      e.target.checked
                        ? [...fields, k]
                        : fields.filter((v) => v !== k),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={busy} className={buttonClass}>
          Salvar permissões
        </button>
      </form>
      <form onSubmit={reset} className="mt-6 space-y-3 border-t pt-5">
        <p className="text-sm">
          Login: <strong>{store.login}</strong>
        </p>
        <Field label="Nova senha (mínimo 12 caracteres)">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <button disabled={busy} className={secondaryClass}>
          Redefinir senha
        </button>
      </form>
    </Panel>
  );
}
export function ContractForm({
  storeId,
  contract,
  done,
  cancel,
}: {
  storeId: string;
  contract?: Contract;
  done: Done;
  cancel: () => void;
}) {
  const [values, setValues] = useState({
    id: contract?.id,
    name: contract?.name || "",
    start_date: contract?.start_date || "",
    end_date: contract?.end_date || "",
    segment: contract?.segment || "",
    region: contract?.region || "",
    cities: contract?.cities.join("; ") || "",
    states: contract?.states.join("; ") || "",
    banners_per_week: contract?.banners_per_week || 1,
    status: contract?.status || "enabled",
    notes: contract?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await storeRpc("store_save_contract", {
        _store: storeId,
        _data: {
          ...values,
          cities: splitPlaces(values.cities),
          states: splitPlaces(values.states),
        },
      });
      await done();
      cancel();
      toast.success("Contrato salvo.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={contract ? "Editar contrato" : "Novo contrato"}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["name", "Nome do contrato"],
            ["start_date", "Início"],
            ["end_date", "Término"],
            ["segment", "Segmento"],
            ["region", "Nome da região"],
            ["cities", "Cidades: Belo Horizonte/MG; Contagem/MG"],
            ["states", "Estados inteiros: MG; SP"],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                className={inputClass}
                required={[
                  "name",
                  "start_date",
                  "end_date",
                  "segment",
                ].includes(k)}
                type={k.endsWith("date") ? "date" : "text"}
                value={String(values[k as keyof typeof values] || "")}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Banners por semana">
            <input
              type="number"
              min={1}
              max={20}
              required
              className={inputClass}
              value={values.banners_per_week}
              onChange={(e) =>
                setValues({
                  ...values,
                  banners_per_week: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={values.status}
              onChange={(e) => setValues({ ...values, status: e.target.value })}
            >
              <option value="enabled">Automático pelas datas</option>
              <option value="suspended">Suspenso</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea
            className={inputClass}
            value={values.notes}
            onChange={(e) => setValues({ ...values, notes: e.target.value })}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Sem cidades e estados, a campanha é nacional. Cidades devem incluir
          /UF. Estados incluem todas as suas cidades. As semanas começam na data
          inicial do contrato. Após o primeiro envio, datas e limite ficam
          protegidos.
        </p>
        <div className="flex gap-2">
          <button disabled={busy} className={buttonClass}>
            Salvar contrato
          </button>
          <button type="button" onClick={cancel} className={secondaryClass}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
export function UploadForm({
  contract,
  week,
  banner,
  done,
  cancel,
}: {
  contract: Contract;
  week: Week;
  banner?: StoreBanner;
  done: Done;
  cancel: () => void;
}) {
  const [file, setFile] = useState<File>(),
    [title, setTitle] = useState(banner?.title || ""),
    [url, setUrl] = useState(banner?.destination_url || ""),
    [format, setFormat] = useState(banner?.format || "horizontal"),
    [busy, setBusy] = useState(false),
    [reserved, setReserved] = useState(banner?.id);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const ext = imageExtension(file);
      const slot = await storeRpc<StoreBanner>("store_reserve_banner", {
        _contract: contract.id,
        _week: week.number,
        _banner: reserved || null,
        _extension: ext,
      });
      setReserved(slot.id);
      const { error } = await supabase.storage
        .from("store-media")
        .upload(slot.image_path, file, {
          upsert: false,
          contentType: file.type,
        });
      if (error) throw error;
      await storeRpc("store_submit_banner", {
        _banner: slot.id,
        _title: title,
        _url: url,
        _format: format,
      });
      await done();
      cancel();
      toast.success("Banner enviado para aprovação.");
    } catch (e) {
      toast.error(message(e));
      await done();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title={`${contract.name} · Semana ${week.number}`}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Título interno">
          <input
            required
            maxLength={120}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Link de destino (opcional)">
          <input
            type="url"
            placeholder="https://…"
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Posição">
          <select
            className={inputClass}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="horizontal">Horizontal — página inicial</option>
            <option value="vertical">Vertical — abertura</option>
          </select>
        </Field>
        <Field label="Imagem JPG, PNG ou WebP (até 10 MB)">
          <input
            required
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={inputClass}
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          O envio ocupa uma vaga nesta semana. Trocar uma imagem exige nova
          aprovação.
        </p>
        <div className="flex gap-2">
          <button disabled={busy} className={buttonClass}>
            {busy ? "Enviando…" : "Enviar para aprovação"}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={cancel}
            className={secondaryClass}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
export function ReviewForm({
  banner,
  done,
  cancel,
}: {
  banner: StoreBanner;
  done: Done;
  cancel: () => void;
}) {
  const [v, setV] = useState({
      approval: banner.approval === "rejected" ? "rejected" : "approved",
      rejection_reason: banner.rejection_reason || "",
      start_date: banner.start_date,
      end_date: banner.end_date,
      segment: banner.segment,
      region: banner.region,
      cities: banner.cities.join("; "),
      states: banner.states.join("; "),
    }),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await storeRpc("store_review_banner", {
        _banner: banner.id,
        _data: {
          ...v,
          cities: splitPlaces(v.cities),
          states: splitPlaces(v.states),
        },
      });
      await done();
      cancel();
      toast.success("Avaliação salva.");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="mt-4 space-y-3 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["start_date", "Início"],
          ["end_date", "Término"],
          ["segment", "Segmento"],
          ["region", "Região"],
          ["cities", "Cidades (Cidade/UF; Cidade/UF)"],
          ["states", "Estados inteiros (UF; UF)"],
        ].map(([k, label]) => (
          <Field key={k} label={label}>
            <input
              className={inputClass}
              type={k.endsWith("date") ? "date" : "text"}
              value={v[k as keyof typeof v]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A região do banner sempre respeita também os limites do contrato.
      </p>
      <Field label="Decisão">
        <select
          className={inputClass}
          value={v.approval}
          onChange={(e) => setV({ ...v, approval: e.target.value })}
        >
          <option value="approved">Aprovar</option>
          <option value="rejected">Reprovar</option>
        </select>
      </Field>
      {v.approval === "rejected" && (
        <Field label="Motivo da reprovação">
          <textarea
            required
            className={inputClass}
            value={v.rejection_reason}
            onChange={(e) => setV({ ...v, rejection_reason: e.target.value })}
          />
        </Field>
      )}
      <button disabled={busy} className={buttonClass}>
        Salvar avaliação
      </button>{" "}
      <button type="button" className={secondaryClass} onClick={cancel}>
        Fechar
      </button>
    </form>
  );
}
