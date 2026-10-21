"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DeleteResult = { ok: true } | { error: string };

/**
 * Confirma y borra un ítem (material, servicio, método de pago, taller o usuario). Si
 * está en uso la BD lo rechaza y el aviso (que sugiere desactivarlo) se muestra aquí
 * mismo, sin cerrar el diálogo.
 */
export function ConfirmDeleteDialog({
  title,
  name,
  hint,
  onConfirm,
  trigger,
}: {
  /** "Eliminar taller", "Eliminar usuario"… */
  title: string;
  name: string;
  /** Cuándo no se puede eliminar, p. ej. "Si alguna pieza ya lo usa…". */
  hint: string;
  onConfirm: () => Promise<DeleteResult>;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`"${name}" fue eliminado.`);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            ¿Eliminar &quot;{name}&quot;? No se puede deshacer. {hint}
          </DialogDescription>
        </DialogHeader>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
