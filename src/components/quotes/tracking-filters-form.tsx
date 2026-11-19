"use client";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveFilters } from "@/components/use-live-filters";
import { QUOTE_STATUS_LABELS } from "@/domain/quote";
import {
  QUOTE_WORK_LOCATION_LABELS,
  QUOTE_WORK_LOCATIONS,
} from "@/domain/quote-tracking";
import {
  NO_WORKSHOP,
  parseTrackingFilters,
  TRACKING_STATUS_FILTERS,
  trackingFiltersHref,
  type TrackingFilters,
} from "@/domain/quote-tracking-filters";

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
      <FilterMulti
        id="filtro-estado"
        label="Estado"
        value={state.status}
        options={TRACKING_STATUS_FILTERS.map((status) => ({
          value: status,
          label: QUOTE_STATUS_LABELS[status],
        }))}
        onChange={(status) => update({ status })}
      />
      <FilterMulti
        id="filtro-taller"
        label="Taller"
        value={
          state.noWorkshop
            ? [...state.workshopIds, NO_WORKSHOP]
            : state.workshopIds
        }
        options={[
          { value: NO_WORKSHOP, label: "Sin taller" },
          ...workshops.map((w) => ({ value: w.id, label: w.name })),
        ]}
        onChange={(ids) =>
          update({
            noWorkshop: ids.includes(NO_WORKSHOP),
            workshopIds: ids.filter((id) => id !== NO_WORKSHOP),
          })
        }
      />
      <FilterMulti
        id="filtro-ubicacion"
        label="Ubicación"
        allLabel="Todas"
        value={state.location}
        options={QUOTE_WORK_LOCATIONS.map((l) => ({
          value: l,
          label: QUOTE_WORK_LOCATION_LABELS[l],
        }))}
        onChange={(location) => update({ location })}
      />
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parseTrackingFilters({}))}
      />
    </form>
  );
}
