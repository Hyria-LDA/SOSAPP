import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomNav } from "@/components/bottom-nav";

export const Route = createFileRoute("/_authenticated/app")({
  component: () => (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <Outlet />
      <BottomNav />
    </div>
  ),
});
