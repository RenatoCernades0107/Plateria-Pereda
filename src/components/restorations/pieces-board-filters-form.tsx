"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

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
  parsePieceBoardFilters,
  pieceBoardHref,
  PIECE_BOARD_SORT_LABELS,
  PIECE_BOARD_SORTS,
  type PieceBoardFilters,
  type PieceBoardSort,
} from "@/domain/piece-board-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import { PIECE_LOCATION_LABELS } from "@/domain/restoration-status";

/**
 * Filtros de la vista de piezas (se guardan en la URL). Urgentes, listas para
 * entregar y muchos días en el taller van en los atajos de un clic
 * ("Mostrar solo", `FilterChips`), no aquí, para no repetir filtros. Se aplican
 * solos al escribir o elegir y conservan los atajos activos; "Limpiar" quita todo.
 * "Ordenar por" vale para la tabla y para cada columna del kanban (por defecto, por
 * guía: la más reciente primero).
 */
export function PiecesBoardFiltersForm({
  filters,
  workshops,
  showClient = true,
  showPrice = true,
}: {
  filters: PieceBoardFilters;
  workshops: { id: string; name: string }[];
  /** Logística no ve clientes: la búsqueda no los menciona. */
  showClient?: boolean;
  /** Sin ver el precio de venta, no se ordena por él. */
  showPrice?: boolean;
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

  return (
    <form
      aria-label="Filtros de piezas"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_repeat(4,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
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
      <FilterFormActions
        pending={pending}
        onReset={() =>
          reset({ ...parsePieceBoardFilters({}), view: filters.view })
        }
      />
    </form>
  );
}
