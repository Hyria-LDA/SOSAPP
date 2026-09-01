import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/atualizacao")({
  beforeLoad: async () => {
    const { data: user } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.user!.id);
    if (!(roles ?? []).some((role: any) => role.role === "admin")) {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminAppUpdate,
});

type Policy = {
  platform: "android" | "ios";
  min_build: number;
  latest_version: string;
  force_update: boolean;
  message: string;
  store_url: string;
};

function AdminAppUpdate() {
  const queryClient = useQueryClient();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-app-update-policy"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("app_update_policy" as any)
        .select("*")
        .order("platform");
      if (error) throw error;
      return (rows ?? []) as unknown as Policy[];
    },
  });

  useEffect(() => {
    if (data) setPolicies(data);
  }, [data]);

  const change = (platform: string, patch: Partial<Policy>) => {
    setPolicies((current) =>
      current.map((policy) => (policy.platform === platform ? { ...policy, ...patch } : policy)),
    );
  };

  const save = async (policy: Policy) => {
    if (!Number.isInteger(policy.min_build) || policy.min_build < 1) {
      toast.error("Informe um código de build válido.");
      return;
    }
    if (!policy.store_url.startsWith("https://")) {
      toast.error("Informe um link válido da loja.");
      return;
    }

    setSaving(policy.platform);
    const { error } = await supabase
      .from("app_update_policy" as any)
      .update({
        min_build: policy.min_build,
        latest_version: policy.latest_version.trim(),
        force_update: policy.force_update,
        message: policy.message.trim(),
        store_url: policy.store_url.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("platform", policy.platform);
    setSaving(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-app-update-policy"] });
    toast.success(
      policy.force_update
        ? `Atualização obrigatória do ${label(policy.platform)} ativada.`
        : `Atualização obrigatória do ${label(policy.platform)} desativada.`,
    );
  };

  return (
    <div className="safe-top px-5 pt-4 pb-12">
      <header className="flex items-center gap-2">
        <Link
          to="/app/admin"
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-black">Atualização do aplicativo</h1>
      </header>

      <div className="mt-4 flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <p>
          Ative somente depois que a versão estiver disponível na loja. Um código mínimo incorreto
          pode bloquear todos os aplicativos antigos.
        </p>
      </div>

      {isLoading && <div className="mt-5 text-sm text-muted-foreground">Carregando…</div>}

      <div className="mt-4 space-y-4">
        {policies.map((policy) => (
          <section key={policy.platform} className="rounded-2xl bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-black">{label(policy.platform)}</h2>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={policy.force_update}
                  onChange={(event) =>
                    change(policy.platform, { force_update: event.target.checked })
                  }
                  className="h-5 w-5 accent-primary"
                />
                Obrigatória
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Build mínimo">
                <input
                  type="number"
                  min={1}
                  value={policy.min_build}
                  onChange={(event) =>
                    change(policy.platform, { min_build: Number(event.target.value) })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Versão exibida">
                <input
                  value={policy.latest_version}
                  onChange={(event) =>
                    change(policy.platform, { latest_version: event.target.value })
                  }
                  className={inputClass}
                  placeholder="1.0.18"
                />
              </Field>
            </div>

            <Field label="Mensagem">
              <textarea
                value={policy.message}
                onChange={(event) => change(policy.platform, { message: event.target.value })}
                rows={3}
                className={`${inputClass} h-auto py-3`}
              />
            </Field>

            <Field label="Link da loja">
              <input
                value={policy.store_url}
                onChange={(event) => change(policy.platform, { store_url: event.target.value })}
                className={inputClass}
              />
            </Field>

            <button
              type="button"
              onClick={() => save(policy)}
              disabled={saving === policy.platform}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving === policy.platform ? "Salvando…" : "Salvar configuração"}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block text-xs font-semibold text-muted-foreground">
      {fieldLabel}
      {children}
    </label>
  );
}

function label(platform: string) {
  return platform === "android" ? "Android" : "iPhone (iOS)";
}

