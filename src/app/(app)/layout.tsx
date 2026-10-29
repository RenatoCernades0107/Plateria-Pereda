import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/server/auth";
import { shopifySyncErrors } from "@/server/shopify-sync/errors";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // Solo el admin ve (y puede reintentar) las sincronizaciones con Shopify en error.
  const syncErrors =
    user.role === "admin" ? await shopifySyncErrors() : undefined;
  return (
    <AppShell
      user={{
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      }}
      syncErrors={syncErrors}
    >
      {children}
    </AppShell>
  );
}
