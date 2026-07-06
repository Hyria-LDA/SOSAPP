import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomNav } from "@/components/bottom-nav";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  usePushNotifications();

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <Outlet />
      <BottomNav />
    </div>
  );
}
