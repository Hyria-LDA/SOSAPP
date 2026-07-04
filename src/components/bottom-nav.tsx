import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Package, Mail, User, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadNotifs } from "@/hooks/use-unread-notifs";

type Item = { to: string; label: string; icon: typeof Home; exact?: boolean; badge?: number };

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadNotifs();
  if (pathname.startsWith("/app/material/")) return null;

  const items: Item[] = [
    { to: "/app", label: "Início", icon: Home, exact: true },
    { to: "/app/estoque", label: "Estoque", icon: Package },
    { to: "/app/notificacoes", label: "Notificações", icon: Mail, badge: unread },
    { to: "/app/perfil", label: "Perfil", icon: User },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-2">
        {items.slice(0, 2).map((it) => (
          <NavItem key={it.to} {...it} active={isActive(it.to, it.exact)} />
        ))}
        <div className="flex justify-center">
          <Link
            to="/app/anunciar"
            className="-mt-7 grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop ring-4 ring-background transition active:scale-95"
            aria-label="Anunciar sobra"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
        </div>
        {items.slice(2).map((it) => (
          <NavItem key={it.to} {...it} active={isActive(it.to, it.exact)} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  badge,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <div className="relative">
        <Icon className={cn("h-5 w-5", active && "scale-110")} />
        {badge && badge > 0 ? (
          <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </div>
      <span>{label}</span>
    </Link>
  );
}
