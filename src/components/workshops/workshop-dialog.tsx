"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { workshopSchema, type WorkshopInput } from "@/lib/validation/workshops";
import { createWorkshop, updateWorkshop } from "@/server/workshops-actions";

export type WorkshopRow = WorkshopInput & { id: string; active: boolean };

const EMPTY: WorkshopInput = {
  name: "",
  contactName: "",
  phone: "",
  address: "",
  notes: "",
};

const FIELDS: {
  name: Exclude<keyof WorkshopInput, "notes">;
  label: string;
  type?: string;
}[] = [
  { name: "name", label: "Nombre" },
  { name: "contactName", label: "Persona de contacto" },
  { name: "phone", label: "Teléfono", type: "tel" },
  { name: "address", label: "Dirección" },
];

/** Crea un taller o, con `workshop`, edita uno existente. */
export function WorkshopDialog({
  workshop,
  trigger,
}: {
  workshop?: WorkshopRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const values: WorkshopInput = workshop
    ? {
        name: workshop.name,
        contactName: workshop.contactName,
        phone: workshop.phone,
        address: workshop.address,
        notes: workshop.notes,
      }
    : EMPTY;
  const form = useForm<WorkshopInput>({
    resolver: zodResolver(workshopSchema),
    defaultValues: values,
  });

  const onSubmit = form.handleSubmit((input) => {
    setError(null);
    startTransition(async () => {
      const result = workshop
        ? await updateWorkshop(workshop.id, input)
        : await createWorkshop(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        workshop ? "Taller actualizado." : `Taller "${input.name}" creado.`,
      );
      setOpen(false);
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) form.reset(values);
        setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {workshop ? "Editar taller" : "Nuevo taller"}
          </DialogTitle>
          <DialogDescription>Solo el nombre es obligatorio.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <FormAlert>{error}</FormAlert> : null}
            {FIELDS.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={f.type ?? "text"}
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : workshop ? "Guardar" : "Crear taller"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
