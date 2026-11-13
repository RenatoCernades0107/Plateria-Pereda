"use client";

import { FilterFormActions } from "@/components/filter-form-actions";
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
import { QUOTE_STATUS_LABELS } from "@/domain/quote";
import {
  QUOTE_WORK_LOCATION_LABELS,
  QUOTE_WORK_LOCATIONS,
  isQuoteWorkLocation,
} from "@/domain/quote-tracking";
import {
  NO_WORKSHOP,
  parseTrackingFilters,
  TRACKING_STATUS_FILTERS,
  trackingFiltersHref,
  type TrackingFilters,
} from "@/domain/quote-tracking-filters";

const ALL = "todos";

/** Búsqueda y filtros del seguimiento de cotizaciones aprobadas (en la URL). */
export function TrackingFiltersForm({
  filters,
  workshops,
}: {
  filters: TrackingFilters;
  workshops: { id: string; name: string }[];
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => trackingFiltersHref(f, { page: 1 }),
  );
  return (
    <form
      aria-label="Filtros de cotizaciones aprobadas"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto]"
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
            update({
              status: v === ALL ? null : (v as TrackingFilters["status"]),
            })
          }
        >
          <SelectTrigger id="filtro-estado" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {TRACKING_STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {QUOTE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-taller">Taller</Label>
        <Select
          value={state.workshop ?? ALL}
          onValueChange={(v) => update({ workshop: v === ALL ? null : v })}
        >
          <SelectTrigger id="filtro-taller" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value={NO_WORKSHOP}>Sin taller</SelectItem>
            {workshops.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filtro-ubicacion">Ubicación</Label>
        <Select
          value={state.location ?? ALL}
          onValueChange={(v) =>
            update({ location: isQuoteWorkLocation(v) ? v : null })
          }
        >
          <SelectTrigger id="filtro-ubicacion" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {QUOTE_WORK_LOCATIONS.map((l) => (
              <SelectItem key={l} value={l}>
                {QUOTE_WORK_LOCATION_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parseTrackingFilters({}))}
      />
    </form>
  );
}
