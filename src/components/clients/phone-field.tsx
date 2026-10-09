"use client";

import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

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
  COUNTRIES,
  countryByIso,
  flagOf,
  joinPhone,
  splitPhone,
} from "@/domain/countries";

/**
 * Teléfono con selector de país (+51 por defecto). El formulario guarda el número
 * completo ("+51 999888777"); el esquema zod lo normaliza a E.164.
 */
export function PhoneField<T extends FieldValues>({
  form,
  name,
  label = "Teléfono",
}: {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const value = String(field.value ?? "");
        const { iso, national } = splitPhone(value);
        const country = countryByIso(iso);
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="flex gap-2">
              <Select
                value={iso}
                onValueChange={(next) =>
                  field.onChange(joinPhone(next, national))
                }
              >
                <SelectTrigger
                  className="w-28 shrink-0"
                  aria-label="Código de país"
                >
                  <SelectValue>
                    {flagOf(country.iso)} +{country.dial}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.iso} value={c.iso}>
                      {flagOf(c.iso)} {c.name} (+{c.dial})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormControl>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={national}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Si pegan un número con "+código", se separa el país.
                    const next = raw.trim().startsWith("+")
                      ? splitPhone(raw, iso)
                      : { iso, national: raw };
                    field.onChange(joinPhone(next.iso, next.national));
                  }}
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
