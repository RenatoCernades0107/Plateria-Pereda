"use client";

import { Loader2, Wrench } from "lucide-react";
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
import { assignWorkshop } from "@/server/restorations/status-actions";

import type { WorkshopOption } from "./piece-fields";
import { WORKSHOP_LOCKED } from "./pieces-bulk-bar";

const NO_WORKSHOP = "ninguno";

type WorkshopPiece = {
  id: string;
  code: string;
  status: PieceStatus;
  workshopId: string | null;
};

const plural = (n: number) => (n === 1 ? "1 pieza" : `${n} piezas`);

/**
 * «Cambiar taller» de la tabla de piezas: abre un diálogo para elegir el taller de
 * las piezas elegidas con las casillas (logística y admin, P55). Las que están en el
 * taller, entregadas o cerradas no cambian de taller (`WORKSHOP_LOCKED`) y se avisa;
 * la BD lo valida igual (`assign_piece_workshop`).
 */
export function BulkWorkshopButton({
  chosen,
  workshops,
  onDone,
}: {
  chosen: WorkshopPiece[];
  workshops: WorkshopOption[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(NO_WORKSHOP);
  const [pending, startTransition] = useTransition();

  const eligible = chosen.filter((p) => !WORKSHOP_LOCKED.includes(p.status));
  const locked = chosen.filter((p) => WORKSHOP_LOCKED.includes(p.status));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (eligible.length === 0) return;
    startTransition(async () => {
      const result = await assignWorkshop(
        null,
        eligible.map((p) => p.id),
        value === NO_WORKSHOP ? null : value,
      );
      if ("error" in result) return void toast.error(result.error);
      toast.success(`${plural(eligible.length)}: taller actualizado.`);
      setOpen(false);
      onDone();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Si todas las elegidas comparten taller, se parte de ese.
          const ids = new Set(eligible.map((p) => p.workshopId));
          const [only] = [...ids];
          setValue(ids.size === 1 && only ? only : NO_WORKSHOP);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Wrench />
          Cambiar taller
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Cambiar taller</DialogTitle>
            <DialogDescription>
              {eligible.length === 0
                ? chosen.length === 0
                  ? "Elige con las casillas las piezas a las que quieres cambiar el taller."
                  : "Ninguna de las piezas elegidas puede cambiar de taller ahora."
                : `Elige el taller para ${plural(eligible.length)}: ${eligible
                    .map((p) => p.code)
                    .join(", ")}.`}
            </DialogDescription>
          </DialogHeader>
          {locked.length > 0 ? (
            <p className="text-muted-foreground text-sm" role="note">
              No cambian (en el taller, entregadas o cerradas):{" "}
              {locked.map((p) => p.code).join(", ")}.
            </p>
          ) : null}
          {eligible.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="taller-elegidas">Taller</Label>
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="taller-elegidas" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WORKSHOP}>Sin taller</SelectItem>
                  {workshops.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {eligible.length === 0 ? "Cerrar" : "Cancelar"}
              </Button>
            </DialogClose>
            {eligible.length > 0 ? (
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Guardar taller
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
