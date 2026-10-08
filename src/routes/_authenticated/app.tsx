import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { BottomNav } from "@/components/bottom-nav";
import { PermissionsOnboarding } from "@/components/permissions-onboarding";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  usePushNotifications();
  const wide=useRouterState({select:s=>s.location.pathname.startsWith("/app/admin/lojistas") || s.location.pathname.startsWith("/app/admin/ultimas-sobras")});

  return (
    <div className={`mx-auto min-h-screen ${wide?"max-w-6xl":"max-w-md"} bg-background pb-24`}>
      <Outlet />
      <BottomNav />
      <PermissionsOnboarding />
    </div>
  );
}
