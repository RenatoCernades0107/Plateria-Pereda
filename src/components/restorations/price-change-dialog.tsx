"use client";

import { Tag } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseMoney } from "@/domain/money";
import { changePiecePrice } from "@/server/restorations/status-actions";
import type { PieceDetail } from "@/server/restorations/queries";

/**
 * Cambio de precio con la orden de Shopify creada (Paso 9.2, P12): solo admin y con
 * motivo. La orden se edita sola (job `order.edit`).
 */
export function PriceChangeDialog({
  restorationId,
  piece,
}: {
  restorationId: string;
  piece: PieceDetail;
}) {
  const current = piece.priceCents ?? 0;
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState((current / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const cents = parseMoney(price);
    if (cents === null)
      return setError("Ingresa un monto válido (hasta 2 decimales).");
    if (cents === current) return setError("El precio es el mismo.");
    if (!reason.trim())
      return setError("Escribe el motivo del cambio de precio.");
    startTransition(async () => {
      const result = await changePiecePrice(
        restorationId,
        piece.id,
        cents,
        reason,
      );
      if ("error" in result) return setError(result.error);
      toast.success("Precio cambiado. La orden de Shopify se actualizará.");
      setReason("");
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPrice((current / 100).toFixed(2));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tag />
          Cambiar precio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Cambiar precio de {piece.code}</DialogTitle>
            <DialogDescription>
              Precio actual: {formatCents(current)}. La orden de Shopify se
              actualiza con el nuevo precio y el motivo queda en el historial.
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="space-y-2">
            <Label htmlFor={`precio-${piece.id}`}>Nuevo precio (S/)</Label>
            <Input
              id={`precio-${piece.id}`}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`motivo-${piece.id}`}>Motivo (obligatorio)</Label>
            <Textarea
              id={`motivo-${piece.id}`}
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Guardar precio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
