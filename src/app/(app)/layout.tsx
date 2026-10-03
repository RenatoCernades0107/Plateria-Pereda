import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell
      user={{ fullName: user.fullName, email: user.email, role: user.role }}
    >
      {children}
    </AppShell>
  );
}
