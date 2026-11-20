"use client";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { useLiveFilters } from "@/components/use-live-filters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseWhatsappQuoteFilters,
  WHATSAPP_QUOTE_STATUS_LABELS,
  WHATSAPP_QUOTE_STATUSES,
  whatsappQuoteFiltersHref,
  type WhatsappQuoteFilters,
} from "@/domain/whatsapp-quotes";

/** Búsqueda y filtros de las cotizaciones de WhatsApp (en la URL; se aplican solos). */
export function WhatsappQuotesFiltersForm({
  filters,
}: {
  filters: WhatsappQuoteFilters;
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => whatsappQuoteFiltersHref(f, { page: 1 }),
  );
  const set = (patch: Partial<WhatsappQuoteFilters>) => update(patch);

  return (
    <form
      aria-label="Filtros de cotizaciones de WhatsApp"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_repeat(2,minmax(0,1fr))_auto]"
      onSubmit={submit}
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
          onChange={(e) => update({ q: e.target.value }, { debounce: true })}
        />
      </div>
      <FilterMulti
        id="filtro-estado"
        label="Estado"
        value={state.status}
        options={WHATSAPP_QUOTE_STATUSES.map((status) => ({
          value: status,
          label: WHATSAPP_QUOTE_STATUS_LABELS[status],
        }))}
        onChange={(status) => set({ status })}
      />
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
        onReset={() => reset(parseWhatsappQuoteFilters({}))}
      />
    </form>
  );
}
