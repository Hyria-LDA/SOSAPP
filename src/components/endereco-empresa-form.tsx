import { useRef, useState } from "react";
import { Loader2, MapPin, Search, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { geocodeAddress, lookupCep, osmEmbedUrl } from "@/lib/geocode";

export type EnderecoValue = {
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
};

const ESTADOS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none ring-primary/30 focus:ring-2";

export function EnderecoEmpresaForm({
  value,
  onChange,
  automaticLocation = false,
}: {
  automaticLocation?: boolean;
  value: EnderecoValue;
  onChange: (v: EnderecoValue) => void;
}) {
  const v = value;
  const latest = useRef(value);
  latest.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  const lookupId = useRef(0);
  const locationId = useRef(0);
  const cepPending = useRef(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(v.latitude != null && v.longitude != null);
  const [cepState, setCepState] = useState<"idle" | "found" | "failed">("idle");
  const [locationFailed, setLocationFailed] = useState(false);
  const set = <K extends keyof EnderecoValue>(k: K, val: EnderecoValue[K]) => {
    locationId.current++;
    setGeoLoading(false);
    setLocationFailed(false);
    if (k === "cep") {
      lookupId.current++;
      cepPending.current = false;
      setCepLoading(false);
      setCepState("idle");
    }
    const next = { ...latest.current, [k]: val, latitude: null, longitude: null };
    latest.current = next;
    onChange(next);
  };
  const markDirty = () => setConfirmed(false);

  const locate = async (address: EnderecoValue) => {
    if (automaticLocation && (!address.endereco.trim() || !address.numero.trim() || !address.cidade.trim() || !address.estado)) return;
    const id = ++locationId.current;
    setGeoLoading(true);
    setLocationFailed(false);
    try {
      const c = await geocodeAddress(address);
      if (id !== locationId.current) return;
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
        setLocationFailed(true);
        toast.error("Não conseguimos localizar este endereço. Confira os dados e tente novamente.");
        return;
      }
      const next = { ...latest.current, latitude: c.lat, longitude: c.lng };
      latest.current = next;
      change.current(next);
      setConfirmed(false);
    } catch {
      if (id === locationId.current) setLocationFailed(true);
    } finally {
      if (id === locationId.current) setGeoLoading(false);
    }
  };
  const autoLocate = () => {
    const address = latest.current;
    if (automaticLocation && cepState === "found" && !cepPending.current && !geoLoading && address.latitude == null) {
      void locate(address);
    }
  };
  const onCepBlur = async () => {
    const cep = latest.current.cep;
    if (!cep.trim() || cepPending.current) return;
    const id = ++lookupId.current;
    cepPending.current = true;
    setCepLoading(true);
    const r = await lookupCep(cep);
    if (id !== lookupId.current) return;
    cepPending.current = false;
    setCepLoading(false);
    if (!r) {
      setCepState("failed");
      toast.error("Não foi possível consultar o CEP. Confira o número ou preencha o endereço manualmente.");
      return;
    }
    const current = latest.current;
    const next = {
      ...current,
      endereco: r.logradouro || current.endereco,
      bairro: r.bairro || current.bairro,
      cidade: r.localidade || current.cidade,
      estado: r.uf || current.estado,
      latitude: null,
      longitude: null,
    };
    latest.current = next;
    change.current(next);
    setCepState("found");
    setLocationFailed(false);
    setConfirmed(false);
    if (automaticLocation) void locate(next);
  };

  const runGeocode = () => {
    const address = latest.current;
    if (automaticLocation && (!address.endereco.trim() || !address.numero.trim() || !address.cidade.trim())) {
      toast.error("Preencha rua, número e cidade para localizar o endereço.");
      return;
    }
    void locate(address);
  };

  const hasCoords = v.latitude != null && v.longitude != null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="CEP">
          <div className="relative">
            <input
              className={inputCls}
              value={v.cep}
              onChange={(e) => {
                set("cep", e.target.value);
                markDirty();
              }}
              onBlur={onCepBlur}
              placeholder="00000-000"
              inputMode="numeric"
            />
            {cepLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </Field>
        <Field label=" ">
          <button
            type="button"
            onClick={onCepBlur}
            disabled={cepLoading}
            className="h-11 rounded-xl bg-secondary px-3 text-xs font-semibold"
          >
            Buscar CEP
          </button>
        </Field>
      </div>

      <Field label="Endereço">
        <input
          className={inputCls}
          onBlur={autoLocate}
          value={v.endereco}
          onChange={(e) => {
            set("endereco", e.target.value);
            markDirty();
          }}
          placeholder="Rua / Avenida"
        />
      </Field>

      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label="Número">
          <input
            className={inputCls}
            onBlur={autoLocate}
            value={v.numero}
            onChange={(e) => {
              set("numero", e.target.value);
              markDirty();
            }}
            inputMode="numeric"
          />
        </Field>
        <Field label="Bairro">
          <input
            className={inputCls}
            onBlur={autoLocate}
            value={v.bairro}
            onChange={(e) => {
              set("bairro", e.target.value);
              markDirty();
            }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Cidade">
          <input
            className={inputCls}
            onBlur={autoLocate}
            value={v.cidade}
            onChange={(e) => {
              set("cidade", e.target.value);
              markDirty();
            }}
          />
        </Field>
        <Field label="UF">
          <select
            className={inputCls + " w-20"}
            onBlur={autoLocate}
            value={v.estado}
            onChange={(e) => {
              set("estado", e.target.value);
              markDirty();
            }}
          >
            {ESTADOS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
      </div>

      {automaticLocation && !geoLoading && cepState === "found" && !hasCoords && !locationFailed && (
        <p className="text-xs text-muted-foreground">Complete a rua e o número. A localização será buscada automaticamente.</p>
      )}
      {automaticLocation && geoLoading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />Localizando seu endereço…</p>}
      {(!automaticLocation || cepState === "failed" || locationFailed) && <div className="pt-1">
        <button
          type="button"
          onClick={runGeocode}
          disabled={geoLoading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {geoLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Localizar pelo endereço
        </button>
      </div>}

      {hasCoords && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <iframe
            title="Mapa de confirmação"
            src={osmEmbedUrl({ lat: v.latitude!, lng: v.longitude! })}
            className="h-48 w-full"
            loading="lazy"
          />
          <div className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs font-semibold">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {confirmed ? "Local confirmado" : "Este é o local correto da sua empresa?"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {v.latitude!.toFixed(5)}, {v.longitude!.toFixed(5)}
              </div>
            </div>
            {confirmed ? (
              <button
                type="button"
                onClick={() => setConfirmed(false)}
                className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"
              >
                <Pencil className="h-3 w-3" /> Editar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmed(true);
                  toast.success("Localização confirmada");
                }}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
              >
                <Check className="h-3 w-3" /> Confirmar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
