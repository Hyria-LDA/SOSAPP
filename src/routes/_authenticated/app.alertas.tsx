import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bell, Plus, Trash2, X, ChevronDown, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { checkPlanLimit, usePlanStatus } from "@/hooks/use-plan-status";
import { UpgradeModal } from "@/components/upgrade-modal";
import { sortByNome } from "@/lib/sort";

export const Route = createFileRoute("/_authenticated/app/alertas")({
  component: Alertas,
});

type Form = {
  nome: string;
  fabricante_id: string;
  fabricante_nome: string;
  padrao_id: string;
  padrao_nome: string;
  espessura_mm: string;
  comprimento_min_cm: string;
  largura_min_cm: string;
  raio_km: number;
};

const emptyForm: Form = {
  nome: "",
  fabricante_id: "",
  fabricante_nome: "",
  padrao_id: "",
  padrao_nome: "",
  espessura_mm: "",
  comprimento_min_cm: "",
  largura_min_cm: "",
  raio_km: 50,
};

const ESPESSURAS = [3, 6, 9, 12, 15, 18];

function Alertas() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [f, setF] = useState<Form>(emptyForm);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const { data: planStatus } = usePlanStatus();

  const search = Route.useSearch();
  useEffect(() => {
    if ((search as any).novo) setShow(true);
  }, []);

  const { data: alertas } = useQuery({
    queryKey: ["alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // contagem de correspondências por alerta
  const { data: counts } = useQuery({
    queryKey: ["alertas-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("alerta_id")
        .not("alerta_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        const k = (r as any).alerta_id as string;
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!f.fabricante_nome || !f.padrao_nome || !f.espessura_mm) {
        throw new Error("Preencha fabricante, padrão e espessura");
      }
      const lim = await checkPlanLimit("alertas");
      if (!lim.allowed) {
        throw new Error(
          `LIMITE:Você atingiu o limite do plano ${lim.plano} (${lim.atual}/${lim.limite} alertas). O limite renova 30 dias após criar o alerta.`,
        );
      }
      const { data: u } = await supabase.auth.getUser();
      const nome = f.nome.trim() || `${f.padrao_nome} ${f.espessura_mm}mm`;
      const { error } = await supabase.from("alertas").insert({
        user_id: u.user!.id,
        nome,
        padrao: f.padrao_nome,
        fabricante: f.fabricante_nome,
        espessura_mm: Number(f.espessura_mm),
        comprimento_min_cm: f.comprimento_min_cm ? Number(f.comprimento_min_cm) : null,
        largura_min_cm: f.largura_min_cm ? Number(f.largura_min_cm) : null,
        raio_km: f.raio_km || 50,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alertas"] });
      setShow(false);
      setF(emptyForm);
      toast.success("Alerta criado");
    },
    onError: (e: any) => {
      const msg = e.message || "Erro ao criar alerta";
      if (msg.startsWith("LIMITE:")) {
        setUpgradeReason(msg.replace("LIMITE:", ""));
        setShowUpgrade(true);
      } else {
        toast.error(msg);
      }
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alertas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("alertas").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alertas"] }),
  });

  const temAlertas = (alertas ?? []).length > 0;

  return (
    <div className="safe-top px-5 pt-4 pb-24">
      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        currentSlug={planStatus?.plano.slug}
        reason={upgradeReason}
      />
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/app" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-xl font-black">Alertas inteligentes</h1>
        </div>
        {temAlertas && (
          <button
            onClick={() => setShow(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground shadow-pop active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Novo Alerta
          </button>
        )}
      </header>

      <p className="mt-3 text-sm text-muted-foreground">
        Avisamos você assim que aparecer uma sobra compatível com seu pedido.
      </p>

      {!temAlertas && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-card p-8 text-center shadow-card">
          <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-9 w-9" />
          </div>
          <h2 className="text-lg font-black">Cadastre seu primeiro alerta</h2>
          <p className="mx-auto mt-1 mb-6 max-w-xs text-sm text-muted-foreground">
            Cadastre um material e seja avisado assim que aparecer uma sobra compatível perto da sua
            marcenaria.
          </p>
          <button
            onClick={() => setShow(true)}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground shadow-pop active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> Cadastrar Alerta
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {(alertas ?? []).map((a: any) => {
          const matches = counts?.[a.id] ?? 0;
          const dim = [
            a.comprimento_min_cm && `${Number(a.comprimento_min_cm)}cm`,
            a.largura_min_cm && `${Number(a.largura_min_cm)}cm`,
          ]
            .filter(Boolean)
            .join(" × ");
          return (
            <div
              key={a.id}
              className={`rounded-2xl border bg-card p-4 shadow-card transition ${
                a.ativo ? "border-border" : "border-dashed border-border opacity-70"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black">{a.nome}</div>
                      <div className="truncate text-xs font-semibold text-muted-foreground">
                        {a.fabricante} · {a.padrao}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        matches > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {matches} match{matches === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    {a.espessura_mm && (
                      <span className="rounded-md bg-secondary px-2 py-0.5">
                        {a.espessura_mm}mm
                      </span>
                    )}
                    {dim && <span className="rounded-md bg-secondary px-2 py-0.5">{dim}</span>}
                    {a.raio_km && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-secondary px-2 py-0.5">
                        <MapPin className="h-3 w-3" /> {a.raio_km}km
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Criado em{" "}
                      {new Date(a.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggle.mutate({ id: a.id, ativo: !a.ativo })}
                        className={`h-5 w-9 rounded-full transition ${
                          a.ativo ? "bg-primary" : "bg-border"
                        }`}
                        aria-label="ativar/desativar"
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                            a.ativo ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => del.mutate(a.id)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label="excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <NovoAlertaSheet
          form={f}
          setForm={setF}
          onClose={() => setShow(false)}
          onSave={() => create.mutate()}
          saving={create.isPending}
        />
      )}
    </div>
  );
}

/* ============= Formulário ============= */
function NovoAlertaSheet({
  form,
  setForm,
  onClose,
  onSave,
  saving,
}: {
  form: Form;
  setForm: (f: Form) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [pickFab, setPickFab] = useState(false);
  const [pickPad, setPickPad] = useState(false);

  const { data: fabricantes } = useQuery({
    queryKey: ["fabricantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fabricantes")
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const { data: padroes } = useQuery({
    queryKey: ["padroes-fab", form.fabricante_id],
    enabled: !!form.fabricante_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("padroes")
        .select("id, nome")
        .eq("ativo", true)
        .eq("fabricante_id", form.fabricante_id)
        .order("nome");
      if (error) throw error;
      return sortByNome(data as { id: string; nome: string }[]);
    },
  });

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">Novo alerta</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Nome do alerta (opcional)">
            <input
              className={inputCls}
              placeholder="Ex: Carvalho Hanover 18mm"
              value={form.nome}
              onChange={(e) => set({ nome: e.target.value })}
            />
          </Field>

          <Field label="Fabricante">
            <button
              onClick={() => setPickFab(true)}
              className={`flex h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-semibold shadow-sm ${
                form.fabricante_nome ? "border-primary/60" : "border-border"
              }`}
            >
              <span className={form.fabricante_nome ? "" : "text-muted-foreground font-medium"}>
                {form.fabricante_nome || "Selecione o fabricante"}
              </span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </Field>

          <Field label="Cor / Padrão">
            <button
              onClick={() => form.fabricante_id && setPickPad(true)}
              disabled={!form.fabricante_id}
              className={`flex h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 px-4 text-sm font-semibold shadow-sm ${
                !form.fabricante_id
                  ? "cursor-not-allowed border-dashed bg-secondary/40 text-muted-foreground"
                  : form.padrao_nome
                    ? "border-primary/60 bg-white"
                    : "border-border bg-white"
              }`}
            >
              <span className={form.padrao_nome ? "" : "text-muted-foreground font-medium"}>
                {!form.fabricante_id
                  ? "Escolha o fabricante primeiro"
                  : form.padrao_nome || "Selecione a cor / padrão"}
              </span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </Field>

          <Field label="Espessura">
            <div className="grid grid-cols-3 gap-2">
              {ESPESSURAS.map((v) => {
                const active = form.espessura_mm === String(v);
                return (
                  <button
                    key={v}
                    onClick={() => set({ espessura_mm: String(v) })}
                    className={`rounded-xl py-2.5 text-xs font-bold transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-card"
                        : "bg-card ring-1 ring-border"
                    }`}
                  >
                    {v} mm
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Comprimento mínimo (cm)">
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                placeholder="120"
                value={form.comprimento_min_cm}
                onChange={(e) => set({ comprimento_min_cm: e.target.value })}
              />
            </Field>
            <Field label="Largura mínima (cm)">
              <input
                className={inputCls}
                type="number"
                inputMode="numeric"
                placeholder="50"
                value={form.largura_min_cm}
                onChange={(e) => set({ largura_min_cm: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-2xl bg-secondary px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-4 w-4 text-primary" /> Distância máxima
              </span>
              <span className="text-sm font-black text-primary">
                {form.raio_km >= 300 ? "Qualquer" : `${form.raio_km} km`}
              </span>
            </div>
            <Slider
              value={[form.raio_km]}
              min={5}
              max={300}
              step={5}
              onValueChange={(v) => set({ raio_km: v[0] ?? 50 })}
            />
            <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
              <span>5 km</span>
              <span>300 km</span>
            </div>
          </div>

          <button
            onClick={onSave}
            disabled={saving}
            className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-pop active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Criar alerta"}
          </button>
        </div>
      </div>

      {pickFab && (
        <Picker
          title="Fabricante"
          items={fabricantes ?? []}
          onClose={() => setPickFab(false)}
          onSelect={(it) => {
            set({
              fabricante_id: it.id,
              fabricante_nome: it.nome,
              padrao_id: "",
              padrao_nome: "",
            });
            setPickFab(false);
          }}
        />
      )}
      {pickPad && (
        <Picker
          title="Cor / Padrão"
          items={padroes ?? []}
          onClose={() => setPickPad(false)}
          onSelect={(it) => {
            set({ padrao_id: it.id, padrao_nome: it.nome });
            setPickPad(false);
          }}
        />
      )}
    </div>
  );
}

function Picker({
  title,
  items,
  onClose,
  onSelect,
}: {
  title: string;
  items: { id: string; nome: string }[];
  onClose: () => void;
  onSelect: (it: { id: string; nome: string }) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => items.filter((i) => i.nome.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60">
      <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-t-3xl bg-background">
        <div className="flex items-center justify-between p-4">
          <h3 className="text-base font-black">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 pb-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className={inputCls}
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {filtered.map((it) => (
            <button
              key={it.id}
              onClick={() => onSelect(it)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-secondary"
            >
              {it.nome}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhum resultado</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border-2 border-border bg-white px-4 text-sm font-semibold shadow-sm outline-none transition focus:border-primary";
