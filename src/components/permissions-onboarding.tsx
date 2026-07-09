import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  PushNotifications,
  type Token,
} from "@capacitor/push-notifications";
import { Bell, Camera, CheckCircle2, Image, Loader2, MapPin, ShieldCheck, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sos_permissions_intro_seen_v1";

type PermissionStatus = "idle" | "loading" | "granted" | "blocked" | "unavailable";

type NativePushResult = {
  ok?: boolean;
  message?: string;
};

declare global {
  interface Window {
    SOSPush?: {
      register?: (accessToken: string, supabaseUrl: string, anonKey: string) => void;
    };
  }
}

function statusText(status: PermissionStatus) {
  if (status === "loading") return "Solicitando...";
  if (status === "granted") return "Ativado";
  if (status === "blocked") return "Bloqueado";
  if (status === "unavailable") return "Quando usar";
  return "Pendente";
}

function StatusPill({ status }: { status: PermissionStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        status === "granted" && "bg-emerald-100 text-emerald-700",
        status === "loading" && "bg-orange-100 text-orange-700",
        status === "blocked" && "bg-red-100 text-red-700",
        status === "unavailable" && "bg-slate-100 text-slate-600",
        status === "idle" && "bg-amber-100 text-amber-700",
      )}
    >
      {statusText(status)}
    </span>
  );
}

function PermissionRow({
  icon,
  title,
  description,
  status,
  actionLabel,
  disabled,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: PermissionStatus;
  actionLabel: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">{title}</p>
            <StatusPill status={status} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          {onAction ? (
            <Button
              type="button"
              variant={status === "granted" ? "secondary" : "outline"}
              size="sm"
              className="mt-3 h-8 rounded-full"
              disabled={disabled || status === "loading" || status === "granted"}
              onClick={onAction}
            >
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function savePushToken(token: string) {
  const { error } = await supabase.rpc("register_push_token", {
    p_platform: Capacitor.getPlatform(),
    p_token: token,
  });

  if (error) throw error;
}

export function PermissionsOnboarding() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<PermissionStatus>("idle");
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>("idle");
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>("idle");

  const isNativeApp = useMemo(() => Capacitor.isNativePlatform(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!isNativeApp) {
      setPushStatus("unavailable");
      return;
    }

    PushNotifications.checkPermissions()
      .then((permission) => {
        if (permission.receive === "granted") setPushStatus("granted");
      })
      .catch(() => {
        setPushStatus("idle");
      });
  }, [isNativeApp, open]);

  const close = () => {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  };

  const requestPush = async () => {
    if (!isNativeApp) {
      setPushStatus("unavailable");
      toast.info("Notificacoes push aparecem no APK instalado no celular.");
      return;
    }

    if (!user) {
      toast.info("Entre na conta para vincular as notificacoes a este celular.");
      return;
    }

    setPushStatus("loading");

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (window.SOSPush?.register && accessToken && supabaseUrl && anonKey) {
        window.addEventListener(
          "sos-push-result",
          (event) => {
            const detail = (event as CustomEvent<NativePushResult>).detail ?? {};
            if (detail.ok) {
              setPushStatus("granted");
              toast.success(detail.message || "Notificacoes ativadas.");
              return;
            }

            setPushStatus("blocked");
            toast.error(detail.message || "Nao foi possivel ativar as notificacoes.");
          },
          { once: true },
        );
        window.SOSPush.register(accessToken, supabaseUrl, anonKey);
        return;
      }

      if (!Capacitor.isPluginAvailable("PushNotifications")) {
        setPushStatus("unavailable");
        toast.error("Reinstale o APK mais novo para ativar notificacoes.");
        return;
      }

      const handles: PluginListenerHandle[] = [];
      let resolved = false;

      handles.push(
        await PushNotifications.addListener("registration", async (token: Token) => {
          if (resolved) return;
          resolved = true;
          try {
            await savePushToken(token.value);
            setPushStatus("granted");
            toast.success("Notificacoes ativadas.");
          } catch (error) {
            setPushStatus("blocked");
            toast.error(error instanceof Error ? error.message : "Erro ao salvar notificacao.");
          } finally {
            handles.forEach((handle) => handle.remove());
          }
        }),
      );

      handles.push(
        await PushNotifications.addListener("registrationError", () => {
          if (resolved) return;
          resolved = true;
          setPushStatus("blocked");
          toast.error("O Android nao liberou as notificacoes.");
          handles.forEach((handle) => handle.remove());
        }),
      );

      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive !== "granted") {
        setPushStatus("blocked");
        toast.error("Permissao de notificacao negada.");
        handles.forEach((handle) => handle.remove());
        return;
      }

      await PushNotifications.register();
    } catch (error) {
      setPushStatus("blocked");
      toast.error(error instanceof Error ? error.message : "Erro ao ativar notificacoes.");
    }
  };

  const requestLocation = async () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      toast.error("Localizacao indisponivel neste aparelho.");
      return;
    }

    setLocationStatus("loading");

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationStatus("granted");
        toast.success("Localizacao ativada.");
      },
      () => {
        setLocationStatus("blocked");
        toast.error("Permissao de localizacao negada.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
    );
  };

  const requestCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      toast.info("A camera sera solicitada quando voce tirar a foto no anuncio.");
      return;
    }

    setCameraStatus("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus("granted");
      toast.success("Camera ativada.");
    } catch {
      setCameraStatus("blocked");
      toast.error("Permissao da camera negada.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border-0 p-0 shadow-2xl sm:max-w-md">
        <div className="bg-gradient-to-br from-orange-50 via-white to-emerald-50 p-5">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl leading-tight">Permissoes do SOS Marceneiros</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Libere agora os acessos usados para receber avisos, encontrar sobras perto de voce e
              tirar fotos nos anuncios.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-3">
            <PermissionRow
              icon={<Bell className="h-5 w-5" />}
              title="Notificacoes"
              description="Avisos de matches, mensagens importantes e alertas enviados pelo painel."
              status={pushStatus}
              actionLabel={user ? "Ativar notificacoes" : "Entre para ativar"}
              disabled={!user}
              onAction={requestPush}
            />
            <PermissionRow
              icon={<MapPin className="h-5 w-5" />}
              title="Localizacao"
              description="Calcula distancia e ajuda a mostrar materiais mais proximos."
              status={locationStatus}
              actionLabel="Permitir localizacao"
              onAction={requestLocation}
            />
            <PermissionRow
              icon={<Camera className="h-5 w-5" />}
              title="Camera"
              description="Permite tirar foto direto na postagem de sobras."
              status={cameraStatus}
              actionLabel="Permitir camera"
              onAction={requestCamera}
            />
            <PermissionRow
              icon={<Image className="h-5 w-5" />}
              title="Galeria de fotos"
              description="O Android vai pedir acesso quando voce escolher uma imagem da galeria."
              status="unavailable"
              actionLabel="Quando usar"
            />
          </div>

          <DialogFooter className="mt-5 gap-2 sm:flex-col sm:space-x-0">
            <Button type="button" className="h-11 rounded-full" onClick={close}>
              Continuar no app
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={close}>
              Fazer depois
              <XCircle className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
