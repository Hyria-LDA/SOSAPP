import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";
type PermissionStatus = { receive: PermissionState };
type PushToken = { value: string };
type PushData = Record<string, unknown>;
type PushNotificationSchema = {
  title?: string;
  body?: string;
  data?: PushData;
};
type PushNotificationAction = {
  notification: PushNotificationSchema;
};
type PushNotificationChannel = {
  id: string;
  name: string;
  description?: string;
  importance?: number;
  visibility?: number;
  sound?: string;
  vibration?: boolean;
  lights?: boolean;
};
type PushNotificationsPlugin = {
  checkPermissions: () => Promise<PermissionStatus>;
  requestPermissions: () => Promise<PermissionStatus>;
  register: () => Promise<void>;
  createChannel: (channel: PushNotificationChannel) => Promise<void>;
  addListener: (
    eventName: "registration",
    listenerFunc: (token: PushToken) => void,
  ) => Promise<PluginListenerHandle>;
  addListener: (
    eventName: "registrationError",
    listenerFunc: (error: { error: string }) => void,
  ) => Promise<PluginListenerHandle>;
  addListener: (
    eventName: "pushNotificationReceived",
    listenerFunc: (notification: PushNotificationSchema) => void,
  ) => Promise<PluginListenerHandle>;
  addListener: (
    eventName: "pushNotificationActionPerformed",
    listenerFunc: (action: PushNotificationAction) => void,
  ) => Promise<PluginListenerHandle>;
};

const PushNotifications = registerPlugin<PushNotificationsPlugin>("PushNotifications");

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

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
        handles.push(
          await PushNotifications.addListener("registration", async (token) => {
            const { error } = await supabase.rpc("register_push_token", {
              p_platform: Capacitor.getPlatform(),
              p_token: token.value,
            });
            if (error) console.warn("[push] erro ao salvar token", error);
          }),
        );

        handles.push(
          await PushNotifications.addListener("registrationError", (error) => {
            console.warn("[push] erro ao registrar notificacoes", error);
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
          await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            openNotificationTarget(action.notification.data);
          }),
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

        if (cancelled || permission.receive !== "granted") return;
        await PushNotifications.register();
      } catch (error) {
        console.warn("[push] notificacoes nativas indisponiveis", error);
      }
    };

    registerDevice();

    return () => {
      cancelled = true;
      handles.forEach((handle) => handle.remove());
    };
  }, [router, user]);
}
