import { useMutation, useQuery } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, BellRing, Send } from "lucide-react";
import { useState } from "react";
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

type PushResponse = {
  total: number;
  sent: number;
  failed: number;
};

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

async function invokeSendPush(accessToken: string, title: string, body: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Configuracao do Supabase ausente no site.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title,
      body,
      target: "all",
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

  const { data: appDiagnostics } = useQuery({
    queryKey: ["admin-push-app-diagnostics"],
    queryFn: async () => {
      const appInfo = Capacitor.isNativePlatform()
        ? await App.getInfo().catch(() => null)
        : null;

      return {
        platform: Capacitor.getPlatform(),
        native: Capacitor.isNativePlatform(),
        nativeBridge:
          typeof window !== "undefined" &&
          typeof window.SOSPush?.register === "function",
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
        throw new Error("Nenhum celular registrou notificacoes ainda. Abra o app 1.0.8, faca login e aceite a permissao.");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      return invokeSendPush(accessToken, cleanTitle, cleanBody);
    },
    onSuccess: (result) => {
      toast.success(`Notificacao enviada para ${result.sent} celular(es).`);
      if (result.failed > 0) {
        toast.warning(`${result.failed} token(s) falharam e podem estar antigos.`);
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
        <Link
          to="/app/admin"
          className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"
        >
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

        <button
          type="button"
          onClick={() => sendPush.mutate()}
          disabled={sendPush.isPending || !tokenCount}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-black text-primary-foreground disabled:opacity-60"
        >
          <Send className="h-5 w-5" />
          {sendPush.isPending ? "Enviando..." : "Enviar para todos"}
        </button>
      </section>
    </div>
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
