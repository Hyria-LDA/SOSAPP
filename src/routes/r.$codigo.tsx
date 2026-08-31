import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { buildPartnerInstallLink } from "@/lib/partner-branch";

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
        await supabase.functions.invoke("track-partner-click", {
          body: {
            codigo,
            referer: document.referrer || null,
          },
        });
      } catch {
        // ignora — não bloqueia o usuário
      }

      const isMobileBrowser =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !Capacitor.isNativePlatform();
      if (isMobileBrowser) {
        window.location.replace(buildPartnerInstallLink(codigo));
        return;
      }
      navigate({ to: "/auth", replace: true });
    })();
  }, [codigo, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-secondary">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
