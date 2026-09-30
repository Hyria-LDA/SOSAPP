import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireStoreRole } from "@/lib/store-portal";
import { StorePortal } from "@/components/store-portal/portal";
import { StoreAdminList } from "@/components/store-portal/admin";
export const Route = createFileRoute("/_authenticated/app/admin/lojistas")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
  }),
  beforeLoad: async () => {
    const r = await requireStoreRole(true);
    if (!r.user) throw redirect({ to: "/auth" });
    if (!r.allowed) throw redirect({ to: "/app" });
    return { portalUserId: r.user.id };
  },
  component: Page,
});
function Page() {
  const { store } = Route.useSearch();
  const { portalUserId } = Route.useRouteContext();
  return store ? (
    <StorePortal userId={portalUserId} key={store} storeId={store} manage />
  ) : (
    <StoreAdminList />
  );
}
