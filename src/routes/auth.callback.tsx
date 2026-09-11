import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallback,
});

const SESSION_WAIT_MS = 5000;

function goTo(path: "/app" | "/auth", navigate: ReturnType<typeof useNavigate>) {
  try {
    window.location.replace(path);
  } catch {
    navigate({ to: path });
  }
}

/**
 * Lê os parâmetros do retorno OAuth. O fluxo novo usa somente PKCE (?code=...),
 * mantendo tokens de sessão fora da URL.
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

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      try {
        const params = readAuthParams();

        const providerError =
          params.error_description || params.error_code || params.error;
        if (providerError) {
          console.error("[auth/callback] erro do provider", providerError);
          toast.error(decodeURIComponent(providerError));
          goTo("/auth", navigate);
          return;
        }

        const code = params.code;
        let flow: "pkce" | "existing" | "none" = "none";

        if (code) {
          flow = "pkce";
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            toast.error(`Falha ao concluir login: ${error.message}`);
            goTo("/auth", navigate);
            return;
          }
        }

        const { data: sessData } = await waitForSession();

        if (cancelled) return;

        if (!sessData?.session) {
          console.warn("[auth/callback] sessão nula após fluxo", { flow });
          toast.error("Sessão não encontrada após o login.");
          goTo("/auth", navigate);
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

        goTo("/app", navigate);
      } catch (err: any) {
        console.error("[auth/callback] exceção", err);
        toast.error(err?.message || "Erro ao concluir login");
        goTo("/auth", navigate);
      }
    };

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Concluindo seu login…
      </div>
    </div>
  );
}
