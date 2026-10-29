import { AppShell } from "@/components/app-shell";
import { SyncErrorsBanner } from "@/components/shopify/sync-errors-banner";
import { requireUser } from "@/server/auth";
import { shopifySyncErrors } from "@/server/shopify-sync/errors";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // Solo el admin ve (y puede reintentar) las sincronizaciones con Shopify en error.
  const syncErrors =
    user.role === "admin" ? await shopifySyncErrors() : { total: 0, links: [] };
  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      }}
    >
      <SyncErrorsBanner {...syncErrors} />
      {children}
    </AppShell>
  );
}
