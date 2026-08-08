import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/redefinir")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checkingLink, setCheckingLink] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(!!data.session);
      setCheckingLink(false);
    };

    void checkSession();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
        setCheckingLink(false);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      toast.error("As senhas não são iguais.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      toast.success("Senha alterada! Entre novamente com a nova senha.");
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar a senha.";
      toast.error(message, { duration: 8000 });
    } finally {
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
          <h1 className="text-xl font-bold">Criar nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma nova senha para acessar sua conta.
          </p>

          {checkingLink ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : hasSession ? (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <Field label="Nova senha">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="Mínimo de 6 caracteres"
                />
              </Field>

              <Field label="Confirmar nova senha">
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="Digite novamente"
                />
              </Field>

              <button
                disabled={loading}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground shadow-soft transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Alterar senha"}
              </button>
            </form>
          ) : (
            <div className="mt-5 space-y-4">
              <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Este link é inválido ou expirou. Solicite um novo link na tela de entrada.
              </p>
              <Link
                to="/auth"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                Voltar para entrar
              </Link>
            </div>
          )}
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
