"use client";

import { Pencil, Table2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setWorkshopActive } from "@/server/workshops-actions";

import { WorkshopDialog, type WorkshopRow } from "./workshop-dialog";

function WorkshopActions({ workshop }: { workshop: WorkshopRow }) {
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const result = await setWorkshopActive(workshop.id, !workshop.active);
      if ("error" in result) toast.error(result.error);
      else
        toast.success(
          workshop.active
            ? `${workshop.name} fue desactivado.`
            : `${workshop.name} fue activado.`,
        );
    });

  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      <WorkshopDialog
        workshop={workshop}
        trigger={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar ${workshop.name}`}
          >
            <Pencil />
            Editar
          </Button>
        }
      />
      <Button asChild variant="outline" size="sm">
        <Link
          href={`/talleres/${workshop.id}/piezas`}
          aria-label={`Ver piezas de ${workshop.name}`}
        >
          <Table2 />
          Piezas
        </Link>
      </Button>
      <Button
        variant={workshop.active ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={toggle}
      >
        {workshop.active ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function Contact({ workshop }: { workshop: WorkshopRow }) {
  const parts = [workshop.contactName, workshop.phone].filter(Boolean);
  return parts.length ? (
    <span>{parts.join(" · ")}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function WorkshopsList({ workshops }: { workshops: WorkshopRow[] }) {
  if (workshops.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        Aún no hay talleres. Crea el primero con &quot;Nuevo taller&quot;.
      </p>
    );
  }

  return (
    <>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Dirección</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workshops.map((w) => (
            <TableRow key={w.id} data-testid={`taller-${w.name}`}>
              <TableCell className="text-heading font-medium">
                {w.name}
              </TableCell>
              <TableCell>
                <Contact workshop={w} />
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {w.address || <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <StatusBadge active={w.active} />
              </TableCell>
              <TableCell>
                <WorkshopActions workshop={w} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Talleres">
        {workshops.map((w) => (
          <li
            key={w.id}
            className="space-y-3 rounded-lg border p-4"
            data-testid={`taller-movil-${w.name}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="text-heading text-base font-medium">{w.name}</p>
                <Contact workshop={w} />
                {w.address ? (
                  <p className="text-muted-foreground">{w.address}</p>
                ) : null}
              </div>
              <StatusBadge active={w.active} />
            </div>
            <WorkshopActions workshop={w} />
          </li>
        ))}
      </ul>
    </>
  );
}
