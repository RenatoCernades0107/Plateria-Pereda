"use client";

import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { IGV_CHOICE_LABELS } from "@/domain/igv";

/**
 * "¿El precio incluye IGV?" (P13): dos opciones sin valor por defecto, para que se
 * responda siempre. El valor del formulario es "si", "no" o "" (sin responder).
 */
export function IgvField<T extends FieldValues>({
  form,
  name,
  disabled = false,
  hint,
}: {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  disabled?: boolean;
  /** Texto de ayuda (p. ej., por qué no se puede cambiar). */
  hint?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="text-sm leading-none font-medium">
              ¿El precio incluye IGV?
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {(["si", "no"] as const).map((value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 text-sm has-[:disabled]:opacity-60"
                >
                  <input
                    type="radio"
                    className="accent-primary size-4"
                    name={field.name}
                    value={value}
                    checked={field.value === value}
                    onChange={() => field.onChange(value)}
                    onBlur={field.onBlur}
                  />
                  {IGV_CHOICE_LABELS[value]}
                </label>
              ))}
            </div>
            {hint ? (
              <p className="text-muted-foreground text-sm">{hint}</p>
            ) : null}
          </fieldset>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
