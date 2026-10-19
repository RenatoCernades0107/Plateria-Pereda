"use client";

import {
  useWatch,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";

import { TextField } from "@/components/clients/form-fields";
import {
  CatalogCombobox,
  type CatalogOption,
} from "@/components/restorations/catalog-combobox";
import {
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
  WORKSHOP_HINT,
  type PieceEditableField,
} from "@/domain/restoration-edit";
import { cn } from "@/lib/utils";

export type { CatalogOption };
export type WorkshopOption = { id: string; name: string };

const NONE = "ninguno";

type AnyForm = UseFormReturn<FieldValues>;

/** Servicios de la pieza: uno o más del catálogo (al menos uno). */
function ServiceField({
  form,
  prefix,
  options,
  disabled,
}: {
  form: AnyForm;
  prefix: string;
  options: CatalogOption[];
  disabled: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={`${prefix}services` as Path<FieldValues>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Servicio</FormLabel>
          <FormControl>
            <CatalogCombobox
              kind="services"
              multiple
              options={options}
              value={(field.value as string[] | undefined) ?? []}
              disabled={disabled}
              placeholder="Selecciona uno o más servicios"
              onChange={(picked) => field.onChange(picked.map((o) => o.id))}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Materiales de la pieza: uno o más del catálogo (o creados en el buscador). */
function MaterialsField({
  form,
  prefix,
  options,
  disabled,
}: {
  form: AnyForm;
  prefix: string;
  options: CatalogOption[];
  disabled: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={`${prefix}materials` as Path<FieldValues>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Material</FormLabel>
          <FormControl>
            <CatalogCombobox
              kind="materials"
              multiple
              options={options}
              value={(field.value as string[] | undefined) ?? []}
              disabled={disabled}
              placeholder="Sin material"
              onChange={(picked) => field.onChange(picked.map((o) => o.id))}
            />
          </FormControl>
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
 * la descripción junto a las notas de la pieza, luego los servicios (al menos uno),
 * cantidad, materiales, peso, medida y precio (opcionales) en una sola fila y al final taller y
 * urgente. Servicios y materiales se eligen con un buscador del catálogo (uno o
 * más de cada uno) y los que faltan los agrega el admin en Configuración. Quien no puede cambiar el taller (ventas, D60) lo ve como texto. El
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
  showPrice = true,
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
  /** Guía interna u observada: no se cobra, la pieza no lleva precio. */
  showPrice?: boolean;
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
      <ServiceField
        form={form}
        prefix={prefix}
        options={services}
        disabled={off("service")}
      />
      <div className="space-y-2">
        {/* Los datos cortos en una fila (2 en tablet, 1 en móvil); `items-start`
            mantiene las etiquetas alineadas aunque un campo muestre su error. La
            cantidad es angosta. */}
        <div
          className={cn(
            "grid items-start gap-3 sm:grid-cols-2",
            showPrice
              ? "lg:grid-cols-[5rem_minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
              : "lg:grid-cols-[5rem_minmax(0,2fr)_repeat(2,minmax(0,1fr))]",
          )}
        >
          <TextField
            form={form}
            name={path("quantity")}
            label="Cant."
            inputMode="numeric"
            placeholder="1"
            // Mismas reglas que la descripción (la BD las bloquea juntas).
            disabled={off("description")}
          />
          <MaterialsField
            form={form}
            prefix={prefix}
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
          {showPrice ? (
            <TextField
              form={form}
              name={path("price")}
              label="Precio (S/)"
              inputMode="numeric"
              disabled={off("price")}
              placeholder={pricePlaceholder}
            />
          ) : null}
        </div>
        {/* Debajo de la fila completa para no desalinear los campos. */}
        {showPrice && off("price") && priceHint ? (
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
