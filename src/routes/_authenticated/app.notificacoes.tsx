import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Mail, Package, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/app/notificacoes")({
  component: NotificacoesPage,
});

type Notif = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  material_id: string | null;
  pedido_id: string | null;
  lida: boolean;
  created_at: string;
};

function NotificacoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notificacoes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  // Realtime: nova notificação para este usuário
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notificacoes", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  // Marca todas como lidas ao abrir
  useEffect(() => {
    if (!user) return;
    supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("user_id", user.id)
      .eq("lida", false)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["notificacoes-unread", user.id] });
      });
  }, [user, data?.length, qc]);

  return (
    <div className="pb-24">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/app" className="grid h-9 w-9 place-items-center rounded-xl bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex-1 text-lg font-black">📬 Notificações</h1>
      </header>

      <div className="space-y-3 px-4 py-4">
        {isLoading && (
          <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
        )}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Mail className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Publique um pedido ou um anúncio e te avisamos.
            </p>
          </div>
        )}

        {data?.map((n) => {
          const isComprador = n.tipo === "match_comprador";
          const Icon = isComprador ? ShoppingBag : Package;
          return (
            <article
              key={n.id}
              className={`rounded-2xl border bg-card p-4 shadow-card ${!n.lida ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isComprador ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{n.titulo}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{n.mensagem}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </div>
                  {n.material_id && (
                    <Link
                      to="/app/material/$id"
                      params={{ id: n.material_id }}
                      className="mt-3 inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
                    >
                      {isComprador ? "Ver anúncio" : "Ver interessado"}
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
