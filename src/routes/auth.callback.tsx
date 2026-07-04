import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
});

const NATIVE_SCHEME = "sosmarceneiros://auth-callback";
const SESSION_WAIT_MS = 5000;

function buildNativeUrl(session: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  provider_token?: string | null;
  provider_refresh_token?: string | null;
}) {
  const frag = new URLSearchParams();
  frag.set("access_token", session.access_token);
  frag.set("refresh_token", session.refresh_token);
  if (session.expires_in) frag.set("expires_in", String(session.expires_in));
  frag.set("token_type", session.token_type ?? "bearer");
  if (session.provider_token) frag.set("provider_token", session.provider_token);
  if (session.provider_refresh_token)
    frag.set("provider_refresh_token", session.provider_refresh_token);
  return `${NATIVE_SCHEME}#${frag.toString()}`;
}

/**
 * Lê parâmetros tanto do query string quanto do fragmento (#),
 * cobrindo PKCE (?code=...) e Implicit/setSession (#access_token=...).
 */
function readAuthParams() {
  const params: Record<string, string> = {};
  try {
    const search = new URLSearchParams(window.location.search);
    search.forEach((v, k) => {
      params[k] = v;
    });
  } catch {}
  try {
    const rawHash = window.location.hash?.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash ?? "";
    if (rawHash) {
      const hash = new URLSearchParams(rawHash);
      hash.forEach((v, k) => {
        if (!(k in params)) params[k] = v;
      });
    }
  } catch {}
  return params;
}

async function waitForSession() {
  const immediate = await supabase.auth.getSession();
  if (immediate.data.session || immediate.error) return immediate;

  return await new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>((resolve) => {
    let resolved = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const done = (value: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      if (resolved) return;
      resolved = true;
      if (subscription) subscription.unsubscribe();
      resolve(value);
    };

    const timeout = window.setTimeout(async () => {
      done(await supabase.auth.getSession());
    }, SESSION_WAIT_MS);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      window.clearTimeout(timeout);
      done({ data: { session }, error: null });
    });

    subscription = data.subscription;
  });
}

function AuthCallback() {
  const navigate = useNavigate();
  const [nativeHandoff, setNativeHandoff] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        const params = readAuthParams();
        console.info("[auth/callback] params recebidos", {
          keys: Object.keys(params),
          href: window.location.href,
        });

        const providerError =
          params.error_description || params.error_code || params.error;
        if (providerError) {
          console.error("[auth/callback] erro do provider", providerError);
          toast.error(decodeURIComponent(providerError));
          navigate({ to: "/auth" });
          return;
        }

        const isNative =
          params.native === "1" ||
          (typeof sessionStorage !== "undefined" &&
            sessionStorage.getItem("lov:native") === "1");

        const code = params.code;
        const accessToken = params.access_token;
        const refreshToken = params.refresh_token;

        let flow: "tokens" | "pkce" | "existing" | "none" = "none";

        // 1) Tokens diretos no fragmento — usar setSession.
        if (accessToken && refreshToken) {
          flow = "tokens";
          console.info("[auth/callback] fluxo: tokens diretos (#access_token)");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          console.info("[auth/callback] setSession", {
            hasSession: !!data?.session,
            user: data?.session?.user?.email,
            error: error?.message,
          });
          if (error) {
            toast.error(`Falha ao restaurar sessão: ${error.message}`);
            navigate({ to: "/auth" });
            return;
          }
        }
        // 2) PKCE — code -> exchangeCodeForSession.
        else if (code) {
          flow = "pkce";
          console.info("[auth/callback] fluxo: PKCE (?code=)");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          console.info("[auth/callback] exchangeCodeForSession", {
            hasSession: !!data?.session,
            user: data?.session?.user?.email,
            error: error?.message,
          });
          if (error) {
            toast.error(`Falha ao concluir login: ${error.message}`);
            navigate({ to: "/auth" });
            return;
          }
        } else {
          console.info(
            "[auth/callback] fluxo: nenhum code/token na URL — verificando sessão existente",
          );
        }

        const { data: sessData, error: sessError } = await waitForSession();

        console.info("[auth/callback] getSession final", {
          flow,
          hasSession: !!sessData?.session,
          user: sessData?.session?.user?.email,
          hasAccessToken: !!sessData?.session?.access_token,
          hasRefreshToken: !!sessData?.session?.refresh_token,
          error: sessError?.message,
          isNative,
        });

        if (cancelled) return;

        if (!sessData?.session) {
          console.warn("[auth/callback] sessão nula após fluxo", { flow });
          toast.error("Sessão não encontrada após o login.");
          navigate({ to: "/auth" });
          return;
        }

        if (flow === "none") flow = "existing";

        // Limpa a URL para remover tokens/code antes de prosseguir.
        try {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        } catch {}

        if (isNative) {
          const deepUrl = buildNativeUrl({
            access_token: sessData.session.access_token,
            refresh_token: sessData.session.refresh_token,
            expires_in: sessData.session.expires_in,
            token_type: sessData.session.token_type,
            provider_token: sessData.session.provider_token,
            provider_refresh_token: sessData.session.provider_refresh_token,
          });
          try {
            sessionStorage.removeItem("lov:native");
          } catch {}
          setNativeHandoff(deepUrl);
          console.info("[auth/callback] deep link nativo", { scheme: NATIVE_SCHEME });
          window.location.replace(deepUrl);
          return;
        }

        console.info("[auth/callback] sessão OK — redirecionando para /app", {
          flow,
        });
        navigate({ to: "/app" });
      } catch (err: any) {
        console.error("[auth/callback] exceção", err);
        toast.error(err?.message || "Erro ao concluir login");
        navigate({ to: "/auth" });
      }
    };

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (nativeHandoff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p>Voltando para o aplicativo SOS Marceneiros…</p>
          <a
            href={nativeHandoff}
            className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-soft"
          >
            Abrir no app
          </a>
          <p className="text-xs">
            Se nada acontecer, feche esta aba e volte ao aplicativo manualmente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Concluindo seu login…
      </div>
    </div>
  );
}
