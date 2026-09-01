import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";

type UpdateState = {
  platform: "android" | "ios";
  currentBuild: number;
  minBuild: number;
  latestVersion: string;
  message: string;
  storeUrl: string;
};

export function ForceUpdateGate() {
  const [required, setRequired] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        setRequired(null);
        return;
      }

      const platform = Capacitor.getPlatform();
      if (platform !== "android" && platform !== "ios") return;

      setChecking(true);
      const [{ App }, policyResult] = await Promise.all([
        import("@capacitor/app"),
        supabase
          .from("app_update_policy" as any)
          .select("platform,min_build,latest_version,force_update,message,store_url")
          .eq("platform", platform)
          .maybeSingle(),
      ]);
      const info = await App.getInfo();
      const policy = policyResult.data as any;
      const currentBuild = Number.parseInt(String(info.build || "0"), 10);
      const minBuild = Number(policy?.min_build ?? 0);

      if (policy?.force_update && Number.isFinite(currentBuild) && currentBuild < minBuild) {
        setRequired({
          platform,
          currentBuild,
          minBuild,
          latestVersion: String(policy.latest_version || ""),
          message: String(policy.message || "Uma atualização é necessária."),
          storeUrl: String(policy.store_url || ""),
        });
      } else {
        setRequired(null);
      }
    } catch (error) {
      // Falha aberta: uma indisponibilidade do servidor não bloqueia todos os usuários.
      console.warn("[force-update] não foi possível verificar a versão", error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkVersion();
  }, [checkVersion]);

  if (!required) return null;

  const openStore = async () => {
    if (!required.storeUrl) return;
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: required.storeUrl });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <Logo className="mx-auto h-28" />
        <div className="mt-5 rounded-3xl border border-border bg-card p-6 shadow-pop">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <Download className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-black">Atualização necessária</h1>
          <p className="mt-2 text-sm text-muted-foreground">{required.message}</p>
          {required.latestVersion && (
            <p className="mt-2 text-xs font-semibold">Nova versão: {required.latestVersion}</p>
          )}
          <button
            type="button"
            onClick={openStore}
            className="mt-5 h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            Atualizar agora
          </button>
          <button
            type="button"
            onClick={checkVersion}
            disabled={checking}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-xs font-bold disabled:opacity-60"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Já atualizei, verificar novamente
          </button>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Build instalado: {required.currentBuild} · mínimo necessário: {required.minBuild}
          </p>
        </div>
      </div>
    </div>
  );
}

