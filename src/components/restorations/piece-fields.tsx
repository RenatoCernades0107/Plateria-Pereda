"use client";

import {
  useWatch,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";

import { TextField } from "@/components/clients/form-fields";
import {
  FormControl,
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
import {
  WORKSHOP_HINT,
  type PieceEditableField,
} from "@/domain/restoration-edit";

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
 * cambiar según `editableFields()` (Paso 7.7). Orden pedido por la Platería: primero
 * la descripción junto a las notas de la pieza, luego el servicio (obligatorio),
 * material, peso, medida y precio (opcionales) en una sola fila y al final taller y
 * urgente. Quien no puede cambiar el taller (ventas, D60) lo ve como texto. El
 * precio de venta no sale del servicio: es opcional ("Por definir") y solo lo asigna el
 * admin (D58); en las cotizaciones de WhatsApp es el precio cotizado y también es
 * opcional ("Por definir").
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
  workshopName,
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
  /** Nombre del taller ya asignado (puede estar desactivado y no venir en `workshops`). */
  workshopName?: string | null;
}) {
  const off = (field: PieceEditableField) =>
    editable ? !editable.includes(field) : false;
  const path = (name: string) => `${prefix}${name}` as Path<FieldValues>;
  const workshopId = useWatch({
    control: form.control,
    name: path("workshopId"),
  }) as string | null | undefined;
  const currentWorkshop = workshopId
    ? (workshops.find((w) => w.id === workshopId)?.name ??
      workshopName ??
      "Asignado")
    : "Sin asignar";

  return (
    <div className="space-y-4">
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
      <CatalogField
        form={form}
        prefix={prefix}
        name="service"
        label="Servicio"
        options={services}
        disabled={off("service")}
      />
      <div className="space-y-2">
        {/* Los cuatro datos cortos en una fila (2 en tablet, 1 en móvil); `items-start`
            mantiene las etiquetas alineadas aunque un campo muestre su error. */}
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <TextField
            form={form}
            name={path("price")}
            label="Precio (S/)"
            inputMode="numeric"
            disabled={off("price")}
            placeholder={pricePlaceholder}
          />
        </div>
        {/* Debajo de la fila completa para no desalinear los campos. */}
        {off("price") && priceHint ? (
          <p className="text-muted-foreground text-sm">{priceHint}</p>
        ) : null}
      </div>
      {showWorkshop || showUrgent ? (
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          {showWorkshop && off("workshopId") ? (
            <div className="space-y-2" data-testid="taller-solo-lectura">
              <p className="text-sm leading-none font-medium">Taller</p>
              <p className="flex h-9 items-center text-sm">{currentWorkshop}</p>
              {/* Solo el taller está bloqueado: es ventas (D60). */}
              {!off("description") ? (
                <p className="text-muted-foreground text-sm">{WORKSHOP_HINT}</p>
              ) : null}
            </div>
          ) : showWorkshop ? (
            <FormField
              control={form.control}
              name={path("workshopId")}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taller</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
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
