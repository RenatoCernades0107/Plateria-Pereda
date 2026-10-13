"use client";

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { TextField } from "@/components/clients/form-fields";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PieceEditableField } from "@/domain/restoration-edit";

export type CatalogOption = { id: string; name: string; price: number | null };
export type WorkshopOption = { id: string; name: string };

const NONE = "ninguno";

type AnyForm = UseFormReturn<FieldValues>;

/** Material o servicio: sugerencias del catálogo o texto libre (P22). */
function CatalogField({
  form,
  prefix,
  name,
  label,
  options,
  disabled,
}: {
  form: AnyForm;
  prefix: string;
  name: "material" | "service";
  label: string;
  options: CatalogOption[];
  disabled: boolean;
}) {
  const listId = `${prefix.replace(/\W/g, "-")}${name}-opciones`;
  return (
    <FormField
      control={form.control}
      name={`${prefix}${name}.name` as Path<FieldValues>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              list={listId}
              autoComplete="off"
              disabled={disabled}
              {...field}
              value={field.value ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const match = options.find(
                  (o) => o.name.toLowerCase() === value.trim().toLowerCase(),
                );
                field.onChange(value);
                form.setValue(`${prefix}${name}.id`, match?.id ?? null);
              }}
            />
          </FormControl>
          <datalist id={listId}>
            {options.map((o) => (
              <option key={o.id} value={o.name} />
            ))}
          </datalist>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Campos de una pieza (P22, D59). Se usan en el registro (`prefix` = "pieces.0.") y
 * en los diálogos de edición (`prefix` = ""). `editable` limita lo que se puede
 * cambiar según `editableFields()` (Paso 7.7). Orden pedido por la Platería: el
 * servicio (obligatorio), luego material, peso, medida y precio (opcionales), la
 * descripción junto a las notas de la pieza y al final taller y urgente. El precio
 * de venta no sale del servicio: es opcional ("Sin asignar") y solo lo asigna el
 * admin (D58); en las cotizaciones de WhatsApp es el precio cotizado y es
 * obligatorio.
 */
export function PieceFields({
  form,
  prefix = "",
  workshops,
  materials,
  services,
  editable,
  showWorkshop = true,
  showUrgent = true,
  priceHint,
  pricePlaceholder,
}: {
  form: AnyForm;
  prefix?: string;
  workshops: WorkshopOption[];
  materials: CatalogOption[];
  services: CatalogOption[];
  editable?: readonly PieceEditableField[];
  /** Las cotizaciones de WhatsApp no llevan taller ni marca urgente (P46). */
  showWorkshop?: boolean;
  showUrgent?: boolean;
  /** Explicación cuando el precio no se puede editar aquí. */
  priceHint?: string;
  /** Texto del precio vacío (p. ej. "Sin asignar" si es opcional). */
  pricePlaceholder?: string;
}) {
  const off = (field: PieceEditableField) =>
    editable ? !editable.includes(field) : false;
  const path = (name: string) => `${prefix}${name}` as Path<FieldValues>;

  return (
    <div className="space-y-4">
      <CatalogField
        form={form}
        prefix={prefix}
        name="service"
        label="Servicio"
        options={services}
        disabled={off("service")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CatalogField
          form={form}
          prefix={prefix}
          name="material"
          label="Material"
          options={materials}
          disabled={off("material")}
        />
        <TextField
          form={form}
          name={path("weight")}
          label="Peso (g)"
          inputMode="numeric"
          disabled={off("weight")}
        />
        <TextField
          form={form}
          name={path("measure")}
          label="Medida"
          disabled={off("measure")}
        />
        <div className="space-y-1">
          <TextField
            form={form}
            name={path("price")}
            label="Precio (S/)"
            inputMode="numeric"
            disabled={off("price")}
            placeholder={pricePlaceholder}
          />
          {off("price") && priceHint ? (
            <FormDescription>{priceHint}</FormDescription>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name={path("description")}
          label="Descripción"
          multiline
          disabled={off("description")}
        />
        <TextField
          form={form}
          name={path("notes")}
          label="Notas de la pieza"
          multiline
          disabled={off("notes")}
        />
      </div>
      {showWorkshop || showUrgent ? (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          {showWorkshop ? (
            <FormField
              control={form.control}
              name={path("workshopId")}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taller</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    disabled={off("workshopId")}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin asignar</SelectItem>
                      {workshops.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          {showUrgent ? (
            <FormField
              control={form.control}
              name={path("urgent")}
              render={({ field }) => (
                <FormItem className="flex h-9 items-center gap-2">
                  <FormControl>
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={Boolean(field.value)}
                      disabled={off("urgent")}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">Urgente</FormLabel>
                </FormItem>
              )}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
