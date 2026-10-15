"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";
import {
  createCatalogOption,
  type PieceCatalogKind,
} from "@/server/catalogs-actions";

export type CatalogOption = {
  id: string;
  name: string;
  price: number | null;
  /** Los desactivados solo se muestran si la pieza ya los tiene. */
  active?: boolean;
};

export type PickedOption = { id: string; name: string };

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/**
 * Buscador del catálogo para la pieza: servicio (uno) o materiales (varios). Si lo
 * buscado no existe se puede crear ahí mismo (admin y ventas); queda en el catálogo
 * para las siguientes piezas.
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
  const [created, setCreated] = useState<CatalogOption[]>([]);
  const [pending, startTransition] = useTransition();

  const known = useMemo(() => {
    const byId = new Map<string, CatalogOption>();
    for (const o of [...options, ...created]) byId.set(o.id, o);
    return [...byId.values()];
  }, [options, created]);
  const visible = known.filter(
    (o) => o.active !== false || value.includes(o.id),
  );
  const selected = value
    .map((v) => known.find((o) => o.id === v))
    .filter((o): o is CatalogOption => Boolean(o));

  const term = normalize(search);
  const canCreate =
    term.length > 0 &&
    !visible.some((o) => o.name.toLowerCase() === term.toLowerCase());

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

  function create() {
    const name = term;
    startTransition(async () => {
      const result = await createCatalogOption(kind, name);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const option: CatalogOption = {
        ...result.option,
        price: null,
        active: true,
      };
      setCreated((list) => [...list, option]);
      setSearch("");
      if (multiple) {
        const rest = selected.filter((o) => o.id !== option.id);
        onChange(toPicked([...rest, option]));
      } else {
        onChange(toPicked([option]));
        setOpen(false);
      }
    });
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
            placeholder="Buscar o crear…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {canCreate ? null : <CommandEmpty>Sin resultados.</CommandEmpty>}
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
            {canCreate ? (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`crear ${term}`}
                  disabled={pending}
                  onSelect={create}
                >
                  <Plus className="size-4" aria-hidden />
                  {pending ? "Creando…" : `Crear «${term}»`}
                </CommandItem>
              </CommandGroup>
            ) : null}
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
