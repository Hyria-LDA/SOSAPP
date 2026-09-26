import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  BellRing,
  Clock3,
  ExternalLink,
  Home,
  Plus,
  Search,
  Send,
  Save,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/admin/notificacoes-push")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user!.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw redirect({ to: "/app" });
  },
  component: AdminPushNotifications,
});

type PushAudience = { target: "all" | "cities"; uf?: string; cities?: string[] };

type PushResponse = {
  clients?: number;
  total: number;
  sent: number;
  failed: number;
  failures?: Array<{
    platform: string;
    status: number;
    code: string;
    message: string;
  }>;
};

const PUSH_TARGETS = [
  { label: "Pagina inicial", path: "/app", icon: Home },
  { label: "Anunciar sobra", path: "/app/anunciar", icon: Plus },
  { label: "Buscar material", path: "/app/buscar", icon: Search },
  { label: "Planos / upgrade", path: "/app/perfil?upgrade=1", icon: Sparkles },
] as const;

type PushTargetPath = (typeof PUSH_TARGETS)[number]["path"];
type PushTargetType = "internal" | "external";

function normalizeExternalUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Digite um link seguro comecando por https://");
  }
  return url.toString();
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("Failed to send a request")) {
      return "A funcao send-push ainda nao foi publicada no Supabase ou esta sem configuracao.";
    }
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return readableError(new Error(message));
  }

  return "Erro ao enviar notificacao.";
}

async function invokeSendPush(
  accessToken: string,
  title: string,
  body: string,
  path: PushTargetPath,
  externalUrl?: string,
  audience: PushAudience = { target: "all" },
  preview = false,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Configuracao do Supabase ausente no site.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-push-regional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title,
      body,
      path,
      external_url: externalUrl,
      ...audience,
      preview,
    }),
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || data?.message || text || `HTTP ${response.status}`;
    throw new Error(`send-push ${response.status}: ${message}`);
  }

  return data as PushResponse;
}

function AdminPushNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetPath, setTargetPath] = useState<PushTargetPath>("/app");
  const [targetType, setTargetType] = useState<PushTargetType>("internal");
  const [externalUrl, setExternalUrl] = useState("");
  const [audienceMode, setAudienceMode] = useState<"all" | "cities">("all");
  const [audienceUf, setAudienceUf] = useState("");
  const [audienceCities, setAudienceCities] = useState("");
  const audienceKey = JSON.stringify([audienceMode, audienceUf, audienceCities]);
  function selectedAudience(): PushAudience {
    if (audienceMode === "all") return { target: "all" };
    const cities = audienceCities.split(/[,;\n]+/).map((city) => city.trim()).filter(Boolean);
    if (!audienceUf || !cities.length) throw new Error("Selecione a UF e informe as cidades.");
    if (cities.length > 100 || cities.some((city) => city.length > 120)) throw new Error("Informe até 100 cidades, com até 120 caracteres cada.");
    return { target: "cities", uf: audienceUf, cities };
  }
  const previewAudience = useMutation({
    mutationFn: async () => {
      const audience = selectedAudience();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sessão expirada. Entre novamente.");
      const result = await invokeSendPush(data.session.access_token, "", "", "/app", undefined, audience, true);
      return { ...result, key: audienceKey };
    },
    onError: (error) => toast.error(readableError(error)),
  });

  const { data: appDiagnostics } = useQuery({
    queryKey: ["admin-push-app-diagnostics"],
    queryFn: async () => {
      const appInfo = Capacitor.isNativePlatform() ? await App.getInfo().catch(() => null) : null;

      return {
        platform: Capacitor.getPlatform(),
        native: Capacitor.isNativePlatform(),
        nativeBridge:
          typeof window !== "undefined" && typeof window.SOSPush?.register === "function",
        pushAvailable: Capacitor.isPluginAvailable("PushNotifications"),
        appVersion: appInfo?.version ?? null,
        appBuild: appInfo?.build ?? null,
      };
    },
  });

  const { data: tokenCount } = useQuery({
    queryKey: ["admin-push-token-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("push_tokens" as any)
        .select("id", { count: "exact", head: true })
        .eq("active", true);
      if (error) return null;
      return count ?? 0;
    },
  });

  const sendPush = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      const cleanBody = body.trim();
      if (!cleanTitle) throw new Error("Digite o titulo da notificacao.");
      if (!cleanBody) throw new Error("Digite a mensagem da notificacao.");
      if (!tokenCount) {
        throw new Error(
          "Nenhum celular registrou notificacoes ainda. Abra o app 1.0.8, faca login e aceite a permissao.",
        );
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      let cleanExternalUrl: string | undefined;
      if (targetType === "external") {
        if (!externalUrl.trim()) throw new Error("Digite o link externo da notificacao.");
        try {
          cleanExternalUrl = normalizeExternalUrl(externalUrl);
        } catch {
          throw new Error("Digite um link seguro comecando por https://");
        }
      }

      return invokeSendPush(accessToken, cleanTitle, cleanBody, targetPath, cleanExternalUrl, selectedAudience());
    },
    onSuccess: (result) => {
      toast.success(`Notificacao enviada para ${result.sent} celular(es).`);
      if (result.failed > 0) {
        const firstFailure = result.failures?.[0];
        const failureDetail = firstFailure
          ? ` ${firstFailure.platform}: ${firstFailure.code} (HTTP ${firstFailure.status}).`
          : "";
        toast.warning(`${result.failed} token(s) falharam.${failureDetail}`, {
          duration: 12_000,
        });
      }
      setTitle("");
      setBody("");
    },
    onError: (error) => {
      toast.error(readableError(error));
    },
  });

  return (
    <div className="safe-top px-5 pt-4 pb-10">
      <header className="flex items-center gap-2">
        <Link to="/app/admin" className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black">Notificacoes Push</h1>
          <p className="text-xs text-muted-foreground">Envio para celulares com app instalado</p>
        </div>
      </header>

      <section className="mt-5 rounded-2xl bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold">Dispositivos ativos</div>
            <div className="text-2xl font-black">{tokenCount ?? "--"}</div>
            {tokenCount === 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">
                Abra o app no celular, faca login e aceite a permissao de notificacao.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <AutomationSettings />

      <section className="mt-4 rounded-2xl bg-card p-4 shadow-card">
        <div className="text-sm font-bold">Diagnostico do app</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Info label="Versao" value={appDiagnostics?.appVersion ?? "--"} />
          <Info label="Build" value={appDiagnostics?.appBuild ?? "--"} />
          <Info label="Plataforma" value={appDiagnostics?.platform ?? "--"} />
          <Info label="Bridge nativo" value={appDiagnostics?.nativeBridge ? "ativo" : "inativo"} />
          <Info label="Push plugin" value={appDiagnostics?.pushAvailable ? "ativo" : "inativo"} />
        </div>
        {appDiagnostics?.native && !appDiagnostics.nativeBridge && !appDiagnostics.pushAvailable ? (
          <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            O site carregou dentro do app, mas este APK nao tem a ponte nativa de notificacao.
            Reinstale o APK 1.0.8 e limpe os dados do aplicativo.
          </p>
        ) : null}
      </section>

      <section className="mt-4 rounded-2xl bg-card p-4 shadow-card">
        <div className="mb-4 space-y-2">
          <label htmlFor="push-audience" className="block text-sm font-bold">Quem vai receber</label>
          <select id="push-audience" disabled={sendPush.isPending} value={audienceMode} onChange={(event) => setAudienceMode(event.target.value as "all" | "cities")} className="w-full rounded-xl border border-border bg-secondary p-3">
            <option value="all">Todos os clientes</option><option value="cities">Por cidades</option>
          </select>
          {audienceMode === "cities" && <>
            <label htmlFor="push-uf" className="block text-sm">Estado (UF)</label>
            <select id="push-uf" disabled={sendPush.isPending} value={audienceUf} onChange={(event) => setAudienceUf(event.target.value)} className="w-full rounded-xl border border-border bg-secondary p-3">
              <option value="">Selecione</option>
              {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            <label htmlFor="push-cities" className="block text-sm">Cidades, separadas por vírgula</label>
            <input id="push-cities" disabled={sendPush.isPending} value={audienceCities} onChange={(event) => setAudienceCities(event.target.value)} placeholder="Juiz de Fora, Matias Barbosa" className="w-full rounded-xl border border-border bg-secondary p-3" />
            <p className="text-xs text-muted-foreground">Usa a cidade e o estado cadastrados na empresa. Clientes sem localização cadastrada não recebem este envio regional.</p>
          </>}
          <button type="button" disabled={previewAudience.isPending || sendPush.isPending} onClick={() => previewAudience.mutate()} className="rounded-xl bg-secondary px-3 py-2 text-sm font-semibold">{previewAudience.isPending ? "Consultando…" : "Consultar alcance"}</button>
          {previewAudience.data?.key === audienceKey && <p className="text-xs text-muted-foreground">{previewAudience.data.clients ?? 0} cliente(s) com notificações ativas, em {previewAudience.data.total} aparelho(s). O alcance pode mudar até o envio.</p>}
        </div>
        <label className="text-sm font-bold" htmlFor="push-title">
          Titulo
        </label>
        <input
          id="push-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          className="mt-2 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-base outline-none focus:border-accent"
          placeholder="Ex: Novas sobras disponiveis"
        />

        <label className="mt-4 block text-sm font-bold" htmlFor="push-body">
          Mensagem
        </label>
        <textarea
          id="push-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={180}
          rows={5}
          className="mt-2 w-full resize-none rounded-2xl border border-border bg-secondary px-4 py-3 text-base outline-none focus:border-accent"
          placeholder="Escreva a mensagem que vai aparecer no celular."
        />

        <div className="mt-4">
          <div className="text-sm font-bold">Ao clicar na notificacao</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PUSH_TARGETS.map((target) => {
              const Icon = target.icon;
              const selected = targetType === "internal" && targetPath === target.path;
              return (
                <button
                  key={target.path}
                  type="button"
                  onClick={() => {
                    setTargetType("internal");
                    setTargetPath(target.path);
                  }}
                  className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-xs font-black transition ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{target.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setTargetType("external")}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-xs font-black transition ${
                targetType === "external"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-foreground"
              }`}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>Link externo</span>
            </button>
          </div>
          {targetType === "external" ? (
            <div className="mt-3">
              <label className="text-xs font-bold" htmlFor="push-external-url">
                Endereco que sera aberto
              </label>
              <input
                id="push-external-url"
                type="url"
                inputMode="url"
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                maxLength={2048}
                className="mt-2 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-base outline-none focus:border-accent"
                placeholder="https://exemplo.com.br/promocao"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Por seguranca, somente links que comecam com https:// sao aceitos.
              </p>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => sendPush.mutate()}
          disabled={sendPush.isPending || !tokenCount}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-black text-primary-foreground disabled:opacity-60"
        >
          <Send className="h-5 w-5" />
          {sendPush.isPending ? "Enviando..." : audienceMode === "cities" ? "Enviar para as cidades selecionadas" : "Enviar para todos"}
        </button>
      </section>
    </div>
  );
}

type AutomationRow = {
  id: string;
  position: number;
  send_time: string;
  title: string;
  body: string;
  audience: string;
  active: boolean;
};

const AUDIENCES = [
  ["no_registration", "Sem cadastro concluido"],
  ["active_registration", "Cadastro ativo"],
  ["plan_ultra", "Plano Brilhante"],
  ["all", "Todos os clientes"],
] as const;

function AutomationSettings() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<AutomationRow[]>([]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["notification-automation-schedules"],
    queryFn: async () => {
      const { data: rows, error: queryError } = await supabase
        .from("notification_automation_schedules")
        .select("id, position, send_time, title, body, audience, active")
        .order("position");
      if (queryError) throw queryError;
      return rows ?? [];
    },
  });

  useEffect(() => {
    if (data) setDrafts(data.map((row) => ({ ...row, send_time: row.send_time.slice(0, 5) })));
  }, [data]);

  const save = useMutation({
    mutationFn: async (row: AutomationRow) => {
      if (!row.title.trim() || !row.body.trim()) throw new Error("Preencha titulo e mensagem.");
      const { error: updateError } = await supabase
        .from("notification_automation_schedules")
        .update({
          send_time: row.send_time,
          title: row.title.trim(),
          body: row.body.trim(),
          audience: row.audience,
          active: row.active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-automation-schedules"] });
      toast.success("Horario automatico salvo.");
    },
    onError: (saveError) => toast.error(readableError(saveError)),
  });

  const updateDraft = (id: string, patch: Partial<AutomationRow>) =>
    setDrafts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <section className="mt-4 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Clock3 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold">Lembretes automaticos</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Configure os tres envios de segunda a sexta. Os horarios seguem Brasilia.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">Carregando horarios...</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          Execute o novo SQL no Supabase para liberar estas configuracoes.
        </p>
      ) : null}
      <div className="mt-4 space-y-4">
        {drafts.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-secondary/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black">Envio {row.position}</div>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(event) => updateDraft(row.id, { active: event.target.checked })}
                />
                Ativo
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold">
                Hora
                <input
                  type="time"
                  value={row.send_time}
                  onChange={(event) => updateDraft(row.id, { send_time: event.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                />
              </label>
              <label className="text-[11px] font-semibold">
                Quem recebe
                <select
                  value={row.audience}
                  onChange={(event) => updateDraft(row.id, { audience: event.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-2 text-xs"
                >
                  {AUDIENCES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-[11px] font-semibold">
              Titulo
              <input
                value={row.title}
                maxLength={80}
                onChange={(event) => updateDraft(row.id, { title: event.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="mt-3 block text-[11px] font-semibold">
              Mensagem
              <textarea
                value={row.body}
                maxLength={180}
                rows={3}
                onChange={(event) => updateDraft(row.id, { body: event.target.value })}
                className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(row)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black text-white disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Salvar envio {row.position}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words font-black">{value}</div>
    </div>
  );
}
