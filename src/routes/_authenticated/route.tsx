import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Rotas que podem ser acessadas sem login (visitantes)
function isPublicPath(pathname: string): boolean {
  if (pathname === "/app" || pathname === "/app/") return true;
  if (pathname.startsWith("/app/buscar")) return true;
  if (pathname.startsWith("/app/material/")) return true;
  return false;
}

async function getVerifiedUser() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), 12_000);
  });

  try {
    const result = await Promise.race([supabase.auth.getUser(), timeout]);
    if (!result || result.error) return null;
    return result.data.user ?? null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function RouteLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="mt-3 text-sm font-semibold">Abrindo o aplicativo...</p>
        <p className="mt-1 text-xs text-muted-foreground">Validando sua sessao com seguranca.</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: RouteLoading,
  beforeLoad: async ({ location }) => {
    const path = location.pathname;
    const publicPath = isPublicPath(path);

    // A home e as telas de consulta sao publicas. Ler a sessao local evita
    // deixar o app em branco se a rede estiver lenta durante a inicializacao.
    if (publicPath) {
      const { data } = await supabase.auth.getSession();
      return { user: data.session?.user ?? null };
    }

    const user = await getVerifiedUser();

    if (!user) {
      throw redirect({ to: "/auth" });
    }

    // Empresa onboarding gate apenas para áreas autenticadas
    if (!publicPath) {
      // Vendedores parceiros não precisam de onboarding de empresa
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isVendedor = (roles ?? []).some((r: any) => r.role === "vendedor");

      if (isVendedor) {
        if (path.startsWith("/onboarding")) throw redirect({ to: "/app/vendedor" });
        return { user };
      }

      const { data: empresa } = await supabase
        .from("empresas")
        .select("onboarded")
        .eq("owner_id", user.id)
        .maybeSingle();

      const needsOnboarding = !empresa?.onboarded;
      const onOnboarding = path.startsWith("/onboarding");
      if (needsOnboarding && !onOnboarding) throw redirect({ to: "/onboarding" });
      if (!needsOnboarding && onOnboarding) throw redirect({ to: "/app" });
    }

    return { user };
  },
  component: () => <Outlet />,
});
