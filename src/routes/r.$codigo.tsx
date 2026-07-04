import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/r/$codigo")({
  component: RefLanding,
});

function RefLanding() {
  const { codigo } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        localStorage.setItem("ref_codigo", codigo);
        await supabase.rpc("registrar_clique_vendedor" as any, {
          _codigo: codigo,
          _referer: document.referrer || null,
          _user_agent: navigator.userAgent,
        });
      } catch {
        // ignora — não bloqueia o usuário
      } finally {
        navigate({ to: "/auth", replace: true });
      }
    })();
  }, [codigo, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-secondary">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
