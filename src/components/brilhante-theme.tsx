import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { PlanStatus } from "@/hooks/use-plan-status";
import { supabase } from "@/integrations/supabase/client";
import { hasBrilhanteTheme } from "@/lib/brilhante-theme";

export function BrilhanteTheme() {
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now);
  const plan = useQuery({
    // Isolate appearance by account; existing purchase invalidations still match this prefix.
    queryKey: ["plan-status", "appearance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user || auth.user.id !== user?.id) return null;
      const { data, error } = await supabase.rpc("get_user_plan_status" as never, { _user_id: auth.user.id } as never);
      if (error) throw error;
      return data as unknown as PlanStatus;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const active = !!user && !plan.isError && hasBrilhanteTheme(plan.data, now);
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = meta?.content;
    root.classList.add("brilhante-cinza");
    if (meta) meta.content = "#eceef1";
    return () => {
      root.classList.remove("brilhante-cinza");
      if (meta && previous !== undefined) meta.content = previous;
    };
  }, [active]);
  return null;
}
