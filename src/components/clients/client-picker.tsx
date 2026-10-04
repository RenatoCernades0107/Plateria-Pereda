"use client";

import {
  Building2,
  ChevronsUpDown,
  Loader2,
  Store,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { optionKey, type ClientOption } from "@/domain/client-search";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";
import {
  importShopifyCustomer,
  searchClients,
} from "@/server/clients/search-actions";

import { NewClientDialog } from "./new-client-dialog";

const ICONS = { persona: User, empresa: Building2, contacto: Users } as const;

function details(option: ClientOption): string {
  const parts: string[] = [];
  if (option.source === "shopify") parts.push("Solo en Shopify");
  else if (option.kind === "contacto")
    parts.push(`Contacto de ${option.companyName}`);
  else {
    parts.push(option.kind === "empresa" ? "Empresa" : "Persona");
    if (option.documentType) {
      parts.push(
        `${DOCUMENT_LABELS[option.documentType]} ${option.documentNumber}`,
      );
    }
  }
  if (option.phone) parts.push(formatPhone(option.phone));
  else if (option.email) parts.push(option.email);
  return parts.join(" · ");
}

function OptionRow({ option }: { option: ClientOption }) {
  const Icon = option.source === "shopify" ? Store : ICONS[option.kind];
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-heading truncate font-medium">{option.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {details(option)}
        </span>
      </span>
    </span>
  );
}

/**
 * Buscador de clientes y contactos: busca en el sistema y en Shopify; si se elige uno
 * que solo está en Shopify, se guarda en el sistema antes de devolverlo.
 */
export function ClientPicker({
  value,
  onSelect,
  canCreate = false,
  placeholder = "Buscar cliente por nombre, documento o teléfono…",
  id,
}: {
  value?: ClientOption | null;
  onSelect: (option: ClientOption) => void;
  /** Muestra "Crear nuevo cliente" (solo para quienes pueden registrar clientes). */
  canCreate?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [shopifyUnavailable, setShopifyUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, startImport] = useTransition();
  const request = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda con espera (debounce) de 300 ms desde el cambio del texto.
  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const current = ++request.current;
    if (value.trim().length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const result = await searchClients(value);
        // Ignora respuestas de búsquedas anteriores que llegan tarde.
        if (current !== request.current) return;
        setOptions(result.options);
        setShopifyUnavailable(result.shopifyUnavailable);
      } catch {
        if (current === request.current) {
          toast.error("No se pudo buscar. Intenta de nuevo.");
        }
      } finally {
        if (current === request.current) setLoading(false);
      }
    }, 300);
  };

  // Al elegir se limpia la búsqueda: los resultados guardados quedarían desactualizados
  // (p. ej., un cliente de Shopify que acaba de guardarse en el sistema).
  const finish = (option: ClientOption) => {
    onSelect(option);
    setOpen(false);
    request.current += 1;
    setQuery("");
    setOptions([]);
  };

  const choose = (option: ClientOption) => {
    if (option.source === "local") {
      finish(option);
      return;
    }
    startImport(async () => {
      const result = await importShopifyCustomer(option.shopifyCustomerId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.option.name} se guardó en el sistema.`);
      finish(result.option);
    });
  };

  const local = options.filter((o) => o.source === "local");
  const remote = options.filter((o) => o.source === "shopify");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
          >
            {value ? (
              <OptionRow option={value} />
            ) : (
              <span className="text-muted-foreground truncate">
                {placeholder}
              </span>
            )}
            <ChevronsUpDown
              className="ml-2 size-4 shrink-0 opacity-50"
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-80 p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={search}
              placeholder="Nombre, documento, teléfono o email"
              aria-label="Buscar cliente"
            />
            <CommandList>
              {loading || importing ? (
                <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {importing ? "Guardando cliente de Shopify…" : "Buscando…"}
                </div>
              ) : query.trim().length < 2 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  Escribe al menos 2 caracteres.
                </p>
              ) : (
                <CommandEmpty>No se encontraron clientes.</CommandEmpty>
              )}
              {!loading && local.length > 0 ? (
                <CommandGroup heading="En el sistema">
                  {local.map((option) => (
                    <CommandItem
                      key={optionKey(option)}
                      value={optionKey(option)}
                      onSelect={() => choose(option)}
                    >
                      <OptionRow option={option} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {!loading && remote.length > 0 ? (
                <CommandGroup heading="En Shopify">
                  {remote.map((option) => (
                    <CommandItem
                      key={optionKey(option)}
                      value={optionKey(option)}
                      onSelect={() => choose(option)}
                      disabled={importing}
                    >
                      <OptionRow option={option} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {shopifyUnavailable && !loading ? (
                <p className="text-muted-foreground px-3 py-2 text-xs">
                  Shopify no respondió: se muestran solo los clientes del
                  sistema.
                </p>
              ) : null}
              {canCreate ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="crear-nuevo-cliente"
                      onSelect={() => {
                        setOpen(false);
                        setCreating(true);
                      }}
                    >
                      <UserPlus className="size-4" aria-hidden />
                      Crear nuevo cliente
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {canCreate ? (
        <NewClientDialog
          trigger={null}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(client) =>
            onSelect({
              source: "local",
              kind: client.kind,
              clientId: client.id,
              name: client.displayName,
              documentType: null,
              documentNumber: null,
              phone: null,
              email: null,
              shopifyCustomerId: null,
            })
          }
        />
      ) : null}
    </>
  );
}
