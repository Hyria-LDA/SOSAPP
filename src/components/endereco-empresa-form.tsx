import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Crosshair, Search, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { geocodeAddress, lookupCep, osmEmbedUrl, type Coords } from "@/lib/geocode";
import { useGeolocation } from "@/hooks/use-geolocation";

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
}: {
  value: EnderecoValue;
  onChange: (v: EnderecoValue) => void;
}) {
  const v = value;
  const set = <K extends keyof EnderecoValue>(k: K, val: EnderecoValue[K]) =>
    onChange({ ...v, [k]: val });

  const [cepLoading, setCepLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(!!(v.latitude && v.longitude));
  const { request, coords, loading: gpsLoading } = useGeolocation();
  const gpsRequested = useRef(false);

  // Sempre que o endereço muda, a confirmação cai
  const markDirty = () => setConfirmed(false);

  const onCepBlur = async () => {
    if (!v.cep) return;
    setCepLoading(true);
    const r = await lookupCep(v.cep);
    setCepLoading(false);
    if (!r) {
      toast.error("CEP não encontrado");
      return;
    }
    onChange({
      ...v,
      endereco: r.logradouro || v.endereco,
      bairro: r.bairro || v.bairro,
      cidade: r.localidade || v.cidade,
      estado: r.uf || v.estado,
      latitude: null,
      longitude: null,
    });
    setConfirmed(false);
  };

  const runGeocode = async () => {
    setGeoLoading(true);
    const c = await geocodeAddress(v);
    setGeoLoading(false);
    if (!c) {
      toast.error(
        "Não conseguimos localizar este endereço. Verifique os dados ou use o botão de localização atual.",
      );
      return;
    }
    onChange({ ...v, latitude: c.lat, longitude: c.lng });
    setConfirmed(false);
    toast.success("Endereço localizado no mapa");
  };

  const useDevice = () => {
    gpsRequested.current = true;
    request();
  };

  useEffect(() => {
    if (gpsRequested.current && coords) {
      onChange({ ...v, latitude: coords.lat, longitude: coords.lng });
      setConfirmed(false);
      gpsRequested.current = false;
      toast.success("Usando a localização atual do dispositivo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

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
            className="h-11 rounded-xl bg-secondary px-3 text-xs font-semibold"
          >
            Buscar CEP
          </button>
        </Field>
      </div>

      <Field label="Endereço">
        <input
          className={inputCls}
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

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={runGeocode}
          disabled={geoLoading}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {geoLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Localizar pelo endereço
        </button>
        <button
          type="button"
          onClick={useDevice}
          disabled={gpsLoading}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold disabled:opacity-60"
        >
          {gpsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
          Usar minha localização
        </button>
      </div>

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
