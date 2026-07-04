import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Plus, Search, Trash2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/use-geolocation";

const schema = z.object({
  novo: z.coerce.number().optional().default(0),
  fabricante_id: z.string().optional().default(""),
  padrao_id: z.string().optional().default(""),
  espessura: z.string().optional().default(""),
  raio: z.coerce.number().optional().default(50),
});

export const Route = createFileRoute("/_authenticated/app/pedidos")({
  validateSearch: (s) => schema.parse(s),
  component: PedidosPage,
});

type Pedido = {
  id: string;
  fabricante: string | null;
  padrao: string;
  espessura_mm: number;
  comprimento_min_cm: number;
  largura_min_cm: number;
  quantidade: number;
  raio_km: number;
  observacoes: string | null;
  status: "ativo" | "atendido" | "cancelado";
  created_at: string;
};

function PedidosPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/app/pedidos" });
  const qc = useQueryClient();
  const showForm = params.novo === 1;

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ["pedidos_material"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_material")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pedido[];
    },
  });

  const updateStatus = async (id: string, status: Pedido["status"]) => {
    const { error } = await supabase.from("pedidos_material").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "atendido" ? "Pedido marcado como atendido" : "Pedido cancelado");
    qc.invalidateQueries({ queryKey: ["pedidos_material"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("pedidos_material").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pedido excluído");
    qc.invalidateQueries({ queryKey: ["pedidos_material"] });
  };

  return (
    <div className="pb-8">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/app" className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex-1 text-lg font-black">🔔 Alerta Automático</h1>
        {!showForm && (
          <button
            onClick={() => navigate({ search: (s: any) => ({ ...s, novo: 1 }) })}
            className="flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Novo
          </button>
        )}
      </header>

      {showForm ? (
        <NovoPedidoForm
          defaults={{
            fabricante_id: params.fabricante_id,
            padrao_id: params.padrao_id,
            espessura: params.espessura,
            raio: params.raio,
          }}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["pedidos_material"] });
            navigate({
              search: { novo: 0, fabricante_id: "", padrao_id: "", espessura: "", raio: 50 },
            });
          }}
          onCancel={() =>
            navigate({
              search: { novo: 0, fabricante_id: "", padrao_id: "", espessura: "", raio: 50 },
            })
          }
        />
      ) : (
        <div className="space-y-3 px-4 py-4">
          {isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          )}
          {!isLoading && (pedidos?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Você ainda não cadastrou nenhum alerta automático.
              </p>
              <button
                onClick={() => navigate({ search: (s: any) => ({ ...s, novo: 1 }) })}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
              >
                <Search className="h-4 w-4" /> Registrar Busca Automática
              </button>
            </div>
          )}
          {pedidos?.map((p) => (
            <article
              key={p.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold">{p.padrao}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.fabricante ?? "Qualquer fabricante"} · {Number(p.espessura_mm)}mm
                  </div>
                </div>
                <StatusPill status={p.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary p-3 text-center text-[11px]">
                <Cell label="Mín. compr." value={`${Number(p.comprimento_min_cm)}cm`} />
                <Cell label="Mín. largura" value={`${Number(p.largura_min_cm)}cm`} />
                <Cell label="Raio" value={`${p.raio_km}km`} />
              </div>
              {p.observacoes && (
                <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {p.observacoes}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {p.status === "ativo" && (
                  <>
                    <button
                      onClick={() => updateStatus(p.id, "atendido")}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent/10 py-2 text-xs font-bold text-accent"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Atendido
                    </button>
                    <button
                      onClick={() => updateStatus(p.id, "cancelado")}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-secondary py-2 text-xs font-bold text-muted-foreground"
                    >
                      <X className="h-4 w-4" /> Cancelar
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (confirm("Excluir este pedido?")) remove(p.id);
                  }}
                  className={`grid h-9 ${p.status === "ativo" ? "w-9" : "flex-1"} place-items-center gap-1 rounded-xl bg-destructive/10 px-3 text-xs font-bold text-destructive`}
                >
                  <Trash2 className="h-4 w-4" />
                  {p.status !== "ativo" && <span>Excluir</span>}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-bold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Pedido["status"] }) {
  const map: Record<Pedido["status"], string> = {
    ativo: "bg-primary/10 text-primary",
    atendido: "bg-accent/10 text-accent",
    cancelado: "bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${map[status]}`}
    >
      {status}
    </span>
  );
}

type Fab = { id: string; nome: string };
type Pad = { id: string; nome: string; fabricante_id: string };
type Esp = { id: string; valor_mm: number };

function NovoPedidoForm({
  defaults,
  onDone,
  onCancel,
}: {
  defaults: { fabricante_id: string; padrao_id: string; espessura: string; raio: number };
  onDone: () => void;
  onCancel: () => void;
}) {
  const { coords } = useGeolocation();
  const [saving, setSaving] = useState(false);
  const [fabricanteId, setFabricanteId] = useState(defaults.fabricante_id);
  const [padraoId, setPadraoId] = useState(defaults.padrao_id);
  const [espessura, setEspessura] = useState(defaults.espessura);
  const [f, setF] = useState({
    comprimento_min_cm: "",
    largura_min_cm: "",
    quantidade: "1",
    raio_km: String(defaults.raio || 50),
    observacoes: "",
  });
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((s) => ({ ...s, [k]: e.target.value }));

  const { data: fabricantes } = useQuery({
    queryKey: ["fabricantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fabricantes")
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Fab[];
    },
  });
  const { data: padroes } = useQuery({
    queryKey: ["padroes-fab", fabricanteId],
    enabled: !!fabricanteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("padroes")
        .select("id, nome, fabricante_id")
        .eq("fabricante_id", fabricanteId)
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Pad[];
    },
  });
  const { data: espessuras } = useQuery({
    queryKey: ["espessuras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("espessuras")
        .select("id, valor_mm")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Esp[];
    },
  });

  useEffect(() => {
    if (!padroes?.some((p) => p.id === padraoId)) setPadraoId("");
  }, [padroes]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fab = fabricantes?.find((x) => x.id === fabricanteId);
    const pad = padroes?.find((x) => x.id === padraoId);
    if (!pad) return toast.error("Escolha um padrão");
    if (!espessura) return toast.error("Escolha a espessura");

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Você precisa estar logado");
      const { data: emp } = await supabase
        .from("empresas")
        .select("cidade, estado, latitude, longitude")
        .eq("owner_id", u.user.id)
        .maybeSingle();

      const { error } = await supabase.from("pedidos_material").insert({
        user_id: u.user.id,
        fabricante_id: fab?.id ?? null,
        fabricante: fab?.nome ?? null,
        padrao_id: pad.id,
        padrao: pad.nome,
        espessura_mm: Number(espessura),
        comprimento_min_cm: Number(f.comprimento_min_cm) || 0,
        largura_min_cm: Number(f.largura_min_cm) || 0,
        quantidade: Number(f.quantidade) || 1,
        raio_km: Number(f.raio_km) || 50,
        observacoes: f.observacoes || null,
        cidade: emp?.cidade ?? null,
        estado: emp?.estado ?? null,
        latitude: emp?.latitude ?? null,
        longitude: emp?.longitude ?? null,
      });
      if (error) throw error;
      toast.success("Busca registrada! Avisaremos quando aparecer um match.");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao publicar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 px-4 py-4">
      <Field label="Fabricante">
        <select
          value={fabricanteId}
          onChange={(e) => {
            setFabricanteId(e.target.value);
            setPadraoId("");
          }}
          className={inputCls}
        >
          <option value="">Qualquer fabricante</option>
          {fabricantes?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cor / Padrão">
        <select
          value={padraoId}
          onChange={(e) => setPadraoId(e.target.value)}
          disabled={!fabricanteId}
          className={inputCls}
        >
          <option value="">
            {fabricanteId ? "Escolha o padrão" : "Selecione o fabricante primeiro"}
          </option>
          {padroes?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Espessura">
        <div className="grid grid-cols-4 gap-2">
          {espessuras
            ?.filter((e) => Number(e.valor_mm) < 30)
            .map((e) => {
              const active = espessura === String(e.valor_mm);
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => setEspessura(String(e.valor_mm))}
                  className={`rounded-xl py-2.5 text-sm font-bold ring-1 ring-border ${active ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
                >
                  {Number(e.valor_mm)}mm
                </button>
              );
            })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Comprimento mín. (cm)">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={f.comprimento_min_cm}
            onChange={set("comprimento_min_cm")}
            className={inputCls}
            placeholder="120"
          />
        </Field>
        <Field label="Largura mín. (cm)">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={f.largura_min_cm}
            onChange={set("largura_min_cm")}
            className={inputCls}
            placeholder="50"
          />
        </Field>
        <Field label="Quantidade">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={f.quantidade}
            onChange={set("quantidade")}
            className={inputCls}
          />
        </Field>
        <Field label="Raio máx. (km)">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={f.raio_km}
            onChange={set("raio_km")}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Observações">
        <textarea
          value={f.observacoes}
          onChange={set("observacoes")}
          rows={3}
          className={inputCls}
          placeholder="Aceito peças maiores, prefiro retirada…"
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-2xl bg-secondary font-bold text-foreground"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="h-12 flex-[2] rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Registrando…" : "Registrar Busca"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
