"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CATALOGS, type PieceCatalogKind } from "@/domain/catalogs";
import { cn } from "@/lib/utils";

export type CatalogOption = {
  id: string;
  name: string;
  price: number | null;
  /** Los desactivados solo se muestran si la pieza ya los tiene. */
  active?: boolean;
};

export type PickedOption = { id: string; name: string };

/**
 * Buscador del catálogo para la pieza: servicios o materiales (uno o varios). Solo
 * elige: lo que falta lo agrega el admin en Configuración.
 */
export function CatalogCombobox({
  id,
  kind,
  options,
  value,
  onChange,
  multiple = false,
  disabled = false,
  placeholder,
  fallbackLabel,
  ...aria
}: {
  id?: string;
  kind: PieceCatalogKind;
  options: readonly CatalogOption[];
  /** Ids elegidos, en orden. */
  value: readonly string[];
  onChange: (picked: PickedOption[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  placeholder: string;
  /** Texto si el id elegido no está en las opciones (p. ej. un nombre antiguo). */
  fallbackLabel?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const visible = options.filter(
    (o) => o.active !== false || value.includes(o.id),
  );
  const selected = value
    .map((v) => options.find((o) => o.id === v))
    .filter((o): o is CatalogOption => Boolean(o));

  const label =
    selected.length > 0
      ? selected.map((o) => o.name).join(", ")
      : fallbackLabel || placeholder;

  const toPicked = (list: readonly CatalogOption[]) =>
    list.map(({ id, name }) => ({ id, name }));

  function pick(option: CatalogOption) {
    setSearch("");
    if (!multiple) {
      onChange(toPicked([option]));
      setOpen(false);
      return;
    }
    onChange(
      toPicked(
        value.includes(option.id)
          ? selected.filter((o) => o.id !== option.id)
          : [...selected, option],
      ),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          {...aria}
        >
          <span
            className={cn(
              "truncate",
              selected.length === 0 &&
                !fallbackLabel &&
                "text-muted-foreground",
            )}
          >
            {label}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Buscar…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              No existe ese {CATALOGS[kind].singular}. El administrador puede
              agregarlo en Configuración.
            </CommandEmpty>
            <CommandGroup>
              {visible.map((o) => {
                const isSelected = value.includes(o.id);
                return (
                  <CommandItem
                    key={o.id}
                    value={`${o.name} ${o.id}`}
                    data-checked={isSelected}
                    onSelect={() => pick(o)}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    {o.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {multiple && value.length > 0 ? (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange([])}
              >
                Quitar todos
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
