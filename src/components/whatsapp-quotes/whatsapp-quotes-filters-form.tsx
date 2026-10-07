"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import {
  parseWhatsappQuoteFilters,
  WHATSAPP_QUOTE_STATUS_LABELS,
  WHATSAPP_QUOTE_STATUSES,
  whatsappQuoteFiltersHref,
  type WhatsappQuoteFilters,
} from "@/domain/whatsapp-quotes";

const ALL = "todos";

/** Búsqueda y filtros del listado de cotizaciones de WhatsApp (se guardan en la URL). */
export function WhatsappQuotesFiltersForm({
  filters,
}: {
  filters: WhatsappQuoteFilters;
}) {
  const router = useRouter();
  const [state, setState] = useState(filters);
  const set = (patch: Partial<WhatsappQuoteFilters>) =>
    setState((s) => ({ ...s, ...patch }));

  return (
    <form
      aria-label="Filtros de cotizaciones de WhatsApp"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_repeat(2,minmax(0,1fr))_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        router.push(whatsappQuoteFiltersHref(state, { page: 1 }));
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="filtro-texto">
          Código, cliente, teléfono o pieza cotizada
        </Label>
        <Input
          id="filtro-texto"
          type="search"
          value={state.q}
          maxLength={100}
          placeholder="p. ej. fuente ovalada"
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          value={state.status ?? ALL}
          onValueChange={(v) =>
            set({
              status: v === ALL ? null : (v as WhatsappQuoteFilters["status"]),
            })
          }
        >
          <SelectTrigger id="filtro-estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {WHATSAPP_QUOTE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {WHATSAPP_QUOTE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
      <div className="flex items-end gap-2">
        <Button type="submit">Filtrar</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(whatsappQuoteFiltersHref(parseWhatsappQuoteFilters({})))
          }
        >
          Limpiar
        </Button>
      </div>
    </form>
  );
}
