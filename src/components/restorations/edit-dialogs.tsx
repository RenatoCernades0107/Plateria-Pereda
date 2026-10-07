"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import {
  useForm,
  useWatch,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { TextField } from "@/components/clients/form-fields";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_DEPOSIT_PERCENT,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  toDecimalString,
  type PaymentType,
} from "@/domain/money";
import type { PieceEditableField } from "@/domain/restoration-edit";
import {
  pieceSchema,
  restorationEditSchema,
  type PieceFormInput,
} from "@/lib/validation/restorations";
import {
  addPiece,
  updatePiece,
  updateRestoration,
  type ContactChoice,
} from "@/server/restorations/actions";
import type { PieceDetail } from "@/server/restorations/queries";

import { EMPTY_PIECE } from "./restoration-form";
import {
  PieceFields,
  type CatalogOption,
  type WorkshopOption,
} from "./piece-fields";

const NONE = "ninguno";

type RestorationValues = {
  contactId: string | null;
  paymentType: PaymentType;
  depositPercent: string;
  notes: string;
};

/** Edición de contacto, tipo y % de adelanto y notas (no tocan Shopify, P12). */
export function EditRestorationDialog({
  restorationId,
  initial,
  contacts,
}: {
  restorationId: string;
  initial: {
    contactId: string | null;
    paymentType: PaymentType;
    depositPercent: number | null;
    notes: string;
  };
  /** Contactos de la empresa; null si el cliente es una persona. */
  contacts: ContactChoice[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<RestorationValues>({
    resolver: zodResolver(restorationEditSchema as never),
    defaultValues: {
      contactId: initial.contactId,
      paymentType: initial.paymentType,
      depositPercent: String(initial.depositPercent ?? DEFAULT_DEPOSIT_PERCENT),
      notes: initial.notes,
    },
  });
  const paymentType = useWatch({ control: form.control, name: "paymentType" });

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await updateRestoration(restorationId, form.getValues());
      if ("error" in result) return setError(result.error);
      toast.success("Restauración actualizada.");
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar restauración</DialogTitle>
          <DialogDescription>
            El cliente no se cambia una vez registrada la restauración.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <FormAlert>{error}</FormAlert> : null}
            {contacts ? (
              <FormField
                control={form.control}
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacto</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) =>
                        field.onChange(v === NONE ? null : v)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin contacto</SelectItem>
                        {contacts.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="paymentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de pago</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PAYMENT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {paymentType === "a_cuenta" ? (
                <TextField
                  form={form}
                  name="depositPercent"
                  label="Adelanto (%)"
                  inputMode="numeric"
                />
              ) : null}
            </div>
            <TextField form={form} name="notes" label="Notas" multiline />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function pieceDefaults(piece: PieceDetail): PieceFormInput {
  return {
    workshopId: piece.workshopId,
    description: piece.description,
    measure: piece.measure,
    material: { id: piece.materialId, name: piece.materialName },
    service: { id: piece.serviceId, name: piece.serviceName },
    weight: piece.weightGrams === null ? "" : String(piece.weightGrams),
    price: piece.priceCents === null ? "" : toDecimalString(piece.priceCents),
    urgent: piece.urgent,
    notes: piece.notes,
  };
}

/** Alta de una pieza en una restauración existente o edición de una pieza. */
export function PieceDialog({
  restorationId,
  piece,
  editable,
  priceHint,
  workshops,
  materials,
  services,
}: {
  restorationId: string;
  /** Sin pieza: agregar una nueva. */
  piece?: PieceDetail;
  editable?: readonly PieceEditableField[];
  priceHint?: string;
  workshops: WorkshopOption[];
  materials: CatalogOption[];
  services: CatalogOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<PieceFormInput>({
    resolver: zodResolver(pieceSchema as never),
    defaultValues: piece ? pieceDefaults(piece) : structuredClone(EMPTY_PIECE),
  });

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const values = form.getValues();
      const result = piece
        ? await updatePiece(piece.id, values)
        : await addPiece(restorationId, values);
      if ("error" in result) return setError(result.error);
      toast.success(piece ? "Pieza actualizada." : "Pieza agregada.");
      if (!piece) form.reset(structuredClone(EMPTY_PIECE));
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {piece ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar pieza ${piece.code}`}
          >
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button variant="outline">
            <Plus />
            Agregar pieza
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {piece ? `Editar ${piece.code}` : "Agregar pieza"}
          </DialogTitle>
          <DialogDescription>
            {piece
              ? "Los cambios quedan en el historial."
              : "La pieza nueva entra como Registrada; llega a Shopify cuando se aprueba."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <PieceFields
              form={form as unknown as UseFormReturn<FieldValues>}
              workshops={workshops}
              materials={materials}
              services={services}
              editable={editable}
              priceHint={priceHint}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Guardando…"
                  : piece
                    ? "Guardar cambios"
                    : "Agregar pieza"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
