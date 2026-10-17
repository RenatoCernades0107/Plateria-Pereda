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
import { CATALOGS, type CatalogKind } from "@/domain/catalogs";
import { deleteCatalogItem } from "@/server/catalogs-actions";

/**
 * Confirma y borra un ítem del catálogo. Si está en uso en alguna pieza o cotización la
 * BD lo rechaza y el aviso (que sugiere desactivarlo) se muestra aquí mismo.
 */
export function CatalogDeleteDialog({
  kind,
  item,
  trigger,
}: {
  kind: CatalogKind;
  item: { id: string; name: string };
  trigger: React.ReactNode;
}) {
  const catalog = CATALOGS[kind];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCatalogItem(kind, item.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`"${item.name}" fue eliminado.`);
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
          <DialogTitle>Eliminar {catalog.singular}</DialogTitle>
          <DialogDescription>
            ¿Eliminar &quot;{item.name}&quot;? No se puede deshacer. Si alguna
            pieza o cotización ya lo usa, no se podrá eliminar: desactívalo.
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
