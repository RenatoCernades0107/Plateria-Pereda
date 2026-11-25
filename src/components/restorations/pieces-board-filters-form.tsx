"use client";

import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useState } from "react";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { useLiveFilters } from "@/components/use-live-filters";
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
  BOARD_LOCATIONS,
  BOARD_STATUSES,
  NO_WORKSHOP,
  PIECE_DATE_FIELD_LABELS,
  PIECE_DATE_FIELDS,
  parsePieceBoardFilters,
  PIECE_MISSING,
  PIECE_MISSING_LABELS,
  pieceBoardHref,
  PIECE_BOARD_SORT_LABELS,
  PIECE_BOARD_SORTS,
  type PieceBoardFilters,
  type PieceDateField,
  type PieceBoardSort,
} from "@/domain/piece-board-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import { PIECE_LOCATION_LABELS } from "@/domain/restoration-status";

/**
 * Filtros de la vista de piezas (se guardan en la URL). Urgentes, listas para
 * entregar y muchos días en el taller van en los atajos de un clic
 * ("Mostrar solo", `FilterChips`), no aquí, para no repetir filtros. Se aplican
 * solos al escribir o elegir y conservan los atajos activos; "Limpiar" quita todo.
 * Ubicación y fechas (por registro o por entrega) van en "Más filtros", que se abre
 * solo si alguno ya está aplicado. "Ordenar por" vale para la tabla y para cada columna del kanban (por defecto, por
 * guía: la más reciente primero).
 */
export function PiecesBoardFiltersForm({
  filters,
  workshops,
  showClient = true,
  showPrice = true,
  showCost = true,
}: {
  filters: PieceBoardFilters;
  workshops: { id: string; name: string }[];
  /** Logística no ve clientes: la búsqueda no los menciona. */
  showClient?: boolean;
  /** Sin ver el precio de venta, no se ordena por él. */
  showPrice?: boolean;
  /** Sin ver el costo de servicio (solo admin y logística), no se filtra por él. */
  showCost?: boolean;
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => pieceBoardHref(f, { page: 1 }),
  );
  const set = (patch: Partial<PieceBoardFilters>) => update(patch);
  const type = (patch: Partial<PieceBoardFilters>) =>
    update(patch, { debounce: true });
  const sorts = PIECE_BOARD_SORTS.filter((s) => showPrice || s !== "precio");
  const ascending = state.dir === "asc";
  // Los filtros secundarios se ocultan, salvo que alguno ya esté aplicado.
  const hiddenActive = [
    filters.location.length > 0,
    filters.missing.length > 0,
    filters.from !== null,
    filters.to !== null,
  ].filter(Boolean).length;
  const [showMore, setShowMore] = useState(hiddenActive > 0);
  // "Falta asignar": cada opción solo para quien ve ese dato.
  const missingOptions = PIECE_MISSING.filter((m) =>
    m === "precio" ? showPrice : showCost,
  ).map((m) => ({ value: m, label: PIECE_MISSING_LABELS[m] }));

  return (
    <form
      aria-label="Filtros de piezas"
      className="space-y-3"
      onSubmit={submit}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_repeat(3,minmax(0,1fr))]">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-texto">
            {showClient
              ? "Código, descripción o cliente"
              : "Código o descripción"}
          </Label>
          <Input
            id="filtro-texto"
            type="search"
            value={state.q}
            maxLength={100}
            placeholder="Escribe para buscar"
            onChange={(e) => type({ q: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-guia">N.º de guía</Label>
          <Input
            id="filtro-guia"
            type="search"
            inputMode="numeric"
            placeholder="RES-00123"
            value={state.guide}
            maxLength={20}
            onChange={(e) => type({ guide: e.target.value })}
          />
        </div>
        <FilterMulti
          id="filtro-estado"
          label="Estado"
          value={state.status}
          options={BOARD_STATUSES.map((s) => ({
            value: s,
            label: PIECE_STATUS_LABELS[s],
          }))}
          onChange={(status) => set({ status })}
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
            set({
              noWorkshop: ids.includes(NO_WORKSHOP),
              workshopIds: ids.filter((id) => id !== NO_WORKSHOP),
            })
          }
        />
        <div className="space-y-1.5">
          <Label htmlFor="filtro-orden">Ordenar por</Label>
          <div className="flex gap-1">
            <Select
              value={state.sort}
              onValueChange={(v) =>
                set({ sort: v as PieceBoardSort, dir: "desc" })
              }
            >
              <SelectTrigger id="filtro-orden" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PIECE_BOARD_SORT_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={
                ascending
                  ? "Orden ascendente (cambiar a descendente)"
                  : "Orden descendente (cambiar a ascendente)"
              }
              title={ascending ? "Ascendente" : "Descendente"}
              onClick={() => set({ dir: ascending ? "desc" : "asc" })}
            >
              {ascending ? <ArrowUp /> : <ArrowDown />}
            </Button>
          </div>
        </div>
      </div>

      {showMore ? (
        <div
          id="filtros-adicionales"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {missingOptions.length ? (
            <FilterMulti
              id="filtro-falta"
              label="Falta asignar"
              allLabel="Cualquiera"
              value={state.missing}
              options={missingOptions}
              onChange={(missing) => set({ missing })}
            />
          ) : null}
          <FilterMulti
            id="filtro-ubicacion"
            label="Ubicación"
            allLabel="Todas"
            value={state.location}
            options={BOARD_LOCATIONS.map((l) => ({
              value: l,
              label: PIECE_LOCATION_LABELS[l],
            }))}
            onChange={(location) => set({ location })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="filtro-fecha-de">Filtrar fecha por</Label>
            <Select
              value={state.dateField}
              onValueChange={(v) => set({ dateField: v as PieceDateField })}
            >
              <SelectTrigger id="filtro-fecha-de" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIECE_DATE_FIELDS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {PIECE_DATE_FIELD_LABELS[f]}
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
        </div>
      ) : null}

      <FilterFormActions
        pending={pending}
        onReset={() =>
          reset({ ...parsePieceBoardFilters({}), view: filters.view })
        }
      >
        <Button
          type="button"
          variant="outline"
          aria-expanded={showMore}
          aria-controls="filtros-adicionales"
          onClick={() => setShowMore((open) => !open)}
        >
          {showMore ? "Menos filtros" : "Más filtros"}
          {!showMore && hiddenActive > 0 ? ` (${hiddenActive})` : ""}
          <ChevronDown
            aria-hidden
            className={showMore ? "rotate-180" : undefined}
          />
        </Button>
      </FilterFormActions>
    </form>
  );
}
