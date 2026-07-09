import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from "@capacitor/push-notifications";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type PushData = Record<string, unknown>;

type SOSPushResult = {
  ok?: boolean;
  message?: string;
};

declare global {
  interface Window {
    SOSPush?: {
      isAvailable?: () => boolean;
      register?: (accessToken: string, supabaseUrl: string, anonKey: string) => void;
    };
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPushPlugin() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (Capacitor.isPluginAvailable("PushNotifications")) return true;
    await sleep(500);
  }
  return false;
}

function hasSOSPushBridge() {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (typeof window.SOSPush?.register !== "function") return false;
  if (typeof window.SOSPush?.isAvailable !== "function") return true;
  return window.SOSPush.isAvailable();
}

export function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const registeredForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;
    if (registeredForUserRef.current === user.id) return;

    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    const openNotificationTarget = (data?: PushData) => {
      const materialId = asString(data?.material_id);
      if (materialId) {
        router.navigate({ to: "/app/material/$id", params: { id: materialId } });
        return;
      }
      router.navigate({ to: "/app/notificacoes" });
    };

    const registerDevice = async () => {
      try {
        if (hasSOSPushBridge()) {
          const { data } = await supabase.auth.getSession();
          const accessToken = data.session?.access_token;
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!accessToken || !supabaseUrl || !anonKey) {
            toast.error("Sessao ou configuracao do Supabase ausente para ativar notificacoes.");
            return;
          }

          const onNativeResult = (event: Event) => {
            const detail = (event as CustomEvent<SOSPushResult>).detail ?? {};
            if (detail.ok) {
              registeredForUserRef.current = user.id;
              toast.success(detail.message || "Notificacoes ativadas neste celular.");
              return;
            }
            toast.error(detail.message || "Erro ao ativar notificacoes.");
          };

          window.addEventListener("sos-push-result", onNativeResult, { once: true });
          window.SOSPush?.register?.(accessToken, supabaseUrl, anonKey);
          return;
        }

        const hasPushPlugin = await waitForPushPlugin();
        if (cancelled) return;
        if (!hasPushPlugin) {
          const appInfo = await App.getInfo().catch(() => null);
          const versionText = appInfo?.version ? ` Versao instalada: ${appInfo.version}.` : "";
          toast.error(
            `Notificacoes nativas indisponiveis.${versionText} Reinstale o APK 1.0.7 e limpe os dados do app se continuar.`,
          );
          return;
        }

        handles.push(
          await PushNotifications.addListener("registration", async (token: Token) => {
            if (!token.value) {
              toast.error("Firebase nao retornou token de notificacao.");
              return;
            }

            const { error } = await supabase.rpc("register_push_token", {
              p_platform: Capacitor.getPlatform(),
              p_token: token.value,
            });
            if (error) {
              console.warn("[push] erro ao salvar token", error);
              toast.error(`Erro ao salvar token: ${error.message}`);
              return;
            }

            registeredForUserRef.current = user.id;
            toast.success("Notificacoes ativadas neste celular.");
          }),
        );

        handles.push(
          await PushNotifications.addListener("registrationError", (error) => {
            console.warn("[push] erro ao registrar notificacoes", error);
            toast.error(`Firebase nao registrou o celular: ${error.error}`);
          }),
        );

        handles.push(
          await PushNotifications.addListener("pushNotificationReceived", (notification) => {
            toast(notification.title || "Nova notificacao", {
              description: notification.body,
              action: {
                label: "Ver",
                onClick: () => openNotificationTarget(notification.data),
              },
            });
          }),
        );

        handles.push(
          await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action: ActionPerformed) => {
              openNotificationTarget(action.notification.data);
            },
          ),
        );

        await PushNotifications.createChannel({
          id: "matches",
          name: "Matches de materiais",
          description: "Avisos quando aparecer uma sobra compativel",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
          lights: true,
        });

        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
          permission = await PushNotifications.requestPermissions();
        }

        if (cancelled) return;
        if (permission.receive !== "granted") {
          toast.error("Permissao de notificacao negada no Android.");
          return;
        }

        await PushNotifications.register();
      } catch (error) {
        console.warn("[push] notificacoes nativas indisponiveis", error);
        toast.error(`Erro ao ativar notificacoes: ${errorMessage(error)}`);
      }
    };

    registerDevice();

    return () => {
      cancelled = true;
      handles.forEach((handle) => handle.remove());
    };
  }, [router, user]);
}
