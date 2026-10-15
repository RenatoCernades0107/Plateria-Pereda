"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PieceStatus } from "@/domain/piece-state-machine";
import { cn } from "@/lib/utils";
import { assignWorkshop } from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import { WORKSHOP_LOCKED } from "./pieces-bulk-bar";

const NO_WORKSHOP = "ninguno";

/**
 * Lápiz que abre el diálogo para asignar o cambiar el taller de una pieza (logística y
 * el admin, P55). Lo usan la tabla de piezas (solo si la pieza aún no tiene taller) y
 * el detalle de la pieza, donde se cambia un taller ya asignado.
 */
export function WorkshopEditButton({
  piece,
  workshops,
  className,
}: {
  piece: {
    id: string;
    code: string;
    workshopId: string | null;
    workshopName?: string | null;
  };
  /** Talleres activos para elegir. */
  workshops: WorkshopOption[];
  className?: string;
}) {
  const current = piece.workshopId ?? NO_WORKSHOP;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const selectId = `taller-${piece.id}`;
  const action = piece.workshopId ? "Cambiar taller" : "Asignar taller";
  // Un taller ya desactivado sigue en la lista para que el selector lo muestre.
  const options =
    piece.workshopId && !workshops.some((w) => w.id === piece.workshopId)
      ? [
          { id: piece.workshopId, name: piece.workshopName ?? "Taller actual" },
          ...workshops,
        ]
      : workshops;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const id = value === NO_WORKSHOP ? null : value;
      const result = await assignWorkshop(null, [piece.id], id);
      if ("error" in result) return void toast.error(result.error);
      toast.success(`Taller de ${piece.code} actualizado.`);
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(current);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("size-7 print:hidden", className)}
          aria-label={`${action} de ${piece.code}`}
          title={action}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Taller de {piece.code}</DialogTitle>
            <DialogDescription>
              Elige el taller que restaurará esta pieza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={selectId}>Taller</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WORKSHOP}>Sin taller</SelectItem>
                {options.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || value === current}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Guardar taller
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Campo "Taller" del detalle de la pieza: el nombre y, para logística y el admin, el
 * lápiz para asignarlo o cambiarlo, salvo si la pieza está en el taller, entregada o
 * en un estado final (`WORKSHOP_LOCKED`).
 */
export function PieceWorkshopField({
  piece,
  workshops,
  canAssign,
}: {
  piece: {
    id: string;
    code: string;
    status: PieceStatus;
    workshopId: string | null;
    workshopName: string | null;
  };
  workshops: WorkshopOption[];
  /** El rol puede asignar el taller (`piezas.asignar-taller`). */
  canAssign: boolean;
}) {
  const name = piece.workshopName ?? (
    <span className="text-muted-foreground">Sin taller</span>
  );
  if (!canAssign || WORKSHOP_LOCKED.includes(piece.status)) return name;
  return (
    <span className="-my-1.5 inline-flex items-center gap-1">
      {name}
      <WorkshopEditButton piece={piece} workshops={workshops} />
    </span>
  );
}
