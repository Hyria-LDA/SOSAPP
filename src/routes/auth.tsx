import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";

const PUBLIC_SITE_URL = "https://sosmarceneiros.com.br";

function getPublicOrigin() {
  if (typeof window === "undefined") return PUBLIC_SITE_URL;
  const origin = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  return PUBLIC_SITE_URL;
}

function isMissingNativePlugin(err: unknown) {
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  return msg.includes("not implemented") || msg.includes("plugin is not implemented");
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  // Quando o Google OAuth estÃ¡ indisponÃ­vel no backend, escondemos o botÃ£o e
  // forÃ§amos o fluxo apenas por e-mail/senha.
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
            emailRedirectTo: getPublicOrigin(),
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

  const googleNative = async () => {
    const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId) {
      throw new Error("Configure VITE_GOOGLE_WEB_CLIENT_ID no Vercel com o Client ID Web do Google.");
    }

    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      google: {
        webClientId,
        mode: "online",
      },
    });

    const login = await SocialLogin.login({
      provider: "google",
    });

    const idToken = (login as any)?.result?.idToken;
    if (!idToken) throw new Error("O Google não retornou idToken para autenticar no Supabase.");

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (error) throw error;
    navigate({ to: "/app", replace: true });
  };

  const google = async () => {
    setLoading(true);
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
      const w = typeof window !== "undefined" ? (window as any) : {};
      const platform = w?.Capacitor?.getPlatform?.();
      const isCapacitor =
        !!w?.Capacitor?.isNativePlatform?.() ||
        (!!platform && ["android", "ios"].includes(platform));
      const isWebViewish =
        /(; wv\)|\bwv\b)/i.test(ua) || /DreamFlow|Flutter|Capacitor/i.test(ua);
      const isNativeWrapper = isCapacitor || isWebViewish;

      if (isNativeWrapper) {
        try {
          await googleNative();
          return;
        } catch (nativeError) {
          if (!isMissingNativePlugin(nativeError)) throw nativeError;
          console.warn("[auth/google] SocialLogin indisponivel no APK instalado", nativeError);
          throw new Error(
            "Este APK ainda nao tem o login Google nativo. Instale a versao mais nova do app.",
          );
        }
      }

      try {
        sessionStorage.setItem("lov:native", isNativeWrapper ? "1" : "0");
      } catch {}

      const redirectTo = `${getPublicOrigin()}/auth/callback${
        isNativeWrapper ? "?native=1" : ""
      }`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
          skipBrowserRedirect: isNativeWrapper,
        } as any,
      });

      if (error) throw error;

      if (isNativeWrapper) throw new Error("O app Android precisa usar o login Google nativo.");
    } catch (err: any) {
      console.error("[auth/google] excecao", err);
      const msg = String(err?.message ?? "");
      if (
        msg.toLowerCase().includes("provider is not enabled") ||
        msg.toLowerCase().includes("unsupported provider")
      ) {
        setGoogleUnavailable(true);
        toast.error(
          "O login Google ainda nao esta configurado no Supabase. " +
            "Conclua a configuracao do provedor Google OAuth no Supabase. " +
            "Use e-mail e senha para entrar.",
          { duration: 8000 },
        );
      } else if (isMissingNativePlugin(err)) {
        toast.error(
          "Este APK ainda nao tem o login Google nativo. Instale a versao mais nova do app.",
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
                  placeholder="Joao da Silva"
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
                placeholder="Sua senha"
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
              Login com Google temporariamente indisponÃ­vel. Use e-mail e senha acima.
            </p>
          )}

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm text-muted-foreground"
          >
            {mode === "signin" ? (
              <>
                NÃ£o tem conta? <span className="font-semibold text-primary">Cadastrar</span>
              </>
            ) : (
              <>
                JÃ¡ tem conta? <span className="font-semibold text-primary">Entrar</span>
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
