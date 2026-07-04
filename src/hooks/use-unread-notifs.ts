import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useUnreadNotifs() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notificacoes-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("lida", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notificacoes-unread", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  return data ?? 0;
}
