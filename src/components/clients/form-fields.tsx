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
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_LABELS, PERSON_DOCUMENT_TYPES } from "@/domain/documents";

const NO_DOCUMENT = "ninguno";

/** Campo de texto de los formularios de clientes y contactos. */
export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  type = "text",
  inputMode,
  multiline = false,
  disabled = false,
}: {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "email";
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <Textarea
                rows={2}
                {...field}
                disabled={disabled}
                value={String(field.value ?? "")}
              />
            ) : (
              <Input
                type={type}
                inputMode={inputMode}
                autoComplete="off"
                {...field}
                disabled={disabled}
                value={String(field.value ?? "")}
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Tipo de documento de una persona (o "Sin documento"). */
export function DocumentTypeField<T extends FieldValues>({
  form,
  name,
}: {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tipo de documento</FormLabel>
          <Select
            value={field.value ?? NO_DOCUMENT}
            onValueChange={(v) => field.onChange(v === NO_DOCUMENT ? null : v)}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NO_DOCUMENT}>Sin documento</SelectItem>
              {PERSON_DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
