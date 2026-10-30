"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { ClientPicker } from "@/components/clients/client-picker";
import { FilterFormActions } from "@/components/filter-form-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLiveFilters } from "@/components/use-live-filters";
import type { ClientOption } from "@/domain/client-search";
import { QUOTE_STATUS_LABELS } from "@/domain/quote";
import {
  parseQuoteFilters,
  QUOTE_STATUS_FILTERS,
  quoteFiltersHref,
  type QuoteFilters,
} from "@/domain/quote-filters";

const ALL = "todos";

/** Búsqueda y filtros del listado de cotizaciones (en la URL; se aplican solos). */
export function QuotesFiltersForm({
  filters,
  clientName,
  showClient = true,
}: {
  filters: QuoteFilters;
  /** Nombre del cliente filtrado (si hay). */
  clientName: string | null;
  /** Filtro por cliente: logística no ve los clientes. */
  showClient?: boolean;
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => quoteFiltersHref(f, { page: 1 }),
  );
  // Nombre del cliente elegido aquí; el de la URL lo da la página.
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(
    null,
  );
  const client = state.clientId
    ? {
        id: state.clientId,
        name:
          chosen?.id === state.clientId
            ? chosen.name
            : state.clientId === filters.clientId
              ? (clientName ?? "")
              : "",
      }
    : null;
  const set = (patch: Partial<QuoteFilters>) => update(patch);

  const chooseClient = (option: ClientOption) => {
    if (option.source !== "local") return;
    const name = option.kind === "contacto" ? option.companyName : option.name;
    setChosen({ id: option.clientId, name });
    set({ clientId: option.clientId });
  };

  return (
    <form
      aria-label="Filtros de cotizaciones"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filtro-texto">Código o cliente</Label>
        <Input
          id="filtro-texto"
          type="search"
          value={state.q}
          maxLength={100}
          placeholder="Escribe para buscar"
          onChange={(e) => update({ q: e.target.value }, { debounce: true })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          value={state.status ?? ALL}
          onValueChange={(v) =>
            set({ status: v === ALL ? null : (v as QuoteFilters["status"]) })
          }
        >
          <SelectTrigger id="filtro-estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {QUOTE_STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {QUOTE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showClient ? (
        <div className="space-y-1.5">
          <Label htmlFor="filtro-cliente">Cliente</Label>
          {client ? (
            <div className="flex h-9 items-center gap-1 rounded-md border px-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{client.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Quitar filtro de cliente"
                onClick={() => set({ clientId: null })}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <ClientPicker
              id="filtro-cliente"
              placeholder="Todos los clientes"
              onSelect={chooseClient}
            />
          )}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="filtro-desde">Desde</Label>
        <Input
          id="filtro-desde"
          type="date"
          value={state.from ?? ""}
          onChange={(e) => set({ from: e.target.value || null })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-hasta">Hasta</Label>
        <Input
          id="filtro-hasta"
          type="date"
          value={state.to ?? ""}
          onChange={(e) => set({ to: e.target.value || null })}
        />
      </div>
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parseQuoteFilters({}))}
      />
    </form>
  );
}
