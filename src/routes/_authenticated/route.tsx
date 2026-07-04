import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Rotas que podem ser acessadas sem login (visitantes)
function isPublicPath(pathname: string): boolean {
  if (pathname === "/app" || pathname === "/app/") return true;
  if (pathname.startsWith("/app/buscar")) return true;
  if (pathname.startsWith("/app/material/")) return true;
  return false;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const path = location.pathname;
    const publicPath = isPublicPath(path);

    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : (data?.user ?? null);

    if (!user) {
      if (publicPath) return { user: null };
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
