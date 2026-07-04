import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function isMissingProviderError(msg: string | undefined | null): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("missing oauth secret") ||
    m.includes("unsupported provider") ||
    m.includes("provider is not enabled")
  );
}

function generateOAuthState() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  // Quando o Google OAuth está indisponível no backend, escondemos o botão e
  // forçamos o fluxo apenas por e-mail/senha.
  const [googleUnavailable, setGoogleUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        navigate({ to: "/app", replace: true });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/app", replace: true });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Conta criada!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
      // Detecta wrapper nativo: Capacitor (Android/iOS), DreamFlow/Flutter, ou WebView Android.
      // Quando for o caso, marcamos a flag para que /auth/callback faça o handoff via
      // deep link `sosmarceneiros://auth-callback` de volta ao app nativo após o login.
      const w = typeof window !== "undefined" ? (window as any) : {};
      const isCapacitor =
        !!w?.Capacitor?.isNativePlatform?.() ||
        !!w?.Capacitor?.getPlatform?.() &&
          ["android", "ios"].includes(w.Capacitor.getPlatform());
      const isAndroid = /Android/i.test(ua);
      const isWebViewish =
        /(; wv\)|\bwv\b)/i.test(ua) || /DreamFlow|Flutter|Capacitor/i.test(ua);
      const isNativeWrapper = isCapacitor || (isAndroid && isWebViewish);
      try {
        sessionStorage.setItem("lov:native", isNativeWrapper ? "1" : "0");
      } catch {}

      const redirectTo = `${window.location.origin}/auth/callback${
        isNativeWrapper ? "?native=1" : ""
      }`;

      // eslint-disable-next-line no-console
      console.info("[auth/google] iniciando via Lovable Cloud wrapper", {
        ua,
        redirectTo,
        isNativeWrapper,
        origin: window.location.origin,
      });

      if (isNativeWrapper) {
        const params = new URLSearchParams({
          provider: "google",
          redirect_uri: redirectTo,
          state: generateOAuthState(),
          access_type: "offline",
          prompt: "select_account",
        });
        const oauthUrl = `${window.location.origin}/~oauth/initiate?${params.toString()}`;
        const { Browser } = await import("@capacitor/browser");

        await Browser.open({
          url: oauthUrl,
          presentationStyle: "fullscreen",
          windowName: "_blank",
        });
        return;
      }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectTo,
        extraParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      });

      // eslint-disable-next-line no-console
      console.info("[auth/google] resposta Lovable wrapper", {
        redirected: (result as any)?.redirected,
        hasTokens: !!(result as any)?.tokens,
        error: (result as any)?.error?.message,
      });

      if ((result as any)?.error) {
        const err = (result as any).error as Error;
        // eslint-disable-next-line no-console
        console.error("[auth/google] erro wrapper", {
          name: err?.name,
          message: err?.message,
        });

        if (isMissingProviderError(err?.message)) {
          setGoogleUnavailable(true);
          toast.error(
            "O login Google ainda não está configurado no servidor do projeto. " +
              "É necessário concluir a configuração do provedor Google OAuth no Lovable Cloud. " +
              "Use e-mail e senha para entrar.",
            { duration: 8000 },
          );
        } else {
          toast.error(`Falha no Google: ${err?.message ?? "erro desconhecido"}`);
        }
        setLoading(false);
        return;
      }

      if ((result as any)?.redirected) {
        // Navegador redirecionou para o provider — nada a fazer aqui.
        return;
      }

      // Tokens retornados via popup/web_message: sessão já foi setada pelo wrapper.
      navigate({ to: "/app" });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[auth/google] exceção", err);
      if (isMissingProviderError(err?.message)) {
        setGoogleUnavailable(true);
        toast.error(
          "O login Google ainda não está configurado no servidor do projeto. " +
            "É necessário concluir a configuração do provedor Google OAuth no Lovable Cloud. " +
            "Use e-mail e senha para entrar.",
          { duration: 8000 },
        );
      } else {
        toast.error(err?.message || "Falha inesperada no login com Google");
      }
      setLoading(false);
    }
  };

  return (
    <div className="safe-top safe-bottom flex min-h-screen flex-col bg-secondary px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="rounded-3xl bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold">
            {mode === "signin" ? "Entrar na sua conta" : "Criar conta gratuita"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Acesse seu estoque e oportunidades."
              : "Comece a anunciar suas sobras em minutos."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === "signup" && (
              <Field label="Seu nome">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="João da Silva"
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputCls}
                placeholder="voce@empresa.com.br"
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputCls}
                placeholder="••••••••"
              />
            </Field>

            <button
              disabled={loading}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : mode === "signin" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </button>
          </form>

          {!googleUnavailable && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> ou{" "}
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                onClick={google}
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card font-medium transition active:scale-[0.98] disabled:opacity-60"
              >
                <GoogleIcon /> Continuar com Google
              </button>
            </>
          )}

          {googleUnavailable && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Login com Google temporariamente indisponível. Use e-mail e senha acima.
            </p>
          )}

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm text-muted-foreground"
          >
            {mode === "signin" ? (
              <>
                Não tem conta? <span className="font-semibold text-primary">Cadastrar</span>
              </>
            ) : (
              <>
                Já tem conta? <span className="font-semibold text-primary">Entrar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none ring-primary/30 transition focus:ring-2";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
