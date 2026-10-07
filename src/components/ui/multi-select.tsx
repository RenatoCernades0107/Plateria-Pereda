"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption<T extends string> = { value: T; label: string };

/** Resumen del botón: "Todos", la etiqueta si hay una o "N seleccionados". */
export function multiSelectSummary<T extends string>(
  options: readonly MultiSelectOption<T>[],
  value: readonly T[],
  allLabel = "Todos",
) {
  if (value.length === 0) return allLabel;
  if (value.length === 1)
    return options.find((o) => o.value === value[0])?.label ?? "1 seleccionado";
  return `${value.length} seleccionados`;
}

/** Lista desplegable de selección múltiple ([] = sin filtro). */
export function MultiSelect<T extends string>({
  id,
  options,
  value,
  onChange,
  allLabel = "Todos",
}: {
  id?: string;
  options: readonly MultiSelectOption<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (item: T) =>
    onChange(
      value.includes(item) ? value.filter((v) => v !== item) : [...value, item],
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {multiSelectSummary(options, value, allLabel)}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((o) => {
                const selected = value.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    data-checked={selected}
                    onSelect={() => toggle(o.value)}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {value.length > 0 ? (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange([])}
              >
                Limpiar selección
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
