"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";

/** Filtro de selección múltiple con su etiqueta (`[]` = sin filtro). */
export function FilterMulti<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  id: string;
  label: ReactNode;
  value: readonly T[];
  options: readonly { value: T; label: string }[];
  onChange: (value: T[]) => void;
  allLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <MultiSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        allLabel={allLabel}
      />
    </div>
  );
}
