"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLOSE_TARGET_LABELS,
  RESTORATION_CLOSE_TARGETS,
  type RestorationCloseTarget,
} from "@/domain/restoration-closure";
import { closeRestoration } from "@/server/restorations/status-actions";

/**
 * "Cambiar estado" de la guía: solo a Anulada o Rechazada (los demás estados se
 * calculan de las piezas). Pide confirmación y un motivo, porque anula o rechaza
 * todas las piezas.
 */
export function CloseRestorationMenu({
  restorationId,
  code,
}: {
  restorationId: string;
  code: string;
}) {
  const [target, setTarget] = useState<RestorationCloseTarget | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const labels = target ? CLOSE_TARGET_LABELS[target] : null;

  function confirm() {
    if (!target) return;
    if (!note.trim()) {
      toast.error(
        `Escribe el motivo para ${CLOSE_TARGET_LABELS[target].verb} la restauración.`,
      );
      return;
    }
    startTransition(async () => {
      const result = await closeRestoration(restorationId, target, note);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Restauración ${code}: piezas ${CLOSE_TARGET_LABELS[target].done}.`,
      );
      setTarget(null);
      setNote("");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Cambiar estado
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {RESTORATION_CLOSE_TARGETS.map((t) => (
            <DropdownMenuItem
              key={t}
              variant="destructive"
              onSelect={() => setTarget(t)}
            >
              {CLOSE_TARGET_LABELS[t].action}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels?.action}</DialogTitle>
            <DialogDescription role="alert">
              ¿Seguro? Se van a {labels?.verb} todas las piezas de {code} (las
              ya anuladas, rechazadas o sin arreglo quedan como están). No se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-cierre">Motivo</Label>
            <Textarea
              id="motivo-cierre"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {labels?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
