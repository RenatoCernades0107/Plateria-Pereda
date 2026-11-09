"use client";

import { Hammer, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_WORKSHOP_NOTES } from "@/domain/quote-workshop-pdf";
import { setQuoteWorkshopNotes } from "@/server/quotes/actions";

/**
 * Instrucciones para el taller de la cotización: no las ve el cliente, van en la orden
 * para taller (PDF). Se editan en cualquier estado.
 */
export function QuoteWorkshopNotes({
  quoteId,
  notes,
}: {
  quoteId: string;
  notes: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = useId();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setQuoteWorkshopNotes(quoteId, value);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Instrucciones para taller guardadas.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby={`${fieldId}-title`}
      className="space-y-2 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={`${fieldId}-title`}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Hammer className="text-muted-foreground size-4" aria-hidden />
          Instrucciones para taller
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(notes);
            setError(null);
            setOpen(true);
          }}
        >
          <Pencil aria-hidden />
          {notes ? "Editar" : "Agregar"}
        </Button>
      </div>
      {notes ? (
        <p className="text-sm whitespace-pre-line">{notes}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Sin instrucciones. Van en el PDF para taller; el cliente no las ve.
        </p>
      )}
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instrucciones para taller</DialogTitle>
            <DialogDescription>
              Van en el PDF para taller, no en la cotización del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId}>Instrucciones</Label>
            <Textarea
              id={fieldId}
              rows={6}
              maxLength={MAX_WORKSHOP_NOTES}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Acabado, empaque, medidas, fechas internas…"
            />
            <p className="text-muted-foreground text-right text-xs">
              {value.length}/{MAX_WORKSHOP_NOTES}
            </p>
          </div>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
