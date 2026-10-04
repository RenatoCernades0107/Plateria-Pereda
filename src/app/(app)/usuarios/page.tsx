import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { UsersTable } from "@/components/users/users-table";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const me = await requirePermission("usuarios.gestionar");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active")
    .order("full_name");
  if (error) throw error;

  const users = data.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    active: p.active,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Usuarios"
          description="Crea usuarios, asigna su rol y desactiva a quienes ya no deben ingresar."
        />
        <CreateUserDialog />
      </div>
      <UsersTable users={users} currentUserId={me.id} />
    </div>
  );
}
