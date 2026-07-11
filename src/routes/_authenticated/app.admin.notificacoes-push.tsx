import { useMutation, useQuery } from "@tanstack/react-query";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, BellRing, Home, ImagePlus, Plus, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";

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

type SelectedImage = {
  file: File;
  preview: string;
};

const PUSH_TARGETS = [
  { label: "Pagina inicial", path: "/app", icon: Home },
  { label: "Anunciar sobra", path: "/app/anunciar", icon: Plus },
  { label: "Buscar material", path: "/app/buscar", icon: Search },
  { label: "Planos / upgrade", path: "/app/perfil?upgrade=1", icon: Sparkles },
] as const;

type PushTargetPath = (typeof PUSH_TARGETS)[number]["path"];

function isLikelyImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
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
  imageUrl: string | undefined,
  path: PushTargetPath,
) {
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
      imageUrl,
      path,
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
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [targetPath, setTargetPath] = useState<PushTargetPath>("/app");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (image?.preview) URL.revokeObjectURL(image.preview);
    };
  }, [image?.preview]);

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!isLikelyImage(file)) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Imagem muito grande. Escolha uma imagem com ate 20 MB.");
      return;
    }
    setImage((current) => {
      if (current?.preview) URL.revokeObjectURL(current.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
  };

  const removeImage = () => {
    setImage((current) => {
      if (current?.preview) URL.revokeObjectURL(current.preview);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadPushImage = async () => {
    if (!image) return undefined;
    const { blob, ext, mime } = await compressImage(image.file, { maxDim: 1200, quality: 0.82 });
    const path = `push-broadcasts/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("banners")
      .upload(path, blob, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.storage
      .from("banners")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Nao foi possivel gerar o link da imagem.");
    return data.signedUrl;
  };

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

      const imageUrl = await uploadPushImage();
      return invokeSendPush(accessToken, cleanTitle, cleanBody, imageUrl, targetPath);
    },
    onSuccess: (result) => {
      toast.success(`Notificacao enviada para ${result.sent} celular(es).`);
      if (result.failed > 0) {
        toast.warning(`${result.failed} token(s) falharam e podem estar antigos.`);
      }
      setTitle("");
      setBody("");
      removeImage();
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

        <div className="mt-4">
          <div className="text-sm font-bold">Ao clicar na notificacao</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PUSH_TARGETS.map((target) => {
              const Icon = target.icon;
              const selected = targetPath === target.path;
              return (
                <button
                  key={target.path}
                  type="button"
                  onClick={() => setTargetPath(target.path)}
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
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-bold" htmlFor="push-image">
              Imagem opcional
            </label>
            {image ? (
              <button
                type="button"
                onClick={removeImage}
                className="inline-flex items-center gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            id="push-image"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => selectImage(event.target.files?.[0])}
          />

          {image ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 block w-full overflow-hidden rounded-2xl border border-border bg-secondary text-left"
            >
              <img
                src={image.preview}
                alt="Previa da imagem da notificacao"
                className="h-40 w-full object-cover"
              />
              <div className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                Toque para trocar a imagem. Ela pode aparecer expandida em alguns Androids.
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary px-4 text-sm font-bold text-muted-foreground"
            >
              <ImagePlus className="h-5 w-5" />
              Adicionar imagem
            </button>
          )}
        </div>

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
