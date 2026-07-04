import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { EnderecoEmpresaForm, type EnderecoValue } from "@/components/endereco-empresa-form";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome_empresa: "",
    responsavel: "",
    telefone: "",
    whatsapp: "",
  });
  const [endereco, setEndereco] = useState<EnderecoValue>({
    endereco: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "SP",
    cep: "",
    latitude: null,
    longitude: null,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endereco.latitude || !endereco.longitude) {
      toast.error("Localize o endereço da empresa no mapa antes de continuar.");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { error } = await supabase
        .from("empresas")
        .upsert({
          owner_id: u.user.id,
          email: u.user.email,
          ...form,
          endereco: endereco.endereco,
          numero: endereco.numero,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: endereco.estado,
          cep: endereco.cep,
          latitude: endereco.latitude,
          longitude: endereco.longitude,
          status: "ativa",
          onboarded: true,
          plano: "free",
          plano_inicio: new Date().toISOString(),
        }, { onConflict: "owner_id" });
      if (error) throw error;

      // Aplica código de referência do vendedor parceiro, se houver
      const refCodigo = typeof window !== "undefined" ? localStorage.getItem("ref_codigo") : null;
      if (refCodigo) {
        const { data: refRes } = await supabase.rpc("aplicar_ref_codigo" as any, {
          _codigo: refCodigo,
        });
        if ((refRes as any)?.ok) {
          toast.success("🟣 Premium ativado por 90 dias via indicação!");
        }
        localStorage.removeItem("ref_codigo");
      }

      toast.success("Empresa cadastrada!");
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!(
    form.nome_empresa &&
    form.responsavel &&
    form.whatsapp &&
    endereco.latitude &&
    endereco.longitude
  );

  return (
    <div className="safe-top safe-bottom min-h-screen bg-secondary px-5 py-8">
      <div className="mx-auto max-w-md">
        <Logo />
        <h1 className="mt-6 text-2xl font-black">Cadastre sua marcenaria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o endereço da empresa. Vamos localizar no mapa para que seus anúncios apareçam na
          distância correta — você não precisa estar na marcenaria agora.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div className="space-y-3 rounded-3xl bg-card p-5 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dados da empresa
            </h2>
            <Field label="Nome da empresa">
              <input
                required
                className={inputCls}
                value={form.nome_empresa}
                onChange={set("nome_empresa")}
                placeholder="Marcenaria Bom Acabamento"
              />
            </Field>
            <Field label="Responsável">
              <input
                required
                className={inputCls}
                value={form.responsavel}
                onChange={set("responsavel")}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone">
                <input
                  className={inputCls}
                  value={form.telefone}
                  onChange={set("telefone")}
                  placeholder="(11) 99999-0000"
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  required
                  className={inputCls}
                  value={form.whatsapp}
                  onChange={set("whatsapp")}
                  placeholder="(11) 99999-0000"
                />
              </Field>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl bg-card p-5 shadow-card">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Endereço da empresa
            </h2>
            <EnderecoEmpresaForm value={endereco} onChange={setEndereco} />
          </div>

          <button
            disabled={saving || !canSubmit}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground shadow-soft disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Concluir cadastro"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none ring-primary/30 focus:ring-2";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
