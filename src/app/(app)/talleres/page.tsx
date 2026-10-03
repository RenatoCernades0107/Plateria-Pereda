import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WorkshopDialog } from "@/components/workshops/workshop-dialog";
import { WorkshopsList } from "@/components/workshops/workshops-list";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Talleres" };

export default async function TalleresPage() {
  await requirePermission("talleres.gestionar");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .select("id, name, contact_name, phone, address, notes, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) throw error;

  const workshops = data.map((w) => ({
    id: w.id,
    name: w.name,
    contactName: w.contact_name,
    phone: w.phone,
    address: w.address,
    notes: w.notes,
    active: w.active,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Talleres"
          description="Talleres externos a los que se envían las piezas. Los inactivos no se pueden asignar."
        />
        <WorkshopDialog
          trigger={
            <Button>
              <Plus />
              Nuevo taller
            </Button>
          }
        />
      </div>
      <WorkshopsList workshops={workshops} />
    </div>
  );
}
