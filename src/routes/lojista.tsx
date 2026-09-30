import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireStoreRole } from "@/lib/store-portal";
import { StorePortal } from "@/components/store-portal/portal";
export const Route = createFileRoute("/lojista")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    store: typeof s.store === "string" ? s.store : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const r = await requireStoreRole();
    if (!r.user) throw redirect({ to: "/auth" });
    if (!r.allowed) throw redirect({ to: "/app" });
    if (search.store && !r.admin)
      throw redirect({ to: "/lojista", search: { store: undefined } });
    if (r.admin && !search.store)
      throw redirect({
        to: "/app/admin/lojistas",
        search: { store: undefined },
      });
    return { portalUserId: r.user.id };
  },
  component: Page,
});
function Page() {
  const { store } = Route.useSearch();
  const { portalUserId } = Route.useRouteContext();
  return (
    <StorePortal
      userId={portalUserId}
      key={store || "self"}
      storeId={store}
      viewAs={!!store}
    />
  );
}
