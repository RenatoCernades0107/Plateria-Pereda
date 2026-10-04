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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CATALOGS, type CatalogKind } from "@/domain/catalogs";
import {
  catalogItemSchema,
  type CatalogItemFormInput,
  type CatalogItemInput,
} from "@/lib/validation/catalogs";
import {
  createCatalogItem,
  updateCatalogItem,
} from "@/server/catalogs-actions";

export type CatalogItemRow = {
  id: string;
  name: string;
  price: number | null;
  active: boolean;
};

/** Crea un ítem del catálogo o, con `item`, lo edita. */
export function CatalogItemDialog({
  kind,
  item,
  trigger,
}: {
  kind: CatalogKind;
  item?: CatalogItemRow;
  trigger: React.ReactNode;
}) {
  const catalog = CATALOGS[kind];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const values: CatalogItemFormInput = {
    name: item?.name ?? "",
    price: item?.price?.toFixed(2) ?? "",
  };
  const form = useForm<CatalogItemFormInput, unknown, CatalogItemInput>({
    resolver: zodResolver(catalogItemSchema),
    defaultValues: values,
  });

  // La acción vuelve a validar, así que recibe el texto tal como se escribió.
  const onSubmit = form.handleSubmit(() => {
    setError(null);
    const input = form.getValues();
    startTransition(async () => {
      const result = item
        ? await updateCatalogItem(kind, item.id, input)
        : await createCatalogItem(kind, input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        item ? "Cambios guardados." : `"${input.name.trim()}" agregado.`,
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
            {item ? `Editar ${catalog.singular}` : `Nuevo ${catalog.singular}`}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {catalog.hasPrice ? (
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio sugerido (S/)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Opcional.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : item ? "Guardar" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
