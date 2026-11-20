"use client";

import { FilterMulti } from "@/components/filter-multi";
import { FilterFormActions } from "@/components/filter-form-actions";
import { useLiveFilters } from "@/components/use-live-filters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HISTORY_STATUSES,
  parsePieceHistoryFilters,
  pieceHistoryHref,
  type PieceHistoryFilters,
} from "@/domain/piece-history-filters";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";

/** Filtros del historial de piezas (se guardan en la URL y se aplican solos). */
export function PiecesHistoryFiltersForm({
  filters,
  workshops,
  showClient = true,
}: {
  filters: PieceHistoryFilters;
  workshops: { id: string; name: string }[];
  /** Logística no ve clientes: la búsqueda no los menciona. */
  showClient?: boolean;
}) {
  const { state, update, reset, submit, pending } = useLiveFilters(
    filters,
    (f) => pieceHistoryHref(f, { page: 1 }),
  );
  const set = (patch: Partial<PieceHistoryFilters>) => update(patch);
  const type = (patch: Partial<PieceHistoryFilters>) =>
    update(patch, { debounce: true });

  return (
    <form
      aria-label="Filtros del historial"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_repeat(4,minmax(0,1fr))_auto]"
      onSubmit={submit}
    >
      <div className="space-y-1.5">
        <Label htmlFor="historial-texto">
          {showClient
            ? "Código, descripción o cliente"
            : "Código o descripción"}
        </Label>
        <Input
          id="historial-texto"
          type="search"
          value={state.q}
          maxLength={100}
          placeholder="Escribe para buscar"
          onChange={(e) => type({ q: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-guia">N.º de guía</Label>
        <Input
          id="historial-guia"
          type="search"
          inputMode="numeric"
          placeholder="RES-00123"
          value={state.guide}
          maxLength={20}
          onChange={(e) => type({ guide: e.target.value })}
        />
      </div>
      <FilterMulti
        id="historial-estado"
        label="Estado"
        value={state.status}
        options={HISTORY_STATUSES.map((s) => ({
          value: s,
          label: PIECE_STATUS_LABELS[s],
        }))}
        onChange={(status) => set({ status })}
      />
      <FilterMulti
        id="historial-taller"
        label="Taller"
        value={state.workshopIds}
        options={workshops.map((w) => ({ value: w.id, label: w.name }))}
        onChange={(workshopIds) => set({ workshopIds })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="historial-desde">Entregada desde</Label>
        <Input
          id="historial-desde"
          type="date"
          value={state.from ?? ""}
          max={state.to ?? undefined}
          onChange={(e) => set({ from: e.target.value || null })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="historial-hasta">Entregada hasta</Label>
        <Input
          id="historial-hasta"
          type="date"
          value={state.to ?? ""}
          min={state.from ?? undefined}
          onChange={(e) => set({ to: e.target.value || null })}
        />
      </div>
      <FilterFormActions
        pending={pending}
        onReset={() => reset(parsePieceHistoryFilters({}))}
      />
    </form>
  );
}
